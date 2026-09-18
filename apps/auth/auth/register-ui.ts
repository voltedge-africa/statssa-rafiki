import type { PasswordConfig } from "@openauthjs/openauth/provider/password";
import { isRole, ROLES } from "@voltedge/auth-contract";
import { setRole } from "./users.ts";

type Register = PasswordConfig["register"];

function roleSelect(selected?: string) {
  const options = ROLES.map(
    (role) => `<option value="${role}"${role === selected ? " selected" : ""}>${role}</option>`,
  ).join("");
  const placeholder = selected ? "" : ` selected`;
  return (
    `<select data-component="input" name="role" required aria-label="Role">` +
    `<option value="" disabled${placeholder}>Select a role</option>` +
    options +
    `</select>`
  );
}

// The stock PasswordProvider drops any form fields other than email/password/code before it
// calls `success`, and its register state does not carry a role. So we wrap the PasswordUI
// register screen: persist the chosen role keyed by email at the moment the flow advances to
// the code step, and inject the role <select> into the rendered register form.
export function withRole(base: Register): Register {
  return async (req, state, form, error) => {
    const field = form?.get("role");
    const submitted = typeof field === "string" ? field : undefined;
    const role = isRole(submitted) ? submitted : undefined;

    if (state.type === "code" && role) {
      await setRole(state.email, role);
    }

    const response = await base(req, state, form, error);
    if (state.type !== "start") return response;

    const html = await response.text();
    const withSelect = html.replace(
      '<button data-component="button">',
      `${roleSelect(role ?? submitted)}<button data-component="button">`,
    );
    return new Response(withSelect, {
      status: response.status,
      headers: response.headers,
    });
  };
}
