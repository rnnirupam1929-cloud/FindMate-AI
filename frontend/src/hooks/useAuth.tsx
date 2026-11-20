import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Api } from "@/services/endpoints";
import { getAccessToken, onAuthChange, signIn as doSignIn, signOut as doSignOut, signUp as doSignUp } from "@/services/auth";
import type { Profile } from "@/types";

interface AuthState {
  user: Profile | null; loading: boolean; sessionExpired: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<"signed-in" | "confirm-email">;
  signOut: () => Promise<void>; refresh: () => Promise<void>;
}
const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setExpired] = useState(false);
  const qc = useQueryClient();

  const refresh = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) { setUser(null); setLoading(false); return; }
    try { setUser(await Api.me()); } catch { setUser(null); }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); onAuthChange(() => void refresh()); }, [refresh]);
  useEffect(() => {
    const h = () => { setUser(null); setExpired(true); qc.clear(); };
    window.addEventListener("findmate:session-expired", h);
    return () => window.removeEventListener("findmate:session-expired", h);
  }, [qc]);

  const value = useMemo<AuthState>(() => ({
    user, loading, sessionExpired, refresh,
    signIn: async (e, p) => { await doSignIn(e, p); setExpired(false); await refresh(); },
    signUp: async (e, p, n) => { const r = await doSignUp(e, p, n); if (r === "signed-in") { setExpired(false); await refresh(); } return r; },
    signOut: async () => { await doSignOut(); qc.clear(); setUser(null); },
  }), [user, loading, sessionExpired, refresh, qc]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}
