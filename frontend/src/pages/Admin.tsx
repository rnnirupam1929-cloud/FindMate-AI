import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Input, Select } from "@/components/ui/Field";
import { EmptyState, ErrorState, PageHeader, Spinner, StatusBadge } from "@/components/ui/misc";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { Api } from "@/services/endpoints";
import type { Profile } from "@/types";
import { cn } from "@/utils/cn";
import { categoryLabel, formatDate, timeAgo } from "@/utils/format";
import { ShieldCheck } from "lucide-react";

type Tab = "overview" | "reports" | "verifications" | "users" | "institutions";

function Overview() {
  const q = useQuery({ queryKey: ["admin", "stats"], queryFn: Api.admin.stats });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const s = q.data;
  const items: [string, number][] = [["Users", s.users], ["Reports filed", s.reports], ["Open reports", s.open_reports], ["Flagged reports", s.flagged_reports], ["Matches generated", s.matches], ["Verifications open", s.verifications_open], ["Items recovered", s.recoveries], ["Agent errors", s.agent_errors]];
  const fb = Object.entries(s.feedback);
  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4" data-testid="admin-stats">{items.map(([k, v]) => <div key={k} className="border-t-2 border-forest pt-2"><dt className="text-sm text-stone">{k}</dt><dd className="text-3xl font-extrabold text-forest">{v}</dd></div>)}</dl>
      <section><h2 className="text-lg font-bold">Matching feedback</h2><p className="text-sm text-stone">What people did with suggested matches. This is the data the Learning Agent collects; it doesn't retrain anything automatically.</p>
        {fb.length === 0 ? <p className="mt-3 text-sm text-stone">No feedback recorded yet.</p> : <table className="mt-3 w-full max-w-md text-sm"><thead><tr className="border-b border-stone-300 text-left text-stone"><th className="py-2 font-semibold">Outcome</th><th className="font-semibold">Count</th><th className="font-semibold">Avg score</th></tr></thead><tbody>{fb.map(([k, v]) => <tr key={k} className="border-b border-stone-200"><td className="py-2 capitalize">{k.replace(/_/g, " ")}</td><td>{v.count}</td><td>{Math.round(v.avg_score)}</td></tr>)}</tbody></table>}
      </section>
    </div>
  );
}

function ReportsTab() {
  const [flagged, setFlagged] = useState(true);
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin", "reports", flagged], queryFn: () => Api.admin.reports(flagged) });
  const mod = useMutation({ mutationFn: (a: { id: string; b: { is_hidden?: boolean; is_flagged?: boolean } }) => Api.admin.moderate(a.id, a.b), onSuccess: () => { toast.success("Report updated."); void qc.invalidateQueries({ queryKey: ["admin"] }); }, onError: (e: Error) => toast.error(e.message) });
  return (
    <div>
      <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} className="h-4 w-4 accent-[#287A5B]" />Show only flagged as suspicious</label>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.data!.items.length === 0 ? <EmptyState icon={ShieldCheck} title={flagged ? "Nothing flagged" : "No reports yet"} text="Reports that people report as suspicious appear here for review." /> : (
        <ul className="divide-y divide-stone-200 border-y border-stone-300" data-testid="admin-reports">
          {q.data!.items.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1 basis-56"><p className="truncate font-bold">{r.title}</p><p className="text-xs text-stone">{categoryLabel(r.category)} · {formatDate(r.created_at)}</p>
                <div className="mt-1 flex flex-wrap gap-1.5"><StatusBadge value={r.kind} /><StatusBadge value={r.status} />{r.is_flagged && <StatusBadge value="flagged" />}{r.is_hidden && <StatusBadge value="closed" className="!bg-ink !text-white">hidden</StatusBadge>}</div>
                {r.flag_reason && <p className="mt-1 text-xs">Reason: {r.flag_reason}</p>}</div>
              <div className="flex gap-1.5">
                <Button size="sm" variant="secondary" onClick={() => mod.mutate({ id: r.id, b: { is_hidden: !r.is_hidden } })}>{r.is_hidden ? "Unhide" : "Hide"}</Button>
                {r.is_flagged && <Button size="sm" variant="ghost" onClick={() => mod.mutate({ id: r.id, b: { is_flagged: false } })}>Clear flag</Button>}
                {!r.is_flagged && <Button size="sm" variant="ghost" onClick={() => mod.mutate({ id: r.id, b: { is_flagged: true } })}>Flag</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VerificationsTab() {
  const q = useQuery({ queryKey: ["verifications"], queryFn: Api.verifications });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!q.data.items.length) return <EmptyState icon={ShieldCheck} title="No verification requests" text="Ownership claims for your institution will appear here." />;
  return <ul className="divide-y divide-stone-200 border-y border-stone-300">{q.data.items.map((v) => <li key={v.id}><Link to={`/verifications/${v.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-mint/40"><span className="min-w-0 truncate font-semibold">{v.found_title}<span className="ml-2 text-xs font-normal text-stone">updated {timeAgo(v.updated_at)}</span></span><StatusBadge value={v.status} /></Link></li>)}</ul>;
}

function UsersTab() {
  const { user: me } = useAuth();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<(Profile & { is_suspended: boolean }) | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin", "users", query], queryFn: () => Api.admin.users(query) });
  const patch = useMutation({ mutationFn: (a: { id: string; b: { role?: string; is_suspended?: boolean } }) => Api.admin.patchUser(a.id, a.b), onSuccess: () => { toast.success("User updated."); setPending(null); void qc.invalidateQueries({ queryKey: ["admin", "users"] }); }, onError: (e: Error) => { toast.error(e.message); setPending(null); } });
  if (me?.role !== "admin") return <p className="text-sm text-stone">Only administrators can manage users.</p>;
  return (
    <div>
      <form className="mb-4 flex max-w-md items-end gap-2" onSubmit={(e) => { e.preventDefault(); setQuery(search); }} role="search"><div className="flex-1"><Input label="Search users" placeholder="Name or email" value={search} onChange={(e) => setSearch(e.target.value)} /></div><Button type="submit" variant="secondary">Search</Button></form>
      {q.isLoading ? <Spinner /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : (
        <ul className="divide-y divide-stone-200 border-y border-stone-300" data-testid="admin-users">
          {q.data!.items.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1 basis-56"><p className="truncate font-bold">{u.full_name || "(no name)"} {u.is_suspended && <StatusBadge value="rejected" className="ml-1">suspended</StatusBadge>}</p><p className="truncate text-xs text-stone">{u.email}</p></div>
              {u.id === me.id ? <span className="text-xs text-stone">You</span> : (
                <div className="flex items-center gap-2">
                  <select aria-label={`Role for ${u.email}`} value={u.role} onChange={(e) => patch.mutate({ id: u.id, b: { role: e.target.value } })} className="h-9 rounded-md border border-stone-300 bg-white px-2 text-sm"><option value="student">Student</option><option value="verification_agent">Verification agent</option><option value="admin">Admin</option></select>
                  <Button size="sm" variant={u.is_suspended ? "secondary" : "ghost"} className={cn(!u.is_suspended && "text-danger")} onClick={() => (u.is_suspended ? patch.mutate({ id: u.id, b: { is_suspended: false } }) : setPending(u))}>{u.is_suspended ? "Restore" : "Suspend"}</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog open={!!pending} onOpenChange={(o) => !o && setPending(null)} destructive title="Suspend this user?" description={`${pending?.email} will no longer be able to use FindMate AI until restored.`} confirmLabel="Suspend" loading={patch.isPending} onConfirm={() => pending && patch.mutate({ id: pending.id, b: { is_suspended: true } })} />
    </div>
  );
}

function InstitutionsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ["admin", "institutions"], queryFn: Api.admin.institutions, enabled: user?.role === "admin" });
  const [f, setF] = useState({ name: "", slug: "", city: "", latitude: "", longitude: "" });
  const create = useMutation({
    mutationFn: () => Api.admin.createInstitution({ name: f.name.trim(), slug: f.slug.trim(), city: f.city.trim() || null, latitude: f.latitude ? Number(f.latitude) : null, longitude: f.longitude ? Number(f.longitude) : null }),
    onSuccess: () => { toast.success("Institution added."); setF({ name: "", slug: "", city: "", latitude: "", longitude: "" }); void qc.invalidateQueries({ queryKey: ["admin", "institutions"] }); void qc.invalidateQueries({ queryKey: ["institutions"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (user?.role !== "admin") return <p className="text-sm text-stone">Only administrators can manage institutions.</p>;
  return (
    <div className="grid gap-8 md:grid-cols-[1.2fr_1fr]">
      <div>{q.isLoading ? <Spinner /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : <ul className="divide-y divide-stone-200 border-y border-stone-300" data-testid="admin-institutions">{q.data!.map((i) => <li key={i.id} className="py-3"><p className="font-bold">{i.name}</p><p className="text-xs text-stone">{i.slug}{i.city ? ` · ${i.city}` : ""}</p></li>)}</ul>}</div>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <h2 className="text-lg font-bold">Add an institution</h2>
        <Input label="Name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input label="Slug" required hint="lowercase letters, numbers and dashes" pattern="[a-z0-9-]+" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} />
        <Input label="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
        <div className="grid grid-cols-2 gap-3"><Input label="Latitude" type="number" step="any" value={f.latitude} onChange={(e) => setF({ ...f, latitude: e.target.value })} /><Input label="Longitude" type="number" step="any" value={f.longitude} onChange={(e) => setF({ ...f, longitude: e.target.value })} /></div>
        <Button type="submit" loading={create.isPending} disabled={f.name.trim().length < 2 || f.slug.trim().length < 2}>Add institution</Button>
      </form>
    </div>
  );
}

export function AdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const tabs: [Tab, string][] = [["overview", "Overview"], ["reports", "Reports"], ["verifications", "Verifications"], ["users", "Users"], ["institutions", "Institutions"]];
  return (
    <div>
      <PageHeader title="Admin" subtitle={user?.role === "admin" ? "Moderation and platform overview." : "Moderation tools for your institution."} />
      <div role="tablist" aria-label="Admin sections" className="mb-6 flex flex-wrap gap-1 rounded-md bg-stone-200/60 p-1 sm:inline-flex">
        {tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("rounded px-3 py-1.5 text-sm font-semibold", tab === k ? "bg-white text-forest shadow-sm" : "text-ink/70 hover:text-ink")}>{l}</button>)}
      </div>
      {tab === "overview" && <Overview />}{tab === "reports" && <ReportsTab />}{tab === "verifications" && <VerificationsTab />}{tab === "users" && <UsersTab />}{tab === "institutions" && <InstitutionsTab />}
    </div>
  );
}
