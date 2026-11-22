import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, LocateFixed, MapPinned, Navigation, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { EmptyState, ErrorState, PageHeader, Spinner } from "@/components/ui/misc";
import { Api } from "@/services/endpoints";
import type { MapPoint } from "@/types";
import { cn } from "@/utils/cn";
import { distanceInMeters, formatDistance, type Coordinates } from "@/utils/distance";

const CAMPUS_MAP_PAGE = "https://www.dsu.edu.in/international/international-affairs/Maps.html";
const CAMPUS_MAP_EMBED = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d4115.819924313437!2d77.45082977654906!3d12.661429081556156!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bae5b8078f7117f%3A0x9d224216772af744!2sDSU%20School%20of%20Engineering!5e1!3m2!1sen!2sin!4v1729669130289!5m2!1sen!2sin";
const WALKING_ROUTE_API = "https://routing.openstreetmap.de/routed-foot/route/v1/driving";

interface WalkingRouteResponse {
  code: string;
  routes: {
    distance: number;
    duration: number;
    geometry: { coordinates: [number, number][] };
    legs: { steps: { distance: number; name: string; maneuver: { type: string; modifier?: string } }[] }[];
  }[];
}

function locationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return "Location access was denied. Allow location access in your browser to use walking directions.";
  if (error.code === error.POSITION_UNAVAILABLE) return "Your current location is unavailable. Check your device location settings and try again.";
  return "Finding your location timed out. Please try again.";
}

const KINDS: { kind: MapPoint["kind"]; label: string; dot: string }[] = [
  { kind: "lost", label: "Lost", dot: "bg-[#c0792b]" }, { kind: "found", label: "Found", dot: "bg-leaf" }, { kind: "recovery", label: "Recovery points", dot: "bg-forest" },
];

export function MapPage() {
  const q = useQuery({ queryKey: ["map"], queryFn: Api.mapPoints });
  const [shown, setShown] = useState<Record<string, boolean>>({ lost: true, found: true, recovery: true });
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [walking, setWalking] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [route, setRoute] = useState<{ distance: number; duration: number; steps: string[] } | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const lastRouteRequest = useRef<{ targetId: string; origin: Coordinates; at: number } | null>(null);
  const routeRequest = useRef<AbortController | null>(null);
  const routeTargetId = useRef<string | null>(null);
  const points = useMemo(() => (q.data?.points ?? []).filter((p) => shown[p.kind]), [q.data, shown]);
  const handleSelectPoint = useCallback((point: MapPoint) => {
    setSelectedPoint(point);
    setRoute(null);
    setRouteError(null);
  }, []);

  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("This browser does not support location access.");
      return;
    }
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setUserLocation({ latitude: coords.latitude, longitude: coords.longitude }),
      (error) => setLocationError(locationErrorMessage(error)),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );
  }, []);

  useEffect(() => {
    if (!walking || !navigator.geolocation) return;
    watchId.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        setUserLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setLocationError(null);
      },
      (error) => {
        setLocationError(locationErrorMessage(error));
        setWalking(false);
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 },
    );
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    };
  }, [walking]);

  useEffect(() => {
    if (!walking || !selectedPoint) {
      routeRequest.current?.abort();
      routeRequest.current = null;
      routeTargetId.current = null;
      return;
    }
    if (routeTargetId.current !== selectedPoint.id) {
      routeRequest.current?.abort();
      routeRequest.current = null;
      lastRouteRequest.current = null;
      routeTargetId.current = selectedPoint.id;
    }
    if (!userLocation) return;
    const previous = lastRouteRequest.current;
    if (previous?.targetId === selectedPoint.id
      && Date.now() - previous.at < 20_000
      && distanceInMeters(previous.origin, userLocation) < 25) return;

    const controller = new AbortController();
    routeRequest.current?.abort();
    routeRequest.current = controller;
    lastRouteRequest.current = { targetId: selectedPoint.id, origin: userLocation, at: Date.now() };
    setRouteError(null);
    const query = new URLSearchParams({ overview: "full", geometries: "geojson", steps: "true" });
    const url = `${WALKING_ROUTE_API}/${userLocation.longitude},${userLocation.latitude};${selectedPoint.longitude},${selectedPoint.latitude}?${query}`;
    void fetch(url, { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error(`Walking route service returned ${response.status}.`);
      return await response.json() as WalkingRouteResponse;
    }).then((result) => {
      const bestRoute = result.routes?.[0];
      if (result.code !== "Ok" || !bestRoute?.geometry?.coordinates?.length) {
        throw new Error("No walking route is available for this pin. Try opening the directions in Google Maps.");
      }
      const steps = bestRoute.legs.flatMap((leg) => leg.steps)
        .filter((step) => step.maneuver.type !== "arrive")
        .slice(0, 5)
        .map((step) => `${step.maneuver.type === "depart" ? "Start" : step.maneuver.type.replaceAll("_", " ")}${step.maneuver.modifier ? ` ${step.maneuver.modifier}` : ""}${step.name ? ` onto ${step.name}` : ""}`);
      setRoute({
        distance: bestRoute.distance,
        duration: bestRoute.duration,
        steps,
      });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setRoute(null);
        setRouteError(error instanceof Error ? error.message : "Could not load walking directions.");
      }
    });
  }, [walking, userLocation, selectedPoint]);

  useEffect(() => () => routeRequest.current?.abort(), []);

  const startWalking = () => {
    if (!navigator.geolocation) {
      setLocationError("This browser does not support location access.");
      return;
    }
    setLocationError(null);
    setWalking(true);
  };
  const googleDirectionsUrl = selectedPoint
    ? `https://www.google.com/maps/dir/?api=1&destination=${selectedPoint.latitude},${selectedPoint.longitude}&travelmode=walking${userLocation ? `&origin=${userLocation.latitude},${userLocation.longitude}` : ""}`
    : null;

  return (
    <div>
      <PageHeader title="Campus map" subtitle="Explore the official DSU campus map, then choose a reported location below to get walking directions." />
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Map layers">
        {KINDS.map((k) => (
          <button key={k.kind} aria-pressed={shown[k.kind]} onClick={() => setShown({ ...shown, [k.kind]: !shown[k.kind] })} className={cn("flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold", shown[k.kind] ? "border-forest bg-white" : "border-stone-300 bg-stone-200/50 text-stone")}>
            <span className={cn("h-3 w-3 rounded-full", k.dot, !shown[k.kind] && "opacity-40")} aria-hidden />{k.label}
          </button>
        ))}
      </div>
      {q.isLoading ? <Spinner label="Loading map" /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : (
        <>
          <iframe
            title="Official DSU campus map"
            src={CAMPUS_MAP_EMBED}
            className="h-[480px] w-full rounded-lg border border-stone-300"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
          <a className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-leaf hover:underline" href={CAMPUS_MAP_PAGE} target="_blank" rel="noreferrer">
            Open DSU map page <ArrowUpRight className="h-4 w-4" aria-hidden />
          </a>
          <div className="mt-4 rounded-lg border border-stone-300 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-forest">{selectedPoint ? `Directions to ${selectedPoint.title}` : "Get walking directions"}</h2>
                <p className="mt-1 text-sm text-stone">
                  {selectedPoint
                    ? `${selectedPoint.location_name || "Pinned campus location"} · approximate pin`
                    : "Choose a report from the list below to set your destination."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" onClick={getCurrentLocation}>
                  <LocateFixed className="h-4 w-4" aria-hidden />Use my location
                </Button>
                {selectedPoint && (
                  <Button type="button" onClick={() => {
                    if (walking) setWalking(false);
                    else startWalking();
                  }}>
                    {walking ? <Square className="h-4 w-4" aria-hidden /> : <Navigation className="h-4 w-4" aria-hidden />}
                    {walking ? "Stop walking" : "Start walking"}
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-stone">Starting walking shares your live location with the OpenStreetMap walking-route service. Opening Google Maps shares your current and selected locations with Google. Report pins stay approximate and do not overlay the official campus map.</p>
            {locationError && <p className="mt-3 text-sm text-danger" role="alert">{locationError}</p>}
            {selectedPoint && userLocation && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-stone-200 pt-3 text-sm">
                <p><strong>{formatDistance(distanceInMeters(userLocation, selectedPoint))}</strong> straight-line distance</p>
                {route && <p><strong>{formatDistance(route.distance)}</strong> walking · about {Math.max(1, Math.round(route.duration / 60))} min</p>}
                {walking && <p className="font-semibold text-leaf" aria-live="polite">Live location is on. Distance updates as you move.</p>}
              </div>
            )}
            {routeError && (
              <p className="mt-3 text-sm text-danger" role="alert">
                {routeError}{" "}
                {googleDirectionsUrl && <a className="font-semibold underline" target="_blank" rel="noreferrer" href={googleDirectionsUrl}>Open walking directions</a>}
              </p>
            )}
            {googleDirectionsUrl && (
              <a className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-leaf hover:underline" target="_blank" rel="noreferrer" href={googleDirectionsUrl}>
                Open walking directions in Google Maps <ArrowUpRight className="h-4 w-4" aria-hidden />
              </a>
            )}
            {route?.steps.length ? (
              <ol className="mt-3 list-inside list-decimal space-y-1 border-t border-stone-200 pt-3 text-sm" aria-label="Walking directions">
                {route.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}
              </ol>
            ) : null}
          </div>
          {(q.data!.points.length === 0) && <div className="mt-4"><EmptyState icon={MapPinned} title="No pinned reports yet" text="Reports with a pin on the map appear here. Drop a pin when you report an item." action={<Button asChild><Link to="/report/lost">Report an item</Link></Button>} /></div>}
          {points.length > 0 && (
            <section className="mt-6" aria-label="Locations as a list">
              <h2 className="mb-2 text-lg font-bold">In a list</h2>
              <ul className="divide-y divide-stone-200 border-y border-stone-300 text-sm">
                {points.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                  <button type="button" className="min-w-0 truncate text-left hover:underline" onClick={() => handleSelectPoint(p)}>
                    <strong className="capitalize">{p.kind}</strong> · {p.title}{p.location_name ? ` · ${p.location_name}` : ""}
                  </button>
                  <div className="flex shrink-0 items-center gap-3">
                    <button type="button" className="font-semibold text-leaf hover:underline" onClick={() => handleSelectPoint(p)}>Directions</button>
                    {p.kind !== "recovery" && p.mine && <Link to={`/reports/${p.id}`} className="font-semibold text-leaf hover:underline">Open</Link>}
                  </div>
                </li>)}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
