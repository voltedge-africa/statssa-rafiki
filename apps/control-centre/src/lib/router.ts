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

/** The media request reference for a `/media/:reference` path, or null. */
export function mediaReferenceFromPath(path: string): string | null {
  const match = normalizePath(path).match(/^\/media\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]).toUpperCase() : null;
}

/** The POPIA case reference for a `/cases/:reference` path, or null. */
export function caseReferenceFromPath(path: string): string | null {
  const match = normalizePath(path).match(/^\/cases\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]).toUpperCase() : null;
}

/** The analysis brief id for an `/analysis/:id` path, or null. */
export function briefIdFromPath(path: string): string | null {
  const match = normalizePath(path).match(/^\/analysis\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

/** Move to an in-app path without a full page load. */
export function navigate(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
