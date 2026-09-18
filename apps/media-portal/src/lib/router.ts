import { useEffect, useState } from "react";

export function normalizePath(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

/** The current in-app path, kept in sync with the History API. */
export function usePath(): string {
  const [path, setPath] = useState(() => normalizePath(window.location.pathname));

  useEffect(() => {
    const onPop = () => setPath(normalizePath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return path;
}

export function navigate(to: string): void {
  if (normalizePath(to) === normalizePath(window.location.pathname)) return;
  window.history.pushState(null, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function referenceFromPath(path: string): string | null {
  const match = normalizePath(path).match(/^\/requests\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]).toUpperCase() : null;
}
