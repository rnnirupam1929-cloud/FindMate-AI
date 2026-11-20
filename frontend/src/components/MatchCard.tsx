import { Eye, Flag, ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, Modal } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/misc";
import { ReportThumb } from "@/components/ReportThumb";
import { useToast } from "@/hooks/useToast";
import { Api } from "@/services/endpoints";
import type { Match, Report } from "@/types";
import { categoryLabel, formatDate, SCORE_LABELS } from "@/utils/format";
import { cn } from "@/utils/cn";

export function ScoreBars({ breakdown }: { breakdown: Match["breakdown"] }) {
  return (
    <ul className="space-y-2" aria-label="Score breakdown">
      {Object.keys(SCORE_LABELS).map((k) => {
        const v = breakdown[k];
        return (
          <li key={k} className="text-xs">
            <div className="mb-1 flex justify-between"><span className="font-semibold">{SCORE_LABELS[k]}</span><span className="text-stone">{v == null ? "Not available" : `${Math.round(v * 100)}%`}</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-stone-200"><div className={cn("h-full rounded-full", v == null ? "bg-transparent" : "bg-leaf")} style={{ width: `${(v ?? 0) * 100}%` }} /></div>
          </li>
        );
      })}
    </ul>
  );
}

export const ScoreBadge = ({ score }: { score: number }) => (
  <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-full border-4 border-leaf bg-mint text-forest" aria-label={`Match score ${Math.round(score)} out of 100`}>
    <span className="text-lg font-extrabold leading-none">{Math.round(score)}</span><span className="text-[10px] font-semibold uppercase">score</span>
  </div>
);

function Side({ label, r }: { label: string; r: Report }) {
  return (
    <div className="flex min-w-0 flex-1 gap-3">
      <ReportThumb report={r} className="h-20 w-20 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-stone">{label}</p>
        <p className="truncate font-bold">{r.title}</p>
        <p className="text-xs text-stone">{categoryLabel(r.category)}{r.color ? ` · ${r.color}` : ""}{r.brand ? ` · ${r.brand}` : ""}</p>
        <p className="truncate text-xs text-stone">{r.location_name} · {formatDate(r.event_date)}</p>
      </div>
    </div>
  );
}

export function MatchCard({ match, detailed }: { match: Match; detailed?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [flag, setFlag] = useState(false);
  const [reason, setReason] = useState("");
  const done = () => { void qc.invalidateQueries(); };
  const dismiss = useMutation({ mutationFn: () => Api.dismissMatch(match.id), onSuccess: () => { toast.success("Match dismissed."); setConfirm(false); done(); }, onError: (e: Error) => toast.error(e.message) });
  const report = useMutation({ mutationFn: () => Api.flagMatch(match.id, reason), onSuccess: () => { toast.success("Thanks. Our moderators will review this."); setFlag(false); done(); }, onError: (e: Error) => toast.error(e.message) });
  const verify = useMutation({ mutationFn: () => Api.startVerification(match.id), onSuccess: (v) => { done(); navigate(`/verifications/${v.id}`); }, onError: (e: Error) => toast.error(e.message) });
  const actionable = match.status === "suggested" && match.my_side !== "staff";

  return (
    <article className="border-t border-stone-300 py-5 first:border-t-0" data-testid="match-card">
      <div className="flex flex-wrap items-center gap-4">
        <ScoreBadge score={match.score} />
        <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2"><Side label="Lost" r={match.lost_report} /><Side label="Found" r={match.found_report} /></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <StatusBadge value={match.status} />
        {match.verification_status && <StatusBadge value={match.verification_status} />}
        <p className="text-xs text-stone">A match score is a lead, not proof of ownership.</p>
      </div>
      <details className="mt-3 text-sm" open={detailed}>
        <summary className="cursor-pointer font-semibold text-leaf">Why this was suggested</summary>
        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          <ul className="list-disc space-y-1 pl-5">{match.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          <ScoreBars breakdown={match.breakdown} />
        </div>
      </details>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm"><Link to={`/matches/${match.id}`}><Eye className="h-4 w-4" />Review match</Link></Button>
        {match.verification_id && <Button asChild variant="secondary" size="sm"><Link to={`/verifications/${match.verification_id}`}><ShieldCheck className="h-4 w-4" />Open verification</Link></Button>}
        {actionable && match.my_side === "lost" && <Button size="sm" loading={verify.isPending} onClick={() => verify.mutate()}><ShieldCheck className="h-4 w-4" />This is mine — verify</Button>}
        {actionable && <Button variant="ghost" size="sm" onClick={() => setConfirm(true)}><X className="h-4 w-4" />Not a match</Button>}
        {match.status !== "confirmed" && match.status !== "dismissed" && match.my_side !== "staff" && <Button variant="ghost" size="sm" onClick={() => setFlag(true)}><Flag className="h-4 w-4" />Report suspicious</Button>}
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Dismiss this match?" description="It will be removed from your list. This helps FindMate learn which suggestions were wrong." confirmLabel="Dismiss match" loading={dismiss.isPending} onConfirm={() => dismiss.mutate()} />
      <Modal open={flag} onOpenChange={setFlag} title="Report a suspicious match" description="Tell us what looks wrong. A moderator will review it. The other person is not notified.">
        <Textarea label="What looks suspicious?" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setFlag(false)}>Cancel</Button><Button variant="danger" disabled={reason.trim().length < 3} loading={report.isPending} onClick={() => report.mutate()}>Send report</Button></div>
      </Modal>
    </article>
  );
}
