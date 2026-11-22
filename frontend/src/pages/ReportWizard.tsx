import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router-dom";
import { z } from "zod";
import { ImageUpload } from "@/components/ImageUpload";
import { MapPicker } from "@/components/MapView";
import { Button } from "@/components/ui/Button";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { PageHeader, Spinner, ErrorState } from "@/components/ui/misc";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { Api, type ReportPayload } from "@/services/endpoints";
import type { Report, ReportKind } from "@/types";
import { categoryLabel, CATEGORIES } from "@/utils/format";
import { splitIso, todayStr, toIso } from "@/utils/datetime";

const schema = z.object({
  title: z.string().trim().min(3, "Give the item a short name (at least 3 characters).").max(160),
  category: z.string().min(1, "Choose a category."),
  description: z.string().trim().min(10, "Describe the item in at least 10 characters. Details help matching.").max(2000),
  color: z.string().max(40).optional(),
  brand: z.string().max(80).optional(),
  location_name: z.string().trim().min(2, "Where was it? A building or area name is enough.").max(200),
  date: z.string().min(1, "Choose the date.").refine((d) => d <= todayStr(), "The date can't be in the future."),
  time: z.string().optional(),
  additional_details: z.string().max(2000).optional(),
  private_clues: z.string().max(2000).optional(),
  q1: z.string().max(300).optional(), q2: z.string().max(300).optional(), q3: z.string().max(300).optional(),
});
type Values = z.infer<typeof schema>;
const STEP_FIELDS: (keyof Values)[][] = [["title", "category", "description", "color", "brand"], ["location_name", "date", "time", "additional_details", "private_clues", "q1", "q2", "q3"], []];
const STEPS = ["Item details", "Where & when", "Review"];

export function ReportWizard({ kind: kindProp }: { kind?: ReportKind }) {
  const params = useParams();
  const draftIdParam = params.id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const inst = useQuery({ queryKey: ["institutions"], queryFn: Api.institutions });
  const draft = useQuery({ queryKey: ["report", draftIdParam], queryFn: () => Api.report(draftIdParam!), enabled: !!draftIdParam });
  const kind: ReportKind = (draft.data?.kind ?? kindProp ?? "lost");
  const editing = !!draft.data && draft.data.status !== "draft";

  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [existing, setExisting] = useState<Report["images"]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [reportId, setReportId] = useState<string | null>(draftIdParam ?? null);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [done, setDone] = useState<Report | null>(null);

  const f = useForm<Values>({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: { category: "", date: todayStr() } });
  const v = f.watch();
  const [reviewPreview, setReviewPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!files[0]) { setReviewPreview(null); return; }
    const url = URL.createObjectURL(files[0]);
    setReviewPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [files]);

  useEffect(() => {
    const d = draft.data;
    if (!d) return;
    const { date, time } = splitIso(d.event_date);
    const q = d.verification_questions ?? [];
    f.reset({ title: d.title, category: d.category, description: d.description, color: d.color ?? "", brand: d.brand ?? "", location_name: d.location_name ?? "", date: date || todayStr(), time: d.approx_time ?? time, additional_details: d.additional_details ?? "", private_clues: d.private_clues ?? "", q1: q[0] ?? "", q2: q[1] ?? "", q3: q[2] ?? "" });
    setExisting(d.images);
    if (d.latitude != null && d.longitude != null) setCoords({ lat: d.latitude, lng: d.longitude });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.data]);

  const payload = (x: Values): ReportPayload => ({
    kind, title: x.title || "", category: x.category || "other", description: x.description || "", color: x.color || null, brand: x.brand || null,
    location_name: x.location_name || null, latitude: coords?.lat ?? null, longitude: coords?.lng ?? null,
    event_date: x.date ? toIso(x.date, x.time) : null, approx_time: x.time || null, additional_details: x.additional_details || null,
    ...(kind === "found" ? { private_clues: x.private_clues || null, verification_questions: [x.q1, x.q2, x.q3].filter((q): q is string => !!q?.trim()) } : {}),
  });

  /** Persist the report as a server-side draft and upload any pending photos. Returns the report id. */
  async function persist(x: Values): Promise<string> {
    let id = reportId;
    if (!id) { const r = await Api.createReport(payload(x)); id = r.id; setReportId(id); }
    else await Api.updateReport(id, payload(x));
    for (const file of files) await Api.uploadImage(id, file);
    if (files.length) { setFiles([]); setExisting((await Api.report(id)).images); }
    return id;
  }

  async function saveDraft() {
    setBusy("draft");
    try { await persist(f.getValues()); await qc.invalidateQueries({ queryKey: ["reports"] }); toast.success("Draft saved. Find it in My reports."); nav("/reports"); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  async function submit(x: Values) {
    setBusy("submit");
    try {
      const id = await persist(x);
      if (editing) {
        await qc.invalidateQueries();
        toast.success("Changes saved. We've re-checked for matches.");
        nav(`/reports/${id}`);
        return;
      }
      const r = await Api.submitReport(id);
      await qc.invalidateQueries();
      setDone(r);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
  }

  async function next() { if (await f.trigger(STEP_FIELDS[step])) setStep(step + 1); }

  if (draftIdParam && draft.isLoading) return <Spinner label="Loading your draft" />;
  if (draftIdParam && draft.error) return <ErrorState error={draft.error} retry={() => draft.refetch()} />;

  if (done) return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-lg py-10 text-center" data-testid="report-success">
      <CheckCircle2 className="mx-auto h-12 w-12 text-leaf" aria-hidden />
      <h1 className="mt-4 text-2xl font-extrabold">{kind === "lost" ? "Your lost report is live" : "Thank you for reporting a found item"}</h1>
      <p className="mt-2 text-stone">
        {done.match_count > 0 ? `We found ${done.match_count} possible match${done.match_count > 1 ? "es" : ""} right away. Matches are leads that still need ownership verification.` : "We're comparing it with other reports now. You'll get a notification when a possible match appears."}
      </p>
      <div className="mt-6 flex justify-center gap-3">
        {done.match_count > 0 && <Button asChild><Link to="/matches">View matches</Link></Button>}
        <Button asChild variant={done.match_count > 0 ? "secondary" : "primary"}><Link to="/reports">Go to My reports</Link></Button>
      </div>
    </motion.div>
  );

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={editing ? "Edit report" : kind === "lost" ? "Report a lost item" : "Report a found item"} subtitle={kind === "lost" ? "The more detail you give, the better the match." : "Thanks for helping. You can keep identifying details private until someone proves ownership."} />
      <ol className="mb-8 flex items-center gap-2" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-1 items-center gap-2" aria-current={i === step ? "step" : undefined}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${i < step ? "bg-leaf text-white" : i === step ? "bg-forest text-white" : "bg-stone-200 text-stone"}`}>{i < step ? <Check className="h-4 w-4" aria-label="completed" /> : i + 1}</span>
            <span className={`hidden text-sm font-semibold sm:block ${i === step ? "text-forest" : "text-stone"}`}>{s}</span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-stone-300" />}
          </li>
        ))}
      </ol>
      <p className="mb-4 text-sm font-semibold text-stone sm:hidden">Step {step + 1} of 3 · {STEPS[step]}</p>

      <form noValidate className="space-y-5" onSubmit={(e) => {
        // Pressing Enter on an earlier step moves forward instead of submitting the whole report.
        if (step < 2) { e.preventDefault(); void next(); return; }
        void f.handleSubmit(submit)(e);
      }}>
        {step === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
            <Input label="Item name" required placeholder={kind === "lost" ? "e.g. Black Dell laptop" : "e.g. Blue water bottle"} error={f.formState.errors.title?.message} {...f.register("title")} />
            <Select label="Category" required error={f.formState.errors.category?.message} {...f.register("category")}>
              <option value="">Select a category…</option>{CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Select>
            <Textarea label="Description" required hint="Shape, size, stickers, scratches, what's inside…" error={f.formState.errors.description?.message} {...f.register("description")} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Colour" placeholder="e.g. black" error={f.formState.errors.color?.message} {...f.register("color")} />
              <Input label="Brand" placeholder="e.g. Dell" error={f.formState.errors.brand?.message} {...f.register("brand")} />
            </div>
            <ImageUpload files={files} onFiles={setFiles} existing={existing} onRemoveExisting={async (iid) => { if (reportId) { try { const r = await Api.deleteImage(reportId, iid); setExisting(r.images); } catch (e) { toast.error((e as Error).message); } } }} />
          </motion.div>
        )}

        {step === 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
            <Input label={kind === "lost" ? "Last seen location" : "Where did you find it?"} required placeholder="e.g. Main library, 2nd floor" error={f.formState.errors.location_name?.message} {...f.register("location_name")} />
            <div>
              <span className="label">Mark the approximate spot (optional)</span>
              <MapPicker value={coords} center={inst.data?.find((i) => i.id === user?.institution_id) ? { latitude: inst.data.find((i) => i.id === user?.institution_id)!.latitude ?? 12.8625, longitude: inst.data.find((i) => i.id === user?.institution_id)!.longitude ?? 77.4375 } : null} onChange={setCoords} />
              <p className="hint">Click the map to drop a pin. Other people only ever see an approximate area. Don't mark your home or other private places.</p>
              {coords && <Button type="button" variant="link" size="sm" onClick={() => setCoords(null)}>Clear pin</Button>}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label={kind === "lost" ? "Date lost" : "Date found"} type="date" required max={todayStr()} error={f.formState.errors.date?.message} {...f.register("date")} />
              <Input label="Approximate time" type="time" hint="Optional" {...f.register("time")} />
            </div>
            <Textarea label="Additional details" rows={3} {...f.register("additional_details")} />
            {kind === "found" && (
              <fieldset className="space-y-4 rounded-lg bg-mint/60 p-4">
                <legend className="flex items-center gap-2 px-1 text-sm font-bold text-forest"><ShieldCheck className="h-4 w-4" aria-hidden />Private ownership clues</legend>
                <p className="text-xs text-ink/80">Never shown publicly. Only you and authorised reviewers see these when someone claims the item.</p>
                <Textarea label="Identifying details you noticed" rows={3} placeholder="e.g. a crack on the bottom-left corner, wallpaper image, engraving" {...f.register("private_clues")} />
                <Input label="Question 1 for a claimant (optional)" placeholder="What sticker is on the lid?" {...f.register("q1")} />
                <Input label="Question 2 (optional)" {...f.register("q2")} />
                <Input label="Question 3 (optional)" {...f.register("q3")} />
                <p className="hint">If you leave these empty, we'll ask generic questions instead.</p>
              </fieldset>
            )}
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4" data-testid="review-step">
            <div className="flex gap-4">
              {(reviewPreview || existing[0]) && <img src={reviewPreview ?? existing[0].url} alt="Item" className="h-24 w-24 rounded-md object-cover" />}
              <div><h2 className="text-lg font-bold">{v.title}</h2><p className="text-sm text-stone">{categoryLabel(v.category)}{v.color ? ` · ${v.color}` : ""}{v.brand ? ` · ${v.brand}` : ""}</p><p className="mt-1 text-sm">{v.description}</p></div>
            </div>
            <dl className="grid gap-3 border-t border-stone-300 pt-4 text-sm sm:grid-cols-2">
              <div><dt className="font-semibold text-stone">Location</dt><dd>{v.location_name}{coords ? " (pin set)" : ""}</dd></div>
              <div><dt className="font-semibold text-stone">When</dt><dd>{v.date} {v.time}</dd></div>
              {v.additional_details && <div className="sm:col-span-2"><dt className="font-semibold text-stone">Additional details</dt><dd>{v.additional_details}</dd></div>}
              {kind === "found" && v.private_clues && <div className="sm:col-span-2"><dt className="font-semibold text-stone">Private clues (hidden from others)</dt><dd>{v.private_clues}</dd></div>}
              <div><dt className="font-semibold text-stone">Photos</dt><dd>{files.length + existing.length || "None"}</dd></div>
            </dl>
            {!editing && <p className="rounded-md bg-sun-100 px-3 py-2 text-xs">By submitting you confirm this report is genuine. Reports that look fake are flagged for review.</p>}
          </motion.div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-300 pt-5">
          <div className="flex gap-2">
            {step > 0 && <Button type="button" variant="secondary" onClick={() => setStep(step - 1)}><ArrowLeft className="h-4 w-4" />Back</Button>}
            {!editing && <Button type="button" variant="ghost" loading={busy === "draft"} onClick={saveDraft}>Save draft</Button>}
          </div>
          {step < 2 ? <Button key="continue" type="button" onClick={next}>Continue<ArrowRight className="h-4 w-4" /></Button> : <Button key="submit" type="submit" loading={busy === "submit"}>{editing ? "Save changes" : "Submit report"}</Button>}
        </div>
      </form>
    </div>
  );
}

export const LostWizard = () => <ReportWizard kind="lost" />;
export const FoundWizard = () => <ReportWizard kind="found" />;
