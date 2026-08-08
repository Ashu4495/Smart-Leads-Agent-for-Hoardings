// Smart Leads Agent Data Layer
// Connects to Python FastAPI backend (http://localhost:8000/api) reading Smart_Leads_Master.xlsx data

export type Hoarding = {
  id: string;
  location: string;
  area: string;
  size: string;
  trafficScore: number; // 0-100
  monthlyRate: number;
  lat: number;
  lng: number;
};

export type Customer = {
  id: string;
  name: string;
  industry: string;
  budgetBand: "Low" | "Mid" | "High";
  relationshipScore: number; // 0-100
  lastContactDays: number;
};

export type Booking = {
  id: string;
  hoardingId: string;
  customerId: string;
  start: string; // ISO
  end: string; // ISO
  value: number;
};

export type Lead = {
  customer: Customer;
  score: number;
  reasons: string[];
  suggestedRate: number;
  isIncumbent: boolean;
  churnRisk: number; // 0-100
  coldRelationship: boolean;
};

export type Vacancy = {
  hoarding: Hoarding;
  freeFrom: string; // ISO
  daysUntilFree: number;
  revenueAtRisk: number;
  lastBooking: Booking;
  leads: Lead[];
};

export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? `${window.location.origin}/api`
    : "http://127.0.0.1:8000/api");

export function fmtDate(iso: string) {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function inr(n: number) {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

// In-memory cache for live vacancies fetched from backend API
let cachedVacancies: Vacancy[] = [];

export async function fetchVacanciesFromAPI(windowDays = 90): Promise<Vacancy[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/vacancies?window_days=${windowDays}`);
    if (!res.ok) {
      throw new Error(`API response error: ${res.statusText}`);
    }
    const data: Vacancy[] = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      cachedVacancies = data;
      return data;
    }
  } catch (err) {
    console.warn("Backend API not reachable or returned error, using local fallback data:", err);
  }
  return getVacanciesFallback(windowDays);
}

export async function fetchPitchFromAPI(
  siteId: string,
  customerId: string
): Promise<{ pitch_text: string; why_summary?: string; quoted_rate_inr?: number }> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/pitch?site_id=${encodeURIComponent(siteId)}&customer_id=${encodeURIComponent(customerId)}&t=${Date.now()}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data && data.pitch_text) {
        return data;
      }
    }
  } catch (err) {
    console.warn("Failed to fetch pitch from backend API:", err);
  }
  return { pitch_text: "" };
}

// Synchronous wrapper returning cached vacancies or fallback
export function getVacancies(windowDays = 90): Vacancy[] {
  if (cachedVacancies.length > 0) {
    return cachedVacancies.filter((v) => v.daysUntilFree <= windowDays);
  }
  return getVacanciesFallback(windowDays);
}

export const hoardings: Hoarding[] = [];

// Fallback dataset generator if backend is temporarily offline
function getVacanciesFallback(windowDays: number): Vacancy[] {
  const TODAY = new Date("2026-08-08T00:00:00Z");
  const fallbackSites = [
    { id: "HRD-101", loc: "BKC Junction, Mumbai", area: "BKC", rate: 350000, traffic: 92, lat: 19.0667, lng: 72.8667 },
    { id: "HRD-102", loc: "Powai Hiranandani Garden, Mumbai", area: "Powai", rate: 280000, traffic: 88, lat: 19.1176, lng: 72.9060 },
    { id: "HRD-103", loc: "Andheri Metro Station Flyover, Mumbai", area: "Andheri", rate: 320000, traffic: 95, lat: 19.1197, lng: 72.8464 },
    { id: "HRD-104", loc: "Goregaon WEH Highway, Mumbai", area: "Goregaon", rate: 260000, traffic: 82, lat: 19.1663, lng: 72.8526 },
    { id: "HRD-105", loc: "Thane Majiwada Flyover, Thane", area: "Thane", rate: 210000, traffic: 79, lat: 19.2183, lng: 72.9781 },
  ];

  return fallbackSites.map((s, idx) => {
    const freeFrom = new Date(TODAY.getTime() + (10 + idx * 12) * 86400000).toISOString();
    return {
      hoarding: {
        id: s.id,
        location: s.loc,
        area: s.area,
        size: "40x20 ft",
        trafficScore: s.traffic,
        monthlyRate: s.rate,
        lat: s.lat,
        lng: s.lng,
      },
      freeFrom,
      daysUntilFree: 10 + idx * 12,
      revenueAtRisk: s.rate,
      lastBooking: {
        id: `B-${s.id}`,
        hoardingId: s.id,
        customerId: "CUST-01",
        start: TODAY.toISOString(),
        end: freeFrom,
        value: s.rate,
      },
      leads: [
        {
          customer: {
            id: "CUST-01",
            name: "Reliance Retail",
            industry: "Retail",
            budgetBand: "High",
            relationshipScore: 90,
            lastContactDays: 7,
          },
          score: 92,
          reasons: [
            "[Affinity] Reliance Retail has booked this corridor before.",
            "[Industry Fit] Retail brands dominate high-traffic junction sites.",
            "[Relationship] Strong relationship (9/10).",
          ],
          suggestedRate: s.rate,
          isIncumbent: true,
          churnRisk: 12,
          coldRelationship: false,
        },
      ],
    };
  });
}

export function buildPitch(v: Vacancy, lead: Lead): string {
  const h = v.hoarding;
  const c = lead.customer;
  const hook = lead.isIncumbent
    ? `Your campaign on ${h.location} wraps on ${fmtDate(v.lastBooking.end)} — I'd like to hold the slot for you before it opens to the market.`
    : `A high-visibility slot you've been eyeing in ${h.area} frees up on ${fmtDate(v.freeFrom)}.`;

  return [
    `Subject: ${h.area} hoarding (${h.id}) — free from ${fmtDate(v.freeFrom)}`,
    ``,
    `Hi ${c.name} team,`,
    ``,
    hook,
    ``,
    `Site: ${h.id} · ${h.location}`,
    `Size: ${h.size} · Traffic index: ${h.trafficScore}/100`,
    `Available: ${fmtDate(v.freeFrom)} onwards`,
    ``,
    `Why this fits ${c.name}:`,
    ...lead.reasons.map((r) => `• ${r}`),
    ``,
    `Proposed rate: ${inr(lead.suggestedRate)} / month (card rate ${inr(h.monthlyRate)}). Happy to lock a 60-day run at this number if we confirm this week.`,
    ``,
    `— Sales Desk, Smart Leads Agent`,
  ].join("\n");
}
