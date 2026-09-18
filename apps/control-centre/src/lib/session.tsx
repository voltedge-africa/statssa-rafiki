import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { Role } from "@voltedge/auth-contract";

import { websiteUrl } from "./env.ts";

export type { Role };

export type Session = {
  id: string;
  role: Role;
};

export const signInUrl = "/auth/login";

type SessionContextValue = {
  session: Session | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/session");
    const data = response.ok
      ? ((await response.json()) as { user: Session | null })
      : { user: null };
    setSession(data.user ?? null);
    setLoading(false);
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/auth/logout", { method: "POST" });
    window.location.assign(websiteUrl());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ session, loading, refresh, signOut }),
    [session, loading, refresh, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}
