/** Auth provider abstraction: Supabase Auth when configured, otherwise the backend's local dev auth (never used in production). */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const usingSupabase = Boolean(url && anon);
export const supabase: SupabaseClient | null = usingSupabase ? createClient(url!, anon!, { auth: { persistSession: true, autoRefreshToken: true } }) : null;

const KEY = "findmate.dev.token";
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export async function getAccessToken(): Promise<string | null> {
  if (supabase) return (await supabase.auth.getSession()).data.session?.access_token ?? null;
  try { return localStorage.getItem(KEY); } catch { return null; }
}

async function devCall(path: string, body: unknown) {
  const res = await fetch(`${BASE}/api/auth/dev/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const d = data?.detail;
    throw new Error(typeof d === "string" ? d : Array.isArray(d) ? d.map((x: { msg: string }) => x.msg).join("; ") : "Something went wrong.");
  }
  localStorage.setItem(KEY, data.access_token);
}

/** Returns "signed-in" or "confirm-email" (Supabase projects that require email verification). */
export async function signUp(email: string, password: string, fullName: string): Promise<"signed-in" | "confirm-email"> {
  if (supabase) {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: window.location.origin + "/login" } });
    if (error) throw new Error(error.message);
    return data.session ? "signed-in" : "confirm-email";
  }
  await devCall("signup", { email, password, full_name: fullName });
  return "signed-in";
}

export async function signIn(email: string, password: string) {
  if (supabase) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message.includes("Email not confirmed") ? "Please verify your email first. Check your inbox for the confirmation link." : error.message);
    return;
  }
  await devCall("login", { email, password });
}

export async function resetPassword(email: string) {
  if (!supabase) throw new Error("Password reset is handled by Supabase Auth and is unavailable in local development mode.");
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/reset-password" });
  if (error) throw new Error(error.message);
}

export async function updatePassword(password: string) {
  if (!supabase) throw new Error("Password reset is handled by Supabase Auth and is unavailable in local development mode.");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function onAuthChange(cb: () => void) {
  supabase?.auth.onAuthStateChange(() => cb());
}
