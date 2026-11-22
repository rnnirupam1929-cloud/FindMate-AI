import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, EyeOff, MapPin, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { MatchCard } from "@/components/MatchCard";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { ErrorState, Spinner, StatusBadge } from "@/components/ui/misc";
import { useToast } from "@/hooks/useToast";
import { Api } from "@/services/endpoints";
import { categoryLabel, formatDate } from "@/utils/format";
import { cn } from "@/utils/cn";

export function ReportDetailPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const rq = useQuery({ queryKey: ["report", id], queryFn: () => Api.report(id) });
  const mq = useQuery({ queryKey: ["matches", "all"], queryFn: () => Api.matches() });
  const del = useMutation({ mutationFn: () => Api.deleteReport(id), onSuccess: () => { toast.success("Report deleted."); void qc.invalidateQueries(); nav("/reports"); }, onError: (e: Error) => { toast.error(e.message); setConfirm(false); } });
  const toggle = useMutation({ mutationFn: (to: "open" | "closed") => Api.setReportStatus(id, to), onSuccess: (r) => { toast.success(r.status === "open" ? "Report reopened." : "Report closed."); void qc.invalidateQueries(); }, onError: (e: Error) => toast.error(e.message) });

  if (rq.isLoading) return <Spinner label="Loading report" />;
  if (rq.error || !rq.data) return <ErrorState error={rq.error} retry={() => rq.refetch()} />;
  const r = rq.data;
  const mine = (mq.data?.items ?? []).filter((m) => m.lost_report.id === r.id || m.found_report.id === r.id);
  const verifying = mine.some((m) => m.status === "verifying" || m.status === "confirmed");
  const progress = [
    ["Submitted", r.status !== "draft"],
    ["Possible matches", mine.length > 0],
    ["Verification", verifying],
    ["Recovered", r.status === "recovered"],
  ] as const;

  return (
    <div>
      <Link to="/reports" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-leaf hover:underline"><ArrowLeft className="h-4 w-4" />My reports</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="mb-2 flex gap-2"><StatusBadge value={r.kind} /><StatusBadge value={r.status} /></div><h1 className="text-2xl font-extrabold sm:text-3xl">{r.title}</h1><p className="mt-1 text-sm text-stone">{categoryLabel(r.category)} · reported {formatDate(r.created_at)}</p></div>
        {r.is_mine && (
          <div className="flex flex-wrap gap-2">
            {r.status !== "recovered" && <Button variant="secondary" asChild><Link to={`/reports/${r.id}/edit`}><Pencil className="h-4 w-4" />Edit</Link></Button>}
            {(r.status === "open" || r.status === "closed") && <Button variant="secondary" loading={toggle.isPending} onClick={() => toggle.mutate(r.status === "open" ? "closed" : "open")}>{r.status === "open" ? "Close report" : "Reopen"}</Button>}
            {r.status !== "recovered" && <Button variant="ghost" className="text-danger hover:bg-[#f4dcd9]" onClick={() => setConfirm(true)}><Trash2 className="h-4 w-4" />Delete</Button>}
          </div>
        )}
      </div>

      <ol className="my-8 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Recovery progress">
        {progress.map(([label, done]) => (
          <li key={label} className={cn("border-t-2 pt-2 text-sm", done ? "border-leaf font-semibold text-forest" : "border-stone-300 text-stone")}>
            <span className="flex items-center gap-1.5">{done && <Check className="h-4 w-4 text-leaf" aria-label="done" />}{label}</span>
          </li>
        ))}
      </ol>

      <div className="grid gap-8 md:grid-cols-[260px_1fr]">
        <div className="space-y-3">
          {r.images.length ? r.images.map((i) => <img key={i.id} src={i.url} alt={r.title} className="w-full rounded-md border border-stone-300 object-cover" />) : <div className="flex h-40 items-center justify-center rounded-md bg-mint text-sm text-stone">No photo</div>}
        </div>
        <div>
          <p className="whitespace-pre-line">{r.description}</p>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            {r.color && <div><dt className="font-semibold text-stone">Colour</dt><dd>{r.color}</dd></div>}
            {r.brand && <div><dt className="font-semibold text-stone">Brand</dt><dd>{r.brand}</dd></div>}
            <div><dt className="font-semibold text-stone">{r.kind === "lost" ? "Last seen" : "Found at"}</dt><dd className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-leaf" aria-hidden />{r.location_name || "—"}</dd></div>
            <div><dt className="font-semibold text-stone">When</dt><dd>{formatDate(r.event_date)}{r.approx_time ? ` · ${r.approx_time}` : ""}</dd></div>
            {r.additional_details && <div className="sm:col-span-2"><dt className="font-semibold text-stone">Additional details</dt><dd>{r.additional_details}</dd></div>}
          </dl>
          {r.is_mine && r.kind === "found" && r.private_clues && (
            <div className="mt-6 rounded-md bg-mint/70 p-4 text-sm"><p className="flex items-center gap-2 font-bold text-forest"><EyeOff className="h-4 w-4" aria-hidden />Private clues (only you and reviewers see this)</p><p className="mt-1">{r.private_clues}</p></div>
          )}
        </div>
      </div>

      <section className="mt-10 border-t border-stone-300 pt-5">
        <h2 className="mb-1 text-lg font-bold">Matching progress</h2>
        {mq.isLoading ? <Spinner label="Checking matches" /> : mine.length === 0 ? (
          <p className="text-sm text-stone">{r.status === "open" ? "No possible matches yet. We compare every new report automatically and will notify you." : "No matches for this report."}</p>
        ) : mine.map((m) => <MatchCard key={m.id} match={m} />)}
      </section>

      <ConfirmDialog open={confirm} onOpenChange={setConfirm} destructive title="Delete this report?" description="The report, its photos and its matches will be permanently removed. This can't be undone." confirmLabel="Delete report" loading={del.isPending} onConfirm={() => del.mutate()} />
    </div>
  );
}
