import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ReportThumb } from "@/components/ReportThumb";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { EmptyState, ErrorState, PageHeader, Spinner, StatusBadge } from "@/components/ui/misc";
import { useToast } from "@/hooks/useToast";
import { Api } from "@/services/endpoints";
import type { Report } from "@/types";
import { categoryLabel, formatDate } from "@/utils/format";
import { cn } from "@/utils/cn";

const KINDS = [["", "All"], ["lost", "Lost"], ["found", "Found"]] as const;
const STATUSES = [["", "Any status"], ["draft", "Drafts"], ["open", "Open"], ["closed", "Closed"], ["recovered", "Recovered"]] as const;

export function MyReportsPage() {
  const [params, setParams] = useSearchParams();
  const kind = params.get("kind") ?? "";
  const status = params.get("status") ?? "";
  const page = Number(params.get("page") ?? 1) || 1;
  const qc = useQueryClient();
  const toast = useToast();
  const [toDelete, setToDelete] = useState<Report | null>(null);

  const q = useQuery({ queryKey: ["reports", kind, status, page], queryFn: () => Api.reports({ kind, status, page }), placeholderData: (p) => p });
  const refresh = () => void qc.invalidateQueries();
  const del = useMutation({ mutationFn: (id: string) => Api.deleteReport(id), onSuccess: () => { toast.success("Report deleted."); setToDelete(null); refresh(); }, onError: (e: Error) => { toast.error(e.message); setToDelete(null); } });
  const toggle = useMutation({ mutationFn: (r: Report) => Api.setReportStatus(r.id, r.status === "open" ? "closed" : "open"), onSuccess: (r) => { toast.success(r.status === "open" ? "Report reopened." : "Report closed."); refresh(); }, onError: (e: Error) => toast.error(e.message) });

  const set = (k: string, v: string) => { const n = new URLSearchParams(params); if (v) n.set(k, v); else n.delete(k); n.delete("page"); setParams(n); };
  const pages = q.data ? Math.max(1, Math.ceil(q.data.total / q.data.page_size)) : 1;

  return (
    <div>
      <PageHeader title="My reports" subtitle="Everything you've reported, and how each one is progressing." actions={<><Button asChild><Link to="/report/lost">Report lost</Link></Button><Button variant="secondary" asChild><Link to="/report/found">Report found</Link></Button></>} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Report type" className="flex gap-1 rounded-md bg-stone-200/60 p-1">
          {KINDS.map(([v, l]) => <button key={l} role="tab" aria-selected={kind === v} onClick={() => set("kind", v)} className={cn("rounded px-3 py-1.5 text-sm font-semibold", kind === v ? "bg-white text-forest shadow-sm" : "text-ink/70 hover:text-ink")}>{l}</button>)}
        </div>
        <label className="flex items-center gap-2 text-sm"><span className="sr-only">Status</span>
          <select aria-label="Filter by status" value={status} onChange={(e) => set("status", e.target.value)} className="h-9 rounded-md border border-stone-300 bg-white px-2 text-sm">
            {STATUSES.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      {q.isLoading ? <Spinner label="Loading reports" /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.data!.items.length === 0 ? (
        <EmptyState icon={ClipboardList} title={kind || status ? "No reports match these filters" : "You haven't reported anything yet"} text="Report a lost or found item and we'll start looking for matches straight away." action={<Button asChild><Link to="/report/lost">Report a lost item</Link></Button>} />
      ) : (
        <ul className="divide-y divide-stone-200 border-y border-stone-300" data-testid="report-list">
          {q.data!.items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-4" data-testid="report-row">
              <ReportThumb report={r} className="h-16 w-16 shrink-0" />
              <div className="min-w-0 flex-1 basis-48">
                <Link to={r.status === "draft" ? `/reports/${r.id}/edit` : `/reports/${r.id}`} className="block truncate font-bold text-forest hover:underline">{r.title || "Untitled draft"}</Link>
                <p className="text-xs text-stone">{categoryLabel(r.category)} · {r.location_name || "No location yet"} · {formatDate(r.created_at)}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2"><StatusBadge value={r.kind} /><StatusBadge value={r.status} />{r.is_flagged && <StatusBadge value="flagged" />}{r.match_count > 0 && <Link to={`/reports/${r.id}`} className="text-xs font-semibold text-leaf hover:underline">{r.match_count} possible match{r.match_count > 1 ? "es" : ""}</Link>}</div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {r.status === "draft" ? <Button size="sm" asChild><Link to={`/reports/${r.id}/edit`}>Continue draft</Link></Button> : <>
                  <Button size="sm" variant="secondary" asChild><Link to={`/reports/${r.id}`}>View</Link></Button>
                  {r.status !== "recovered" && <Button size="sm" variant="ghost" asChild><Link to={`/reports/${r.id}/edit`} aria-label={`Edit ${r.title}`}><Pencil className="h-4 w-4" />Edit</Link></Button>}
                  {(r.status === "open" || r.status === "closed") && <Button size="sm" variant="ghost" loading={toggle.isPending && toggle.variables?.id === r.id} onClick={() => toggle.mutate(r)}>{r.status === "open" ? "Close" : "Reopen"}</Button>}
                </>}
                {r.status !== "recovered" && <Button size="sm" variant="ghost" className="text-danger hover:bg-[#f4dcd9]" aria-label={`Delete ${r.title || "draft"}`} onClick={() => setToDelete(r)}><Trash2 className="h-4 w-4" /></Button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pagination" className="mt-5 flex items-center justify-center gap-3 text-sm">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => { const n = new URLSearchParams(params); n.set("page", String(page - 1)); setParams(n); }}>Previous</Button>
          <span>Page {page} of {pages}</span>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => { const n = new URLSearchParams(params); n.set("page", String(page + 1)); setParams(n); }}>Next</Button>
        </nav>
      )}

      <ConfirmDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)} destructive title="Delete this report?" description={`"${toDelete?.title || "Untitled draft"}" and its photos and matches will be permanently removed. This can't be undone.`} confirmLabel="Delete report" loading={del.isPending} onConfirm={() => toDelete && del.mutate(toDelete.id)} />
    </div>
  );
}
