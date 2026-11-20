/** Combine a yyyy-mm-dd date and optional HH:MM time (local) into an ISO string. */
export function toIso(date: string, time?: string) {
  return new Date(`${date}T${time || "12:00"}:00`).toISOString();
}
export function splitIso(iso: string | null | undefined) {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, time: `${p(d.getHours())}:${p(d.getMinutes())}` };
}
export const todayStr = () => splitIso(new Date().toISOString()).date;
