import { useQuery } from "@tanstack/react-query";
import { Bell, CheckCircle2, ClipboardList, PackageSearch, Search, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { MatchCard } from "@/components/MatchCard";
import { ReportThumb } from "@/components/ReportThumb";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, PageHeader, Spinner, StatusBadge } from "@/components/ui/misc";
import { useAuth } from "@/hooks/useAuth";
import { Api } from "@/services/endpoints";
import { ACTIVITY_LABELS, categoryLabel, formatDate, timeAgo } from "@/utils/format";

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-stone-300 pt-5">
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{title}</h2>{action}</div>
      {children}
    </section>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: Api.dashboard });
  const first = user?.full_name?.split(" ")[0] || "there";

  if (q.isLoading) return <Spinner label="Loading your dashboard" />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const nothingYet = d.lost_count + d.found_count === 0;

  return (
    <div>
      <PageHeader
        title={`Welcome, ${first}`}
        subtitle={nothingYet ? "Report something lost or found to get started." : `${d.open_lost} open lost · ${d.open_found} open found · ${d.suggested_matches.length} possible match${d.suggested_matches.length === 1 ? "" : "es"} to review`}
        actions={<><Button asChild><Link to="/report/lost"><Search className="h-4 w-4" />Report lost item</Link></Button><Button variant="secondary" asChild><Link to="/report/found"><PackageSearch className="h-4 w-4" />I found something</Link></Button></>}
      />

      <div className="space-y-8">
        {(d.pending_verifications > 0 || d.unread_notifications > 0) && (
          <div className="flex flex-wrap gap-3">
            {d.pending_verifications > 0 && <Link to="/verifications" className="flex items-center gap-2 rounded-md bg-sun-100 px-4 py-2.5 text-sm font-semibold hover:bg-sun/60"><ShieldCheck className="h-4 w-4" aria-hidden />{d.pending_verifications} verification{d.pending_verifications > 1 ? "s" : ""} waiting</Link>}
            {d.unread_notifications > 0 && <Link to="/notifications" className="flex items-center gap-2 rounded-md bg-mint px-4 py-2.5 text-sm font-semibold hover:bg-mint-200"><Bell className="h-4 w-4" aria-hidden />{d.unread_notifications} unread notification{d.unread_notifications > 1 ? "s" : ""}</Link>}
          </div>
        )}

        <Section title="Possible matches" action={d.suggested_matches.length > 0 && <Link to="/matches" className="text-sm font-semibold text-leaf hover:underline">See all</Link>}>
          {d.suggested_matches.length === 0 ? (
            <EmptyState icon={Sparkles} title="No possible matches yet" text="When another report looks like yours, it appears here with the reasons. New reports are compared automatically." />
          ) : d.suggested_matches.map((m) => <MatchCard key={m.id} match={m} />)}
        </Section>

        <Section title="My recent reports" action={<Link to="/reports" className="text-sm font-semibold text-leaf hover:underline">View all</Link>}>
          {d.recent_reports.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No reports yet" text="Your lost and found reports will show up here." action={<Button asChild><Link to="/report/lost">Report a lost item</Link></Button>} />
          ) : (
            <ul className="divide-y divide-stone-200">
              {d.recent_reports.map((r) => (
                <li key={r.id}>
                  <Link to={r.status === "draft" ? `/reports/${r.id}/edit` : `/reports/${r.id}`} className="flex items-center gap-3 py-3 hover:bg-mint/40">
                    <ReportThumb report={r} className="h-12 w-12 shrink-0" />
                    <div className="min-w-0 flex-1"><p className="truncate font-semibold">{r.title || "Untitled draft"}</p><p className="text-xs text-stone">{categoryLabel(r.category)} · {formatDate(r.created_at)}</p></div>
                    <StatusBadge value={r.kind} /><StatusBadge value={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <div className="grid gap-8 md:grid-cols-2">
          <Section title="Recently recovered">
            {d.recoveries.length === 0 ? <p className="text-sm text-stone">No recoveries yet. Completed handovers will appear here.</p> : (
              <ul className="space-y-3">{d.recoveries.map((r) => <li key={r.id} className="flex items-start gap-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-leaf" aria-hidden /><span><strong>{r.title}</strong> returned{r.location_name ? ` near ${r.location_name}` : ""} · {formatDate(r.recovered_at)}</span></li>)}</ul>
            )}
          </Section>
          <Section title="Recent activity">
            {d.activity.length === 0 ? <p className="text-sm text-stone">Your actions will be listed here.</p> : (
              <ul className="space-y-2 text-sm">{d.activity.map((a) => <li key={a.id} className="flex justify-between gap-3"><span>{ACTIVITY_LABELS[a.action] ?? a.action.replace(/_/g, " ")}</span><span className="shrink-0 text-xs text-stone">{timeAgo(a.created_at)}</span></li>)}</ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
