import { useQuery } from "@tanstack/react-query";
import { MapPinned } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapView } from "@/components/MapView";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, PageHeader, Spinner } from "@/components/ui/misc";
import { Api } from "@/services/endpoints";
import type { MapPoint } from "@/types";
import { cn } from "@/utils/cn";

const KINDS: { kind: MapPoint["kind"]; label: string; dot: string }[] = [
  { kind: "lost", label: "Lost", dot: "bg-[#c0792b]" }, { kind: "found", label: "Found", dot: "bg-leaf" }, { kind: "recovery", label: "Recovery points", dot: "bg-forest" },
];

export function MapPage() {
  const q = useQuery({ queryKey: ["map"], queryFn: Api.mapPoints });
  const [shown, setShown] = useState<Record<string, boolean>>({ lost: true, found: true, recovery: true });
  const points = useMemo(() => (q.data?.points ?? []).filter((p) => shown[p.kind]), [q.data, shown]);

  return (
    <div>
      <PageHeader title="Campus map" subtitle="Open reports and recovery points on your campus. Locations are approximate and never show anyone's home." />
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Map layers">
        {KINDS.map((k) => (
          <button key={k.kind} aria-pressed={shown[k.kind]} onClick={() => setShown({ ...shown, [k.kind]: !shown[k.kind] })} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold", shown[k.kind] ? "border-forest bg-white" : "border-stone-300 bg-stone-200/50 text-stone")}>
            <span className={cn("h-3 w-3 rounded-full", k.dot, !shown[k.kind] && "opacity-40")} aria-hidden />{k.label}
          </button>
        ))}
      </div>
      {q.isLoading ? <Spinner label="Loading map" /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : (
        <>
          <MapView points={points} center={q.data!.center} />
          {(q.data!.points.length === 0) && <div className="mt-4"><EmptyState icon={MapPinned} title="No pinned reports yet" text="Reports with a pin on the map appear here. Drop a pin when you report an item." action={<Button asChild><Link to="/report/lost">Report an item</Link></Button>} /></div>}
          {points.length > 0 && (
            <section className="mt-6" aria-label="Locations as a list">
              <h2 className="mb-2 text-lg font-bold">In a list</h2>
              <ul className="divide-y divide-stone-200 border-y border-stone-300 text-sm">
                {points.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 py-2.5"><span className="min-w-0 truncate"><strong className="capitalize">{p.kind}</strong> · {p.title}{p.location_name ? ` · ${p.location_name}` : ""}</span>{p.kind !== "recovery" && p.mine && <Link to={`/reports/${p.id}`} className="shrink-0 font-semibold text-leaf hover:underline">Open</Link>}</li>)}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
