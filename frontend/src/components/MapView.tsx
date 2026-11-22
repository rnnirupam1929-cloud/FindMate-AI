import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import type { MapPoint } from "@/types";

const COLORS = { lost: "#c0792b", found: "#287A5B", recovery: "#153C32" } as const;
const icon = (kind: keyof typeof COLORS, mine = false) =>
  L.divIcon({ className: "", iconSize: [22, 22], iconAnchor: [11, 11],
    html: `<span style="display:block;width:22px;height:22px;border-radius:50%;background:${COLORS[kind]};border:3px solid ${mine ? "#E8C979" : "#fff"};box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>` });

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const DEFAULT_CAMPUS_CENTER: [number, number] = [12.6614291, 77.4508298];

type Coordinate = { latitude: number; longitude: number };

export function MapView({
  points, center, height = 480, selectedPoint, userLocation, walking = false, route, onSelectPoint,
}: {
  points: MapPoint[];
  center: Coordinate | null;
  height?: number;
  selectedPoint?: MapPoint | null;
  userLocation?: Coordinate | null;
  walking?: boolean;
  route?: [number, number][];
  onSelectPoint?: (point: MapPoint) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const directionsLayer = useRef<L.LayerGroup | null>(null);
  const navigationTargetId = useRef<string | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const c: [number, number] = center ? [center.latitude, center.longitude] : DEFAULT_CAMPUS_CENTER;
    map.current = L.map(el.current, { scrollWheelZoom: false }).setView(c, 16);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    directionsLayer.current = L.layerGroup().addTo(map.current);
    return () => { map.current?.remove(); map.current = null; };
  }, [center]);

  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    points.forEach((p) => {
      const marker = L.marker([p.latitude, p.longitude], {
        icon: icon(p.kind, p.mine),
        title: `${p.kind}: ${p.title}`,
        keyboard: true,
      }).bindPopup(`<strong>${esc(p.title)}</strong><br/><span style="text-transform:capitalize">${p.kind}</span>${p.location_name ? ` · ${esc(p.location_name)}` : ""}<br/><em>Approximate location</em>`);
      marker.on("click", () => onSelectPoint?.(p));
      marker.addTo(layer.current!);
    });
    if (points.length > 1 && map.current) map.current.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number])).pad(0.3), { maxZoom: 17 });
  }, [points, onSelectPoint]);

  useEffect(() => {
    if (!directionsLayer.current) return;
    directionsLayer.current.clearLayers();
    if (route && route.length > 1) {
      L.polyline(route, { color: "#287A5B", weight: 6, opacity: 0.85, className: "walking-route" }).addTo(directionsLayer.current);
    }
    if (selectedPoint) {
      L.marker([selectedPoint.latitude, selectedPoint.longitude], {
        icon: icon(selectedPoint.kind, true), title: `Destination: ${selectedPoint.title}`,
      }).addTo(directionsLayer.current);
    }
    if (userLocation) {
      L.circleMarker([userLocation.latitude, userLocation.longitude], {
        radius: 8, color: "#fff", weight: 3, fillColor: "#2563eb", fillOpacity: 1, className: "user-location-marker",
      }).bindPopup("Your current location").addTo(directionsLayer.current);
    }
  }, [route, selectedPoint, userLocation]);

  useEffect(() => {
    if (!map.current || !userLocation) return;
    const userPosition: [number, number] = [userLocation.latitude, userLocation.longitude];
    if (walking && selectedPoint) {
      if (navigationTargetId.current !== selectedPoint.id) {
        map.current.fitBounds(L.latLngBounds([userPosition, [selectedPoint.latitude, selectedPoint.longitude]]).pad(0.25), { maxZoom: 17 });
        navigationTargetId.current = selectedPoint.id;
      } else {
        map.current.panTo(userPosition, { animate: true, duration: 0.5 });
      }
    } else {
      navigationTargetId.current = null;
      map.current.setView(userPosition, Math.max(map.current.getZoom(), 17), { animate: true });
    }
  }, [walking, userLocation, selectedPoint]);

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
    const start: [number, number] = value ? [value.lat, value.lng] : center ? [center.latitude, center.longitude] : DEFAULT_CAMPUS_CENTER;
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
