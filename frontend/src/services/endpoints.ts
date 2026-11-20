import { api } from "@/services/api";
import type { AdminStats, Dashboard, Institution, MapPoint, Match, NotificationPage, Page, Profile, Report, Verification, VerificationListItem } from "@/types";

export interface ReportPayload {
  kind: "lost" | "found"; title?: string; category?: string; description?: string; color?: string | null; brand?: string | null;
  location_name?: string | null; latitude?: number | null; longitude?: number | null; event_date?: string | null; approx_time?: string | null;
  additional_details?: string | null; private_clues?: string | null; verification_questions?: string[] | null;
}

export const Api = {
  me: () => api<Profile>("/me"),
  updateMe: (b: { full_name?: string; institution_id?: string }) => api<Profile>("/me", { method: "PATCH", body: b }),
  institutions: () => api<Institution[]>("/institutions", { auth: false }),
  publicStats: () => api<{ reports: number; recoveries: number; institutions: number }>("/public/stats", { auth: false }),
  dashboard: () => api<Dashboard>("/dashboard"),

  reports: (p: { kind?: string; status?: string; page?: number } = {}) => {
    const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v).map(([k, v]) => [k, String(v)]));
    return api<Page<Report>>(`/reports?${q}`);
  },
  report: (id: string) => api<Report>(`/reports/${id}`),
  createReport: (b: ReportPayload) => api<Report>("/reports", { method: "POST", body: b }),
  updateReport: (id: string, b: Partial<ReportPayload>) => api<Report>(`/reports/${id}`, { method: "PATCH", body: b }),
  submitReport: (id: string) => api<Report>(`/reports/${id}/submit`, { method: "POST" }),
  setReportStatus: (id: string, status: "open" | "closed") => api<Report>(`/reports/${id}/status`, { method: "POST", body: { status } }),
  deleteReport: (id: string) => api<void>(`/reports/${id}`, { method: "DELETE" }),
  uploadImage: (id: string, file: File) => { const f = new FormData(); f.append("file", file); return api<Report>(`/reports/${id}/images`, { method: "POST", form: f }); },
  deleteImage: (id: string, imageId: string) => api<Report>(`/reports/${id}/images/${imageId}`, { method: "DELETE" }),

  matches: (p: { status?: string; page?: number } = {}) => {
    const q = new URLSearchParams(Object.entries(p).filter(([, v]) => v).map(([k, v]) => [k, String(v)]));
    return api<Page<Match>>(`/matches?${q}`);
  },
  match: (id: string) => api<Match>(`/matches/${id}`),
  dismissMatch: (id: string) => api<Match>(`/matches/${id}/dismiss`, { method: "POST" }),
  flagMatch: (id: string, reason: string) => api<Match>(`/matches/${id}/flag`, { method: "POST", body: { reason } }),
  startVerification: (id: string) => api<{ id: string; status: string; questions: string[] }>(`/matches/${id}/verify`, { method: "POST" }),

  verifications: () => api<Page<VerificationListItem>>("/verifications"),
  verification: (id: string) => api<Verification>(`/verifications/${id}`),
  submitAnswers: (id: string, answers: { question: string; answer: string }[]) => api<Verification>(`/verifications/${id}/answers`, { method: "POST", body: { answers } }),
  review: (id: string, decision: "approved" | "rejected", note?: string) => api<Verification>(`/verifications/${id}/review`, { method: "POST", body: { decision, note } }),
  complete: (id: string, handover_note?: string) => api<Verification>(`/verifications/${id}/complete`, { method: "POST", body: { handover_note } }),

  notifications: (unreadOnly = false) => api<NotificationPage>(`/notifications${unreadOnly ? "?unread_only=true" : ""}`),
  markRead: (id: string) => api<void>(`/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () => api<void>("/notifications/read-all", { method: "POST" }),
  mapPoints: () => api<{ points: MapPoint[]; center: { latitude: number; longitude: number } | null }>("/map/points"),

  admin: {
    stats: () => api<AdminStats>("/admin/stats"),
    users: (q = "") => api<Page<Profile & { is_suspended: boolean }>>(`/admin/users?q=${encodeURIComponent(q)}`),
    patchUser: (id: string, b: { role?: string; is_suspended?: boolean }) => api<Profile & { is_suspended: boolean }>(`/admin/users/${id}`, { method: "PATCH", body: b }),
    reports: (flagged: boolean) => api<Page<Report>>(`/admin/reports?flagged=${flagged}`),
    moderate: (id: string, b: { is_hidden?: boolean; is_flagged?: boolean }) => api<Report>(`/admin/reports/${id}`, { method: "PATCH", body: b }),
    institutions: () => api<Institution[]>("/admin/institutions"),
    createInstitution: (b: Partial<Institution> & { name: string; slug: string }) => api<Institution>("/admin/institutions", { method: "POST", body: b }),
  },
};
