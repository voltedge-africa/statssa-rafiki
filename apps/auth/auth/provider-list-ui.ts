import type { PasswordConfig } from "@openauthjs/openauth/provider/password";

const GOOGLE_ICON = `<span data-slot="icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.86c2.26-2.08 3.58-5.15 3.58-8.81Z"/><path fill="#34a853" d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.86-3c-1.08.72-2.45 1.15-4.08 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"/><path fill="#fbbc05" d="M5.27 14.28a7.2 7.2 0 0 1 0-4.56V6.63H1.29a12 12 0 0 0 0 10.74l3.98-3.09Z"/><path fill="#ea4335" d="M12 4.77c1.76 0 3.35.61 4.6 1.8l3.42-3.42A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.29 6.63l3.98 3.09C6.22 6.88 8.87 4.77 12 4.77Z"/></svg></span>`;

const MICROSOFT_ICON = `<span data-slot="icon"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="9" height="9" fill="#f25022"/><rect x="13" y="2" width="9" height="9" fill="#7fba00"/><rect x="2" y="13" width="9" height="9" fill="#00a4ef"/><rect x="13" y="13" width="9" height="9" fill="#ffb900"/></svg></span>`;

const OIDC_ICON = `<span data-slot="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="8" cy="15" r="3.5"/><path d="M10.6 12.4 19 4m-3.4 3.4L18 9.8M13.8 9.2l2.4 2.4" stroke-linecap="round"/></svg></span>`;

// Placeholder sign-in options. The providers are not configured yet, so the buttons are
// rendered disabled. Remove this block once Google, Microsoft and OIDC are wired up.
const PROVIDER_LIST = [
  '<div data-component="provider-list">',
  '<span data-component="provider-label">or continue with</span>',
  '<div data-component="provider-options">',
  `<button type="button" data-component="button" data-color="ghost" disabled>${GOOGLE_ICON}Google</button>`,
  `<button type="button" data-component="button" data-color="ghost" disabled>${MICROSOFT_ICON}Microsoft</button>`,
  `<button type="button" data-component="button" data-color="ghost" disabled>${OIDC_ICON}OIDC</button>`,
  "</div>",
  "</div>",
].join("");

function injectProviders(html: string) {
  return html.replace(
    '<div data-component="form-footer">',
    `${PROVIDER_LIST}<div data-component="form-footer">`,
  );
}

async function withProviderListResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;
  const html = await response.text();
  return new Response(injectProviders(html), {
    status: response.status,
    headers: response.headers,
  });
}

export function withProviderList(config: PasswordConfig): PasswordConfig {
  return {
    ...config,
    login: async (req, form, error) =>
      withProviderListResponse(await config.login(req, form, error)),
    register: async (req, state, form, error) =>
      withProviderListResponse(await config.register(req, state, form, error)),
    change: async (req, state, form, error) =>
      withProviderListResponse(await config.change(req, state, form, error)),
  };
}
