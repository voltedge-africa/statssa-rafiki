import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { issuer } from "@openauthjs/openauth";
import { PasswordProvider } from "@openauthjs/openauth/provider/password";
import { MemoryStorage } from "@openauthjs/openauth/storage/memory";
import { PasswordUI } from "@openauthjs/openauth/ui/password";
import { withRole } from "./register-ui.ts";
import { subjects } from "./subjects.ts";
import { getUser } from "./users.ts";

const persistFile = resolve(dirname(fileURLToPath(import.meta.url)), "../.openauth-persist.json");

// Extra hosts (scheme://host) whose redirect URIs this issuer accepts, in addition to
// localhost/127.0.0.1 which OpenAuth allows by default. E.g. a tailnet host while developing.
const allowedHosts = (process.env.AUTH_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => {
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

// Replace with a real email send. Until then the verification code is printed to this process's
// console so you can complete registration/login in development.
async function sendCode(email: string, code: string) {
  console.log(`\n[auth] verification code for ${email}: ${code}\n`);
}

const passwordUI = PasswordUI({
  sendCode,
  validatePassword: (password) =>
    password.length < 8 ? "Password must be at least 8 characters" : undefined,
});

export default issuer({
  subjects,
  // Dev-only persistence so accounts and signing keys survive a restart.
  // For production pass a durable adapter (DynamoDB, Cloudflare KV), either here or via the
  // OPENAUTH_STORAGE env var, which the issuer reads and lets override this value.
  storage: MemoryStorage({ persist: persistFile }),
  providers: {
    password: PasswordProvider({
      ...passwordUI,
      register: withRole(passwordUI.register),
    }),
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
