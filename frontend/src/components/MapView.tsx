import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { MapPoint } from "@/types";

const COLORS = { lost: "#c0792b", found: "#287A5B", recovery: "#153C32" } as const;
const icon = (kind: keyof typeof COLORS, mine = false) =>
  L.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11],
    html: `<span style="display:block;width:22px;height:22px;border-radius:50%;background:${COLORS[kind]};border:3px solid ${mine ? "#E8C979" : "#fff"};box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>` });

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const DEFAULT: [number, number] = [12.8625, 77.4375];

export function MapView({ points, center, height = 480 }: { points: MapPoint[]; center: { latitude: number; longitude: number } | null; height?: number }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const c: [number, number] = center ? [center.latitude, center.longitude] : DEFAULT;
    map.current = L.map(el.current, { scrollWheelZoom: false }).setView(c, 16);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, [center]);

  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    points.forEach((p) => L.marker([p.latitude, p.longitude], { icon: icon(p.kind, p.mine), title: `${p.kind}: ${p.title}`, keyboard: true })
      .bindPopup(`<strong>${esc(p.title)}</strong><br/><span style="text-transform:capitalize">${p.kind}</span>${p.location_name ? ` · ${esc(p.location_name)}` : ""}<br/><em>Approximate location</em>`)
      .addTo(layer.current!));
    if (points.length > 1 && map.current) map.current.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number])).pad(0.3), { maxZoom: 17 });
  }, [points]);

  return <div ref={el} style={{ height }} className="z-0 w-full overflow-hidden rounded-lg border border-stone-300" role="region" aria-label="Map of reported items" data-testid="map" />;
}

/** Click-to-place picker for the report form. */
export function MapPicker({ value, center, onChange }: { value: { lat: number; lng: number } | null; center: { latitude: number; longitude: number } | null; onChange: (v: { lat: number; lng: number } | null) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.Marker | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!el.current || map.current) return;
    const start: [number, number] = value ? [value.lat, value.lng] : center ? [center.latitude, center.longitude] : DEFAULT;
    map.current = L.map(el.current, { scrollWheelZoom: false }).setView(start, 16);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map.current);
    map.current.on("click", (e) => cb.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    return () => { map.current?.remove(); map.current = null; marker.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map.current) return;
    marker.current?.remove();
    marker.current = null;
    if (value) marker.current = L.marker([value.lat, value.lng], { icon: icon("found") }).addTo(map.current);
  }, [value]);

  return <div ref={el} className="z-0 h-64 w-full overflow-hidden rounded-md border border-stone-300" role="region" aria-label="Map: click to mark the approximate location" data-testid="map-picker" />;
}
