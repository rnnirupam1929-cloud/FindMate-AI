import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { MatchCard } from "@/components/MatchCard";
import { ReportThumb } from "@/components/ReportThumb";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, PageHeader, Spinner, StatusBadge } from "@/components/ui/misc";
import { Api } from "@/services/endpoints";
import type { Report } from "@/types";
import { categoryLabel, formatDate } from "@/utils/format";
import { cn } from "@/utils/cn";

const FILTERS = [["", "Active"], ["suggested", "To review"], ["verifying", "In verification"], ["confirmed", "Recovered"], ["dismissed", "Dismissed"]] as const;

export function MatchesPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const q = useQuery({ queryKey: ["matches", status], queryFn: () => Api.matches({ status }) });
  return (
    <div>
      <PageHeader title="Possible matches" subtitle="Leads from comparing lost and found reports. A match score is never proof of ownership." />
      <div role="tablist" aria-label="Match status" className="mb-4 flex flex-wrap gap-1 rounded-md bg-stone-200/60 p-1 sm:inline-flex">
        {FILTERS.map(([v, l]) => <button key={l} role="tab" aria-selected={status === v} onClick={() => setParams(v ? { status: v } : {})} className={cn("rounded px-3 py-1.5 text-sm font-semibold", status === v ? "bg-white text-forest shadow-sm" : "text-ink/70 hover:text-ink")}>{l}</button>)}
      </div>
      {q.isLoading ? <Spinner label="Loading matches" /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.data!.items.length === 0 ? (
        <EmptyState icon={Sparkles} title="Nothing to show here" text="New reports are compared automatically. You'll be notified as soon as something looks like a match." action={<Button asChild variant="secondary"><Link to="/reports">View my reports</Link></Button>} />
      ) : <div data-testid="match-list">{q.data!.items.map((m) => <MatchCard key={m.id} match={m} />)}</div>}
    </div>
  );
}

function ReportPanel({ label, r }: { label: string; r: Report }) {
  return (
    <section className="min-w-0" aria-label={`${label} report`}>
      <p className="text-xs font-bold uppercase tracking-wide text-stone">{label}</p>
      <ReportThumb report={r} className="mt-2 h-44 w-full" />
      <h2 className="mt-3 text-lg font-bold">{r.title}</h2>
      <div className="mt-1 flex gap-2"><StatusBadge value={r.status} /></div>
      <p className="mt-2 whitespace-pre-line text-sm">{r.description}</p>
      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex gap-2"><dt className="w-20 shrink-0 text-stone">Category</dt><dd>{categoryLabel(r.category)}</dd></div>
        {r.color && <div className="flex gap-2"><dt className="w-20 shrink-0 text-stone">Colour</dt><dd>{r.color}</dd></div>}
        {r.brand && <div className="flex gap-2"><dt className="w-20 shrink-0 text-stone">Brand</dt><dd>{r.brand}</dd></div>}
        <div className="flex gap-2"><dt className="w-20 shrink-0 text-stone">Place</dt><dd>{r.location_name || "—"}</dd></div>
        <div className="flex gap-2"><dt className="w-20 shrink-0 text-stone">Date</dt><dd>{formatDate(r.event_date)}</dd></div>
      </dl>
    </section>
  );
}

export function MatchDetailPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["match", id], queryFn: () => Api.match(id) });
  if (q.isLoading) return <Spinner label="Loading match" />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const m = q.data;
  return (
    <div>
      <Link to="/matches" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-leaf hover:underline"><ArrowLeft className="h-4 w-4" />All matches</Link>
      <PageHeader title="Review this match" subtitle="Compare the two reports. The decision to claim an item still goes through ownership verification." />
      <div className="grid gap-8 sm:grid-cols-2"><ReportPanel label="Lost" r={m.lost_report} /><ReportPanel label="Found" r={m.found_report} /></div>
      <div className="mt-6"><MatchCard match={m} detailed /></div>
    </div>
  );
}
