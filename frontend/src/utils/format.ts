export const CATEGORIES: { value: string; label: string }[] = [
  { value: "electronics", label: "Electronics" }, { value: "wallet_cards", label: "Wallet & cards" }, { value: "keys", label: "Keys" },
  { value: "bags", label: "Bags" }, { value: "clothing", label: "Clothing" }, { value: "books_stationery", label: "Books & stationery" },
  { value: "accessories", label: "Accessories" }, { value: "id_documents", label: "ID & documents" }, { value: "water_bottles", label: "Water bottles" },
  { value: "sports", label: "Sports gear" }, { value: "other", label: "Other" },
];
export const categoryLabel = (v: string | null) => CATEGORIES.find((c) => c.value === v)?.label ?? "Other";

export function formatDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" });
}
export function timeAgo(iso: string) {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
export const ACTIVITY_LABELS: Record<string, string> = {
  report_draft_created: "Started a report", lost_report_submitted: "Reported a lost item", found_report_submitted: "Reported a found item",
  report_updated: "Edited a report", report_deleted: "Deleted a report", report_open: "Reopened a report", report_closed: "Closed a report",
  match_dismissed: "Dismissed a match", match_flagged: "Reported a suspicious match", verification_requested: "Requested ownership verification",
  verification_answers_submitted: "Submitted ownership answers", verification_approved: "Approved a claim", verification_rejected: "Rejected a claim",
  recovery_completed: "Completed a recovery", match_feedback: "Match feedback recorded",
};
export const SCORE_LABELS: Record<string, string> = {
  visual: "Photo", description: "Description", category: "Category", location: "Location", date: "Date",
};
