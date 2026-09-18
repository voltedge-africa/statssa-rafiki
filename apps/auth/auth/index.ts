import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { issuer } from "@openauthjs/openauth";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { MemoryStorage } from "@openauthjs/openauth/storage/memory";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { createTransport } from "nodemailer";
import { list, numberOrDefault, optional, orDefault } from "./env.ts";
import { withProviderList } from "./provider-list-ui.ts";
import { withRole } from "./register-ui.ts";
import { subjects } from "@voltedge/auth-contract";
import { theme } from "./theme.ts";
import { getUser } from "./users.ts";

const persistFile = resolve(dirname(fileURLToPath(import.meta.url)), "../.openauth-persist.json");

// Extra hosts (scheme://host) whose redirect URIs this issuer accepts, in addition to
// localhost/127.0.0.1 which OpenAuth allows by default. E.g. a tailnet host while developing.
const allowedHosts = list("AUTH_ALLOWED_ORIGINS").map((origin) => {
  try {
    return new URL(origin).host;
  } catch {
    return origin;
  }
});

function isAllowed(redirectURI: string, req: Request) {
  const { hostname } = new URL(redirectURI);
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;
  // Same-host clients (eg. the website served from this machine over a tailnet) are allowed
  // automatically; AUTH_ALLOWED_ORIGINS covers anything else, like a proxy or extra origin.
  const forwarded = req.headers.get("x-forwarded-host");
  const requestHost = forwarded ?? new URL(req.url).host;
  try {
    if (new URL(`http://${requestHost}`).hostname === hostname) return true;
  } catch {
    // Fall through to the explicit allowlist below.
  }
  return allowedHosts.includes(new URL(redirectURI).host);
}

const smtpUser = optional("SMTP_USER");
const smtpPass = optional("SMTP_PASS");
const smtpPort = numberOrDefault("SMTP_PORT", 1025);

const mailer = createTransport({
  // Dev default is the local Mailpit catcher from docker-compose.yml (see apps/auth/.env.example).
  host: orDefault("SMTP_HOST", "127.0.0.1"),
  port: smtpPort,
  // 465 uses implicit TLS; 2525 and 587 upgrade with STARTTLS after connecting.
  secure: smtpPort === 465,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
});

if (smtpUser && smtpPass) {
  mailer
    .verify()
    .then(() => console.log("[auth] SMTP connection verified"))
    .catch((error: unknown) =>
      console.error("[auth] SMTP verification failed; codes fall back to the console", error),
    );
}

async function sendCode(email: string, code: string) {
  if (!smtpUser || !smtpPass) {
    console.log(`\n[auth] verification code for ${email}: ${code}\n`);
    return;
  }

  try {
    const info = await mailer.sendMail({
      from: orDefault("SMTP_FROM", "Stats SA Rafiki <no-reply@statssa.gov.za>"),
      to: email,
      subject: "Your Stats SA Rafiki verification code",
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
    });

    if (info.rejected.length > 0) {
      console.warn(`[auth] some recipients were rejected for ${email}:`, info.rejected);
    }

    console.log(`[auth] verification code sent to ${email}: ${info.messageId}`);
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { rejected?: unknown };
    switch (err.code) {
      case "ECONNECTION":
      case "ETIMEDOUT":
        console.error(`[auth] SMTP network error for ${email} - retry later: ${err.message}`);
        break;
      case "EAUTH":
        console.error(`[auth] SMTP authentication failed for ${email}: ${err.message}`);
        break;
      case "EENVELOPE":
        // err.rejected is only populated when every recipient was refused.
        console.error(`[auth] invalid envelope for ${email}: ${err.message}`, err.rejected ?? []);
        break;
      default:
        console.error(`[auth] could not email ${email}: ${err.message}`);
    }
    console.log(`\n[auth] verification code for ${email}: ${code}\n`);
  }
}

const passwordUI = PasswordUI({
  sendCode,
  validatePassword: (password) =>
    password.length < 8 ? "Password must be at least 8 characters" : undefined,
  copy: {
    register_title: "Create your account",
    register_description: "Register with your Stats SA email address to continue.",
    register: "Create account",
    register_prompt: "New to Rafiki?",
    login_title: "Welcome back",
    login_description: "Sign in with your Stats SA email address.",
    login: "Sign in",
    login_prompt: "Already registered?",
    change_prompt: "Forgot your password?",
    input_email: "Work email",
    input_password: "Password",
    input_repeat: "Repeat password",
    input_code: "Verification code",
    button_continue: "Continue",
    code_resend: "Resend code",
    code_return: "Back to",
    error_email_taken: "An account with this email already exists.",
    error_invalid_code: "That code is not right. Check your email and try again.",
    error_invalid_email: "Enter a valid email address.",
    error_invalid_password: "That email and password do not match.",
    error_password_mismatch: "The passwords do not match.",
    error_validation_error: "Please choose a stronger password.",
  },
});

const password = withProviderList({
  ...passwordUI,
  register: withRole(passwordUI.register),
});

const app = issuer({
  subjects,
  theme,
  // Dev-only persistence so accounts and signing keys survive a restart.
  // For production pass a durable adapter (DynamoDB, Cloudflare KV), either here or via the
  // OPENAUTH_STORAGE env var, which the issuer reads and lets override this value.
  storage: MemoryStorage({ persist: persistFile }),
  providers: {
    password: PasswordProvider(password),
  },
  async allow(input, req) {
    return isAllowed(input.redirectURI, req);
  },
  async success(ctx, value) {
    if (value.provider === "password") {
      const user = await getUser(value.email);
      return ctx.subject("user", { id: user.id, role: user.role });
    }
    throw new Error("Invalid provider");
  },
});

// Bun serves this default export. Naming the port lets AUTH_PORT from .env (or PORT, from the
// `server` script) control the listener that apps/api and apps/website derive the issuer from.
export default {
  port: numberOrDefault("AUTH_PORT", numberOrDefault("PORT", 3001)),
  fetch: app.fetch,
};
