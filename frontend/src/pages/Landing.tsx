import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowRight, EyeOff, Handshake, MapPinned, ScanSearch, ShieldCheck, UserCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Api } from "@/services/endpoints";

function Bottle({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 48 72" className="h-16 w-11" aria-hidden>
      <rect x="18" y="2" width="12" height="8" rx="2" fill="#242B27" />
      <path d="M17 10h14l3 10v42a6 6 0 0 1-6 6H20a6 6 0 0 1-6-6V20z" fill={color} />
      <rect x="14" y="30" width="20" height="12" fill="#fff" opacity=".35" />
    </svg>
  );
}

/** A static illustration of how a lead looks. It is labelled as an example, not real data. */
function ExampleMatch() {
  const rows: [string, string, number][] = [
    ["Category", "Water bottle = water bottle", 100],
    ["Description", "Shared: steel, sticker, dent", 74],
    ["Location", "Same building", 90],
    ["Date", "Same day", 95],
  ];
  return (
    <figure className="rounded-lg border border-stone-300 bg-white" aria-label="Example of a possible match">
      <div className="grid grid-cols-2 divide-x divide-stone-200">
        {[["Lost", "Tue 10:40", "Navy steel bottle", "Library, 2nd floor", "#1f3f6e"], ["Found", "Tue 14:15", "Blue metal bottle", "Library reading hall", "#2a4f86"]].map(([k, t, n, l, c]) => (
          <div key={k} className="p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-stone">{k} · {t}</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-md bg-mint"><Bottle color={c} /></div>
              <div className="min-w-0"><p className="text-sm font-bold leading-snug">{n}</p><p className="mt-0.5 text-xs text-stone">{l}</p></div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-stone-200 p-4 sm:p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border-4 border-leaf bg-mint text-forest"><span className="text-lg font-extrabold leading-none">82</span></div>
          <div><p className="text-sm font-bold">Possible match</p><p className="text-xs text-stone">Why it was suggested, in plain words:</p></div>
        </div>
        <ul className="mt-4 space-y-2.5">
          {rows.map(([k, why, v]) => (
            <li key={k} className="text-xs">
              <div className="mb-1 flex justify-between gap-3"><span className="font-semibold">{k}</span><span className="text-stone">{why}</span></div>
              <div className="h-1.5 rounded-full bg-stone-200"><div className="h-full rounded-full bg-leaf" style={{ width: `${v}%` }} /></div>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="flex items-start gap-2 rounded-b-lg bg-sun-100 px-4 py-3 text-xs sm:px-5">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-forest" aria-hidden />
        <span><strong>Illustrative example.</strong> A score is a lead, not proof. The owner still has to answer private questions that a person reviews.</span>
      </figcaption>
    </figure>
  );
}

const STEPS = [
  { icon: ScanSearch, title: "Report it", text: "Describe what you lost or found, add a photo and a place. Finders can keep identifying details private." },
  { icon: MapPinned, title: "We compare reports", text: "FindMate compares category, colour, description, place and time across every open report on your campus." },
  { icon: UserCheck, title: "Prove it's yours", text: "The owner answers private questions. The finder or a verification agent decides. The software never does." },
  { icon: Handshake, title: "Hand it over safely", text: "Meet at a campus spot, record the handover, and both sides are notified." },
];

const SAFETY = [
  { icon: ShieldCheck, title: "A person approves every handover", text: "AI suggests leads. It never confirms ownership, however high the score." },
  { icon: EyeOff, title: "Private clues stay private", text: "The detail only the owner would know is shown to the finder and reviewers, never in public." },
  { icon: MapPinned, title: "Approximate places only", text: "Others see an area rounded to roughly 100 m. Photo location data is stripped on upload." },
];

const FAQ: [string, string][] = [
  ["How does FindMate decide two reports match?", "It scores category, colour, description wording, location and time, and shows you each part so you can judge for yourself. Photo comparison today is a basic colour check; deeper image matching is planned and clearly marked as not yet active."],
  ["Does a high score mean the item is mine?", "No. A score is only a lead. To claim an item you answer private questions, and a person (the finder or a verification agent) approves or rejects your claim."],
  ["What do other people see about my report?", "Item details and an approximate place. They never see your email, phone number or exact location, and a finder's private clues are hidden until a claim is reviewed."],
  ["I found something. Do I have to describe everything?", "No. Share enough to help the owner recognise it and keep one or two distinguishing details back as private clues. You can also write your own ownership questions."],
  ["Which campuses does it work for?", "We're piloting at Dayananda Sagar University, Bengaluru. The platform is built to support more institutions."],
  ["Is there a cost?", "FindMate AI is free to use during the pilot."],
];

function Stat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <div className="px-4 py-6 text-center sm:py-8">
      <p className="text-4xl font-extrabold text-forest" data-testid={`stat-${label}`}>{value ?? "–"}</p>
      <p className="mt-1 text-sm text-stone">{label}</p>
    </div>
  );
}

export function LandingPage() {
  const stats = useQuery({ queryKey: ["public-stats"], queryFn: Api.publicStats, staleTime: 60_000 });

  return (
    <main id="main">
      <section className="border-b border-stone-200">
        <div className="container-page grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <p className="text-sm font-bold text-leaf">Campus lost &amp; found, rebuilt</p>
            <h1 className="mt-3 text-4xl font-extrabold leading-[1.1] sm:text-5xl lg:text-[3.4rem]">Lost something? Let AI find it.</h1>
            <p className="mt-5 max-w-xl text-lg text-ink/80">
              FindMate AI connects what people lose with what people find. It suggests likely matches, then a real person checks ownership before anything changes hands.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild><Link to="/report/lost">Report Lost Item<ArrowRight className="h-4 w-4" /></Link></Button>
              <Button size="lg" variant="secondary" asChild><Link to="/report/found">I Found Something</Link></Button>
            </div>
            <p className="mt-4 text-sm text-stone">Free for students. Piloting at Dayananda Sagar University, Bengaluru.</p>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}><ExampleMatch /></motion.div>
        </div>
      </section>

      <section id="how" className="scroll-mt-16 py-16 sm:py-20">
        <div className="container-page">
          <h2 className="max-w-xl text-3xl font-extrabold">From "where is it?" to handed back, in four steps</h2>
          <ol className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-t-2 border-forest pt-4">
                <div className="flex items-center gap-3"><span className="text-sm font-extrabold text-leaf">0{i + 1}</span><s.icon className="h-5 w-5 text-forest" aria-hidden /></div>
                <h3 className="mt-3 text-lg font-bold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-ink/80">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="bg-mint/50 py-16 sm:py-20">
        <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="text-3xl font-extrabold">Why it works better than a notice board</h2>
            <p className="mt-3 text-ink/80">Lost-and-found desks and group chats rely on someone scrolling at the right time. FindMate does the looking for you.</p>
          </div>
          <dl className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
            {[
              ["It searches while you study", "Every new report is compared with everything already open, and you're notified when something looks right."],
              ["Reasons, not just a number", "Each match explains what lined up, so you can tell a strong lead from a weak one."],
              ["Built for privacy", "No public phone numbers, no exact locations, no unnecessary personal data."],
              ["One place for the whole recovery", "Report, match, verify, hand over and record it, instead of five different chats."],
            ].map(([t, d]) => (
              <div key={t}><dt className="font-bold text-forest">{t}</dt><dd className="mt-1 text-sm text-ink/80">{d}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section className="py-16 sm:py-20" aria-labelledby="impact">
        <div className="container-page">
          <h2 id="impact" className="text-3xl font-extrabold">Community impact</h2>
          <p className="mt-2 max-w-xl text-sm text-stone">Live counts from the platform. We show real numbers only, so early on they're small.</p>
          {stats.isError ? (
            <p className="mt-6 text-sm text-stone">Live numbers are unavailable right now.</p>
          ) : (
            <div className="mt-6 grid grid-cols-1 divide-y divide-stone-300 rounded-lg border border-stone-300 bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <Stat value={stats.data?.reports} label="Reports filed" />
              <Stat value={stats.data?.recoveries} label="Items recovered" />
              <Stat value={stats.data?.institutions} label="Campuses" />
            </div>
          )}
        </div>
      </section>

      <section id="safety" className="scroll-mt-16 bg-forest py-16 text-white sm:py-20">
        <div className="container-page">
          <h2 className="max-w-xl text-3xl font-extrabold text-white">Safety and verification come first</h2>
          <p className="mt-3 max-w-2xl text-white/80">Getting an item back should never mean handing it to the wrong person.</p>
          <ul className="mt-10 grid gap-8 md:grid-cols-3">
            {SAFETY.map((s) => (
              <li key={s.title}><s.icon className="h-6 w-6 text-sun" aria-hidden /><h3 className="mt-3 text-lg font-bold text-white">{s.title}</h3><p className="mt-1 text-sm text-white/80">{s.text}</p></li>
            ))}
          </ul>
        </div>
      </section>

      <section id="faq" className="scroll-mt-16 py-16 sm:py-20">
        <div className="container-page grid gap-10 lg:grid-cols-[1fr_1.6fr]">
          <h2 className="text-3xl font-extrabold">Questions</h2>
          <div className="divide-y divide-stone-300 border-y border-stone-300">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bold text-forest">{q}<span aria-hidden className="text-xl text-leaf transition-transform group-open:rotate-45">+</span></summary>
                <p className="mt-2 text-sm text-ink/80">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-stone-200 bg-mint/50 py-14 text-center">
        <div className="container-page">
          <h2 className="text-2xl font-extrabold sm:text-3xl">Lost it or found it? Start with a two-minute report.</h2>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild><Link to="/report/lost">Report Lost Item</Link></Button>
            <Button size="lg" variant="secondary" asChild><Link to="/report/found">I Found Something</Link></Button>
          </div>
        </div>
      </section>
    </main>
  );
}
