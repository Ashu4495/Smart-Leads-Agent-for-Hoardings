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
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-surface/50 backdrop-blur-sm z-10 relative">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Site map · {vacancies.length} vacancies
        </span>
        <span className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <i className="inline-block size-2 rounded-full bg-destructive" /> &le;30d
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block size-2 rounded-full bg-warning" /> &le;60d
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block size-2 rounded-full bg-muted-foreground" /> 90d
          </span>
        </span>
      </div>

      {/* Floating Map Mode Selector */}
      <div className="absolute top-14 right-4 z-400 flex rounded-md border border-border bg-surface/90 backdrop-blur-md p-0.5 shadow-md">
        {(["dark", "light", "satellite", "streets"] as MapMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setMapMode(mode)}
            className={`rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wider transition-all ${
              mapMode === mode
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground"
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
