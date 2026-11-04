import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";

const CONERO: [number, number] = [43.5506, 13.622];

export function DiveMap({
  lat,
  lng,
  onPick,
}: {
  lat: string;
  lng: string;
  onPick?: (lat: string, lng: string) => void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const pickRef = useRef(onPick);
  const latRef = useRef(lat);
  const lngRef = useRef(lng);
  const [ready, setReady] = useState(false);
  pickRef.current = onPick;
  latRef.current = lat;
  lngRef.current = lng;

  useEffect(() => {
    if (!node.current) return;
    let dead = false;
    let map: LeafletMap | null = null;
    void import("leaflet").then((mod) => {
      if (dead || !node.current) return;
      const L = leafletOf(mod);
      const has = latRef.current !== "" && lngRef.current !== "";
      const start: [number, number] = has ? [Number(latRef.current), Number(lngRef.current)] : CONERO;
      map = L.map(node.current, { scrollWheelZoom: false }).setView(start, has ? 16 : 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      map.on("click", (event) => {
        if (!pickRef.current) return;
        pickRef.current(event.latlng.lat.toFixed(6), event.latlng.lng.toFixed(6));
      });
      mapRef.current = map;
      if (!dead) setReady(true);
      window.setTimeout(() => map?.invalidateSize(), 120);
    });
    return () => {
      dead = true;
      markerRef.current = null;
      mapRef.current = null;
      setReady(false);
      map?.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let dead = false;
    void import("leaflet").then((mod) => {
      if (dead || mapRef.current !== map) return;
      const L = leafletOf(mod);
      const has = lat !== "" && lng !== "";
      if (!has) {
        markerRef.current?.remove();
        markerRef.current = null;
        return;
      }
      const point: [number, number] = [Number(lat), Number(lng)];
      const icon = L.divIcon({
        className: "",
        html: '<span style="display:block;width:18px;height:18px;border-radius:999px;background:#d6a84f;border:2px solid #071316"></span>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      if (!markerRef.current) {
        const marker = L.marker(point, { icon, draggable: Boolean(pickRef.current) }).addTo(map);
        marker.on("dragend", () => {
          const next = marker.getLatLng();
          pickRef.current?.(next.lat.toFixed(6), next.lng.toFixed(6));
        });
        markerRef.current = marker;
      } else {
        markerRef.current.setLatLng(point);
      }
      map.setView(point, Math.max(map.getZoom(), 16));
    });
    return () => {
      dead = true;
    };
  }, [lat, lng, ready]);

  return <div ref={node} className="z-0 h-64 w-full overflow-hidden rounded-xl bg-deep" />;
}

export function DiveAtlas({ points }: { points: { lat: string; lng: string; label: string }[] }) {
  const node = useRef<HTMLDivElement>(null);
  const key = points.map((item) => `${item.lat},${item.lng},${item.label}`).join("|");

  useEffect(() => {
    if (!node.current) return;
    const spots = points.filter((item) => item.lat && item.lng && Number.isFinite(Number(item.lat)) && Number.isFinite(Number(item.lng)));
    if (!spots.length) return;
    let dead = false;
    let map: LeafletMap | null = null;
    void import("leaflet").then((mod) => {
      if (dead || !node.current) return;
      const L = leafletOf(mod);
      map = L.map(node.current, { scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      const icon = L.divIcon({
        className: "",
        html: '<span style="display:block;width:14px;height:14px;border-radius:999px;background:#5eead4;border:2px solid #071316"></span>',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const markers = spots.map((item) =>
        L.marker([Number(item.lat), Number(item.lng)], { icon }).bindTooltip(item.label, { direction: "top" }),
      );
      const group = L.featureGroup(markers).addTo(map);
      map.fitBounds(group.getBounds().pad(0.3), { maxZoom: 14 });
      window.setTimeout(() => map?.invalidateSize(), 120);
    });
    return () => {
      dead = true;
      map?.remove();
    };
  }, [key]);

  return <div ref={node} className="z-0 h-64 w-full overflow-hidden rounded-card bg-deep" />;
}

function leafletOf(mod: typeof import("leaflet")): typeof import("leaflet") {
  const maybe = mod as typeof import("leaflet") & { default?: typeof import("leaflet") };
  return typeof maybe.map === "function" ? maybe : (maybe.default ?? maybe);
}
