import "./style.css";

type Role = "Press" | "Staff" | "Admin";
type Session = { id: string; role: Role };

const ROLE_PATHS: Record<string, Role> = {
  "/press": "Press",
  "/staff": "Staff",
  "/admin": "Admin",
};

const ROLE_HOME: Record<Role, string> = {
  Press: "/press",
  Staff: "/staff",
  Admin: "/admin",
};

function currentPath() {
  const path = window.location.pathname.replace(/\/+$/, "");
  return path === "" ? "/" : path;
}

async function getSession(): Promise<Session | null> {
  const res = await fetch("/api/session");
  if (!res.ok) return null;
  const data = (await res.json()) as { user: Session | null };
  return data.user;
}

function escapeHtml(value: string) {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (char) => replacements[char] ?? char);
}

function bindLogout() {
  document.querySelector<HTMLButtonElement>("#logout")?.addEventListener("click", () => {
    void logout();
  });
}

function render(session: Session | null, error: string | null) {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) return;

  const path = currentPath();
  const required = ROLE_PATHS[path];

  if (session && path === "/") {
    window.location.replace(ROLE_HOME[session.role]);
    return;
  }

  // Anything that is not the root or one of the role workspaces. Do not fall through to
  // whichever role happens to be signed in; show a 404 instead.
  if (path !== "/" && !required) {
    document.title = "404 · Not found";
    app.innerHTML = `
      <main class="card">
        <h1>404</h1>
        <p>No page at <code>${escapeHtml(path)}</code>.</p>
        <button id="home" type="button">${session ? `${escapeHtml(session.role)} workspace` : "Sign in"}</button>
      </main>
    `;
    document.querySelector<HTMLButtonElement>("#home")?.addEventListener("click", () => {
      window.location.assign(session ? ROLE_HOME[session.role] : "/");
    });
    return;
  }

  if (session) {
    if (required && required !== session.role) {
      document.title = "Not authorized";
      app.innerHTML = `
        <main class="card">
          <h1>Not authorized</h1>
          <p>This area is for ${escapeHtml(required)} users. You are signed in as ${escapeHtml(session.role)}.</p>
          <button id="logout" type="button">Sign out</button>
        </main>
      `;
      bindLogout();
      return;
    }

    document.title = `${session.role} workspace`;
    app.innerHTML = `
      <main class="card">
        <h1>${escapeHtml(session.role)} workspace</h1>
        <p>You are signed in as <strong>${escapeHtml(session.id)}</strong>.</p>
        <p>Role: <strong>${escapeHtml(session.role)}</strong></p>
        <button id="logout" type="button">Sign out</button>
      </main>
    `;
    bindLogout();
    return;
  }

  document.title = "Sign in";
  app.innerHTML = `
    <main class="card">
      <h1>Sign in</h1>
      <p>Sign in with the email and password you registered on the auth server.</p>
      ${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ""}
      <button id="login" type="button">Sign in or register</button>
    </main>
  `;
  document.querySelector<HTMLButtonElement>("#login")?.addEventListener("click", () => {
    window.location.assign("/auth/login");
  });
}

async function logout() {
  await fetch("/auth/logout", { method: "POST" });
  void refresh();
}

async function refresh() {
  const session = await getSession();
  render(session, null);
}

async function start() {
  const error = new URLSearchParams(window.location.search).get("error");
  const session = await getSession();
  render(session, error);
}

void start();
