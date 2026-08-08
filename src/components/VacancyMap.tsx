import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Vacancy } from "@/lib/leads-api";
import { fmtDate, inr } from "@/lib/leads-api";

type MapMode = "dark" | "light" | "satellite" | "streets";

const TILE_URLS: Record<MapMode, string> = {
  dark: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  light: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  streets: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
};

function toneFor(days: number) {
  if (days <= 30) return "#f43f5e";
  if (days <= 60) return "#f59e0b";
  return "#94a3b8";
}

export default function VacancyMap({
  vacancies,
  selectedId,
  onSelect,
  appTheme,
}: {
  vacancies: Vacancy[];
  selectedId?: string;
  onSelect: (id: string) => void;
  appTheme: "light" | "dark";
}) {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<Record<string, L.CircleMarker>>({});
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  const [mapMode, setMapMode] = useState<MapMode>(appTheme);

  // Sync map mode with app theme on theme changes
  useEffect(() => {
    setMapMode(appTheme);
  }, [appTheme]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    // Create Leaflet Map centered at Pune
    const map = L.map(mapContainer.current, {
      center: [18.55, 73.87],
      zoom: 11,
      zoomControl: false, // Turn off default zoom control to place it customly later or manage natively
      attributionControl: false,
    });

    // Add zoom control to top-left
    L.control.zoom({ position: "topleft" }).addTo(map);

    mapRef.current = map;

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update Tile Layer when mode changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    const url = TILE_URLS[mapMode];
    const layer = L.tileLayer(url, {
      maxZoom: mapMode === "satellite" ? 18 : 20,
    }).addTo(map);

    tileLayerRef.current = layer;
  }, [mapMode]);

  // Update Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing markers
    Object.values(markersRef.current).forEach((marker) => marker.remove());
    markersRef.current = {};

    vacancies.forEach((v) => {
      const color = toneFor(v.daysUntilFree);

      const marker = L.circleMarker([v.hoarding.lat, v.hoarding.lng], {
        radius: 6,
        fillColor: color,
        fillOpacity: 0.6,
        color: color,
        weight: 1.5,
      }).addTo(map);

      // Popup content
      const popupContent = `
        <div style="color: #111; font-size: 12px; font-family: sans-serif; line-height: 1.4; padding: 2px;">
          <strong style="color: #1f2937;">${v.hoarding.id}</strong> · ${v.hoarding.location}<br/>
          <span style="color: #4b5563;">free ${fmtDate(v.freeFrom)} · <strong>${inr(
            v.revenueAtRisk,
          )}</strong>/mo</span>
        </div>
      `;
      marker.bindPopup(popupContent, {
        closeButton: false,
        offset: [0, -5],
      });

      marker.on("click", () => {
        selectRef.current(v.hoarding.id);
      });

      markersRef.current[v.hoarding.id] = marker;
    });
  }, [vacancies]);

  // Handle selection highlight and panning
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const v = vacancies.find((x) => x.hoarding.id === selectedId);

    // Reset all markers styling first
    Object.entries(markersRef.current).forEach(([id, marker]) => {
      const active = id === selectedId;
      const days = vacancies.find((x) => x.hoarding.id === id)?.daysUntilFree ?? 90;
      const color = toneFor(days);

      // Set styles with interactive transitions
      marker.setStyle({
        radius: active ? 10 : 6,
        fillColor: color,
        fillOpacity: active ? 0.95 : 0.6,
        color: active ? "#ffffff" : color,
        weight: active ? 3 : 1.5,
      });

      if (active) {
        marker.bringToFront();
      }
    });

    if (v) {
      const marker = markersRef.current[v.hoarding.id];
      if (marker) {
        map.panTo([v.hoarding.lat, v.hoarding.lng], { animate: true, duration: 0.6 });
        if (map.getZoom() < 13) {
          map.setZoom(13, { animate: true });
        }
        marker.openPopup();
      }
    }
  }, [selectedId, vacancies]);

  return (
    <div className="panel slide-up relative overflow-hidden">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-border px-4 py-3 bg-surface/90 backdrop-blur-md z-20 relative">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-foreground flex items-center gap-2">
          📍 Site Map · <span className="text-primary font-mono">{vacancies.length}</span> Vacancies
        </span>
        <span className="flex items-center gap-3.5 text-xs font-semibold text-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2 py-0.5 border border-red-500/30 text-red-400">
            <i className="inline-block size-2.5 rounded-full bg-red-500 animate-pulse" /> &le;30d
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2 py-0.5 border border-amber-500/30 text-amber-400">
            <i className="inline-block size-2.5 rounded-full bg-amber-500" /> &le;60d
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-2 py-0.5 border border-blue-500/30 text-blue-400">
            <i className="inline-block size-2.5 rounded-full bg-blue-500" /> 90d
          </span>
        </span>
      </div>

      {/* Floating Map Mode Selector */}
      <div className="absolute top-14 right-4 z-[1000] flex rounded-lg border border-primary/40 bg-slate-950/95 backdrop-blur-xl p-1 shadow-2xl">
        {(["dark", "light", "satellite", "streets"] as MapMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setMapMode(mode)}
            className={`rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
              mapMode === mode
                ? "bg-primary text-primary-foreground font-extrabold shadow-md scale-105"
                : "text-slate-300 hover:text-white hover:bg-slate-800/80"
            }`}
          >
            {mode === "satellite" ? "Sat" : mode}
          </button>
        ))}
      </div>

      {/* Map element */}
      <div ref={mapContainer} className="h-[320px] w-full bg-surface-2" />
    </div>
  );
}
