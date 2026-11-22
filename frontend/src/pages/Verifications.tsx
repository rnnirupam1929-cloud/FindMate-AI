import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Lock, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router-dom";
import { z } from "zod";
import { ReportThumb } from "@/components/ReportThumb";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { Textarea } from "@/components/ui/Field";
import { EmptyState, ErrorState, PageHeader, Spinner, StatusBadge } from "@/components/ui/misc";
import { useToast } from "@/hooks/useToast";
import { Api } from "@/services/endpoints";
import type { Report, Verification } from "@/types";
import { cn } from "@/utils/cn";
import { formatDate, timeAgo } from "@/utils/format";

export function VerificationsPage() {
  const q = useQuery({ queryKey: ["verifications"], queryFn: Api.verifications });
  return (
    <div>
      <PageHeader title="Verifications" subtitle="Ownership checks for claims on found items. Private answers are only visible to you and the reviewer." />
      {q.isLoading ? <Spinner label="Loading verifications" /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : q.data!.items.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No verifications yet" text="When you claim a possible match, or someone claims an item you found, it shows up here." action={<Button asChild variant="secondary"><Link to="/matches">Review matches</Link></Button>} />
      ) : (
        <ul className="divide-y divide-stone-200 border-y border-stone-300" data-testid="verification-list">
          {q.data!.items.map((v) => (
            <li key={v.id}>
              <Link to={`/verifications/${v.id}`} className="flex flex-wrap items-center gap-3 py-4 hover:bg-mint/40">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-bold text-forest">{v.found_title}</p>
                  <p className="text-xs text-stone">{v.role === "claimant" ? "You are claiming this item" : "You are reviewing this claim"} · updated {timeAgo(v.updated_at)}</p>
                </div>
                <StatusBadge value={v.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const STAGES = [["pending", "Questions"], ["under_review", "Under review"], ["approved", "Approved"], ["completed", "Handed over"]] as const;
const ORDER = ["pending", "under_review", "approved", "completed"];

function Progress({ status }: { status: Verification["status"] }) {
  const rejected = status === "rejected";
  const idx = rejected ? 1 : ORDER.indexOf(status);
  return (
    <ol className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Verification progress">
      {STAGES.map(([k, label], i) => (
        <li key={k} aria-current={i === idx ? "step" : undefined} className={cn("border-t-2 pt-2 text-sm", rejected && i === 1 ? "border-danger font-semibold text-danger" : i <= idx && !rejected ? "border-leaf font-semibold text-forest" : "border-stone-300 text-stone")}>
          <span className="flex items-center gap-1.5">{i < idx && !rejected && <Check className="h-4 w-4 text-leaf" aria-hidden />}{rejected && i === 1 ? "Not approved" : label}</span>
        </li>
      ))}
    </ol>
  );
}

function Compare({ lost, found, showFoundDescription }: { lost: Report; found: Report; showFoundDescription?: boolean }) {
  return (
    <div className="grid gap-4 border-y border-stone-300 py-4 sm:grid-cols-2">
      {[["Lost report", lost], ["Found report", found]].map(([label, r]) => {
        const rep = r as Report;
        return (
          <div key={label as string} className="flex gap-3">
            <ReportThumb report={rep} className="h-16 w-16 shrink-0" />
            <div className="min-w-0"><p className="text-xs font-bold uppercase tracking-wide text-stone">{label as string}</p><p className="truncate font-bold">{rep.title}</p>
              {(showFoundDescription || rep.kind === "lost") && <p className="line-clamp-3 text-sm">{rep.description}</p>}</div>
          </div>
        );
      })}
    </div>
  );
}

const answersSchema = (n: number) => z.object({ answers: z.array(z.object({ answer: z.string().trim().min(2, "Please answer this question (at least 2 characters).").max(1000) })).length(n) });

function ClaimantForm({ v }: { v: Verification }) {
  const qc = useQueryClient();
  const toast = useToast();
  const f = useForm<{ answers: { answer: string }[] }>({ resolver: zodResolver(answersSchema(v.questions.length)), defaultValues: { answers: v.questions.map(() => ({ answer: "" })) } });
  const m = useMutation({
    mutationFn: (x: { answers: { answer: string }[] }) => Api.submitAnswers(v.id, x.answers.map((a, i) => ({ question: v.questions[i], answer: a.answer }))),
    onSuccess: () => { toast.success("Answers sent for review."); void qc.invalidateQueries(); }, onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form noValidate onSubmit={f.handleSubmit((x) => m.mutate(x))} className="space-y-5" aria-label="Ownership questions">
      <div className="flex items-start gap-2 rounded-md bg-mint/70 p-3 text-sm"><Lock className="mt-0.5 h-4 w-4 shrink-0 text-leaf" aria-hidden />Only the finder or an authorised reviewer will see your answers. Be specific: details only the owner would know.</div>
      {v.questions.map((q, i) => <Textarea key={q} rows={3} label={q} required error={f.formState.errors.answers?.[i]?.answer?.message} {...f.register(`answers.${i}.answer`)} />)}
      <Button type="submit" loading={m.isPending}>Submit answers for review</Button>
    </form>
  );
}

function ReviewerPanel({ v }: { v: Verification }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const m = useMutation({
    mutationFn: (d: "approved" | "rejected") => Api.review(v.id, d, note || undefined),
    onSuccess: (r) => { toast.success(r.status === "approved" ? "Claim approved." : "Claim rejected."); setDecision(null); void qc.invalidateQueries(); }, onError: (e: Error) => { toast.error(e.message); setDecision(null); },
  });
  return (
    <div className="space-y-5">
      <section><h2 className="font-bold">What you recorded privately</h2><p className="mt-1 rounded-md bg-sun-100/70 p-3 text-sm">{v.private_clues || "No private clues were added. Compare the answers with the item itself."}</p></section>
      <section><h2 className="font-bold">The claimant's answers</h2>
        <dl className="mt-2 space-y-3">{v.answers.map((a) => <div key={a.question}><dt className="text-sm text-stone">{a.question}</dt><dd className="mt-0.5 whitespace-pre-line rounded-md border border-stone-300 bg-white p-3 text-sm">{a.answer}</dd></div>)}</dl>
      </section>
      <Textarea label="Note for the claimant (optional)" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} hint="Shared with the claimant, e.g. where to meet or what didn't match." />
      <div className="flex flex-wrap gap-2"><Button onClick={() => setDecision("approved")}>Approve claim</Button><Button variant="danger" onClick={() => setDecision("rejected")}>Reject claim</Button></div>
      <ConfirmDialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)} destructive={decision === "rejected"} title={decision === "approved" ? "Approve this claim?" : "Reject this claim?"}
        description={decision === "approved" ? "You're confirming the answers show real ownership. The claimant will be notified and a handover can be arranged." : "The match will be dismissed and the claimant notified. This can't be undone."}
        confirmLabel={decision === "approved" ? "Approve" : "Reject"} loading={m.isPending} onConfirm={() => decision && m.mutate(decision)} />
    </div>
  );
}

function Handover({ v }: { v: Verification }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const m = useMutation({ mutationFn: () => Api.complete(v.id, note || undefined), onSuccess: () => { toast.success("Recovery recorded. Both sides were notified."); setConfirm(false); void qc.invalidateQueries(); }, onError: (e: Error) => { toast.error(e.message); setConfirm(false); } });
  return (
    <div className="space-y-3">
      <Textarea label="Handover note (optional)" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} hint="e.g. handed over at the security desk, 4 pm." />
      <Button onClick={() => setConfirm(true)}>Record handover</Button>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Record this handover?" description="Only do this after the item has really been given back. Both reports will be marked recovered." confirmLabel="Record handover" loading={m.isPending} onConfirm={() => m.mutate()} />
    </div>
  );
}

export function VerificationDetailPage() {
  const { id = "" } = useParams();
  const q = useQuery({ queryKey: ["verification", id], queryFn: () => Api.verification(id) });
  if (q.isLoading) return <Spinner label="Loading verification" />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const v = q.data;
  const claimant = v.role === "claimant";

  return (
    <div className="max-w-3xl">
      <Link to="/verifications" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-leaf hover:underline"><ArrowLeft className="h-4 w-4" />All verifications</Link>
      <PageHeader title={claimant ? "Prove this item is yours" : "Review an ownership claim"} subtitle={`${v.found_report.title} · updated ${formatDate(v.updated_at, true)}`} actions={<StatusBadge value={v.status} />} />
      <Progress status={v.status} />
      <Compare lost={v.lost_report} found={v.found_report} showFoundDescription />

      <div className="mt-6" data-testid="verification-body">
        {v.status === "pending" && claimant && <ClaimantForm v={v} />}
        {v.status === "pending" && !claimant && <p className="rounded-md bg-sun-100 p-4 text-sm" role="status">The claimant is answering your ownership questions. You'll be notified when they're ready for review.</p>}

        {v.status === "under_review" && claimant && (
          <div className="space-y-4"><p className="rounded-md bg-sun-100 p-4 text-sm" role="status">Your answers were sent. The finder or a verification agent will review them. You'll be notified.</p>
            <dl className="space-y-3">{v.answers.map((a) => <div key={a.question}><dt className="text-sm text-stone">{a.question}</dt><dd className="mt-0.5 whitespace-pre-line text-sm">{a.answer}</dd></div>)}</dl></div>
        )}
        {v.status === "under_review" && !claimant && <ReviewerPanel v={v} />}

        {v.status === "rejected" && (
          <div className="rounded-md bg-[#f4dcd9] p-4 text-sm" role="status"><p className="font-bold text-danger">This claim was not approved.</p>{v.reviewer_note && <p className="mt-1">Reviewer's note: {v.reviewer_note}</p>}<p className="mt-2">Think it's a mistake? You can keep looking through your other <Link to="/matches" className="font-semibold underline">matches</Link>.</p></div>
        )}

        {(v.status === "approved" || v.status === "completed") && (
          <div className="space-y-5">
            <div className="rounded-md bg-mint p-4 text-sm" role="status"><p className="font-bold text-forest">{v.status === "completed" ? "Recovery completed. The item has been returned." : "Claim approved. Time to arrange a safe handover."}</p>{v.reviewer_note && <p className="mt-1">Note: {v.reviewer_note}</p>}{v.handover_note && <p className="mt-1">Handover: {v.handover_note}</p>}</div>
            {v.guidance && v.status === "approved" && (
              <div><h2 className="font-bold">Safe handover tips</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{v.guidance.guidance.map((g) => <li key={g}>{g}</li>)}</ul>
                <p className="mt-3 text-sm text-stone">Suggested message:</p><blockquote className="mt-1 rounded-md border-l-4 border-leaf bg-white p-3 text-sm">{v.guidance.suggested_message}</blockquote></div>
            )}
            {v.status === "approved" && !claimant && <Handover v={v} />}
            {v.status === "approved" && claimant && <p className="text-sm text-stone">Once you've received your item, the finder records the handover to close this out.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
