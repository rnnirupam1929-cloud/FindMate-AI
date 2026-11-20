export type Role = "student" | "admin" | "verification_agent";
export type ReportKind = "lost" | "found";
export type ReportStatus = "draft" | "open" | "matched" | "recovered" | "closed";
export type MatchStatus = "suggested" | "dismissed" | "verifying" | "confirmed" | "flagged";
export type VerificationStatus = "pending" | "under_review" | "approved" | "rejected" | "completed";

export interface Profile { id: string; email: string; full_name: string; role: Role; institution_id: string | null; created_at: string }
export interface Institution { id: string; name: string; slug: string; city: string | null; latitude: number | null; longitude: number | null; is_active: boolean }
export interface ReportImage { id: string; url: string; width?: number; height?: number }
export interface Report {
  id: string; kind: ReportKind; title: string; category: string; description: string; color: string | null; brand: string | null;
  location_name: string | null; latitude: number | null; longitude: number | null; event_date: string | null; approx_time: string | null;
  additional_details: string | null; status: ReportStatus; is_flagged: boolean; is_hidden: boolean; is_mine: boolean;
  created_at: string; updated_at: string; images: ReportImage[]; match_count: number;
  private_clues: string | null; verification_questions: string[] | null; flag_reason?: string | null;
}
export interface Page<T> { items: T[]; total: number; page: number; page_size: number }
export interface Match {
  id: string; score: number; breakdown: Record<string, number | null>; reasons: string[]; status: MatchStatus; created_at: string;
  lost_report: Report; found_report: Report; my_side: "lost" | "found" | "staff"; verification_id: string | null; verification_status: VerificationStatus | null;
}
export interface Verification {
  id: string; status: VerificationStatus; role: "claimant" | "reviewer"; match_id: string; created_at: string; updated_at: string;
  reviewer_note: string | null; handover_note: string | null; questions: string[]; lost_report: Report; found_report: Report;
  answers: { question: string; answer: string }[]; private_clues: string | null; guidance: { guidance: string[]; suggested_message: string } | null;
}
export interface VerificationListItem { id: string; status: VerificationStatus; role: "claimant" | "reviewer"; updated_at: string; found_title: string; lost_title: string | null }
export interface AppNotification { id: string; type: string; title: string; body: string; link: string | null; is_read: boolean; created_at: string }
export interface NotificationPage extends Page<AppNotification> { unread: number }
export interface Dashboard {
  lost_count: number; found_count: number; open_lost: number; open_found: number; suggested_matches: Match[]; pending_verifications: number;
  unread_notifications: number; recoveries: { id: string; recovered_at: string; location_name: string | null; title: string }[];
  recent_reports: Report[]; activity: { id: string; action: string; created_at: string }[];
}
export interface MapPoint { id: string; kind: "lost" | "found" | "recovery"; title: string; category: string | null; location_name: string | null; latitude: number; longitude: number; mine: boolean }
export interface AdminStats {
  users: number; reports: number; open_reports: number; flagged_reports: number; matches: number; verifications_open: number;
  recoveries: number; agent_errors: number; feedback: Record<string, { count: number; avg_score: number }>;
}
