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
    : "http://127.0.0.1:8000/api/phase1");

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
    const data = await res.json();
    if (data && data.vacancies && Array.isArray(data.vacancies) && data.vacancies.length > 0) {
      const vacancies = transformPhase1Vacancies(data.vacancies);
      cachedVacancies = vacancies;
      return vacancies;
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
    const pitchApiUrl = API_BASE_URL.replace('/phase1', '') + '/pitch';
    const res = await fetch(
      `${pitchApiUrl}?site_id=${encodeURIComponent(siteId)}&customer_id=${encodeURIComponent(customerId)}&t=${Date.now()}`
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

// Transform Phase 1 API response to frontend Vacancy format
function transformPhase1Vacancies(phase1Vacancies: any[]): Vacancy[] {
  return phase1Vacancies.map((v, idx) => {
    const freeFrom = new Date(v.free_from_date).toISOString();
    const location = v.location;
    const coords = getCoordsForLocation(location, idx);
    const area = extractArea(location);
    
    // Generate realistic leads based on site data
    const leads = generateLeadsForSite(v.site_id, v.monthly_rate_inr, v.traffic_score);
    
    return {
      hoarding: {
        id: v.site_id,
        location: location,
        area: area,
        size: `${v.size_sqft} sqft`,
        trafficScore: Math.round(v.traffic_score * 10),
        monthlyRate: Math.round(v.monthly_rate_inr),
        lat: coords[0],
        lng: coords[1],
      },
      freeFrom,
      daysUntilFree: v.days_until_free,
      revenueAtRisk: Math.round(v.revenue_at_risk),
      lastBooking: {
        id: `B-${v.site_id}`,
        hoardingId: v.site_id,
        customerId: leads[0]?.customer.id || "CUST-01",
        start: new Date(Date.now() - 30 * 86400000).toISOString(),
        end: freeFrom,
        value: Math.round(v.monthly_rate_inr),
      },
      leads,
    };
  });
}

// Known coordinates for locations
const LOCATION_COORDS: Record<string, [number, number]> = {
  "BKC": [19.0667, 72.8667],
  "POWAI": [19.1176, 72.9060],
  "ANDHERI": [19.1197, 72.8464],
  "GOREGAON": [19.1663, 72.8526],
  "MALAD": [19.1860, 72.8485],
  "KANDIVALI": [19.2070, 72.8543],
  "BORIVALI": [19.2307, 72.8567],
  "THANE": [19.2183, 72.9781],
  "SION": [19.0400, 72.8600],
  "WORLI": [19.0176, 72.8162],
  "MUMBAI": [19.0760, 72.8777],
  "PUNE": [18.5204, 73.8567],
  "BANER": [18.5590, 73.7868],
  "HINJEWADI": [18.5912, 73.7389],
  "KOTHRUD": [18.5074, 73.8077],
  "VIMAN NAGAR": [18.5679, 73.9143],
};

function getCoordsForLocation(location: string, idx: number): [number, number] {
  const locUpper = location.toUpperCase();
  for (const [key, coords] of Object.entries(LOCATION_COORDS)) {
    if (locUpper.includes(key)) {
      const lat = coords[0] + ((idx % 7) - 3) * 0.005;
      const lng = coords[1] + (((idx * 3) % 7) - 3) * 0.005;
      return [Number(lat.toFixed(5)), Number(lng.toFixed(5))];
    }
  }
  return [
    Number((19.0760 + ((idx % 10) - 5) * 0.008).toFixed(5)),
    Number((72.8777 + (((idx * 3) % 10) - 5) * 0.008).toFixed(5))
  ];
}

function extractArea(location: string): string {
  const parts = location.split(",").map(p => p.trim());
  if (parts.length > 1) return parts[parts.length - 1];
  const tokens = location.split(" ");
  return tokens[0] || location;
}

function generateLeadsForSite(siteId: string, monthlyRate: number, trafficScore: number): any[] {
  // Mock lead data - in production this would come from the backend
  const mockLeads = [
    {
      customer: {
        id: "CUST-48",
        name: "Hindustan Unilever Ltd",
        industry: "FMCG",
        budgetBand: "High",
        relationshipScore: 90,
        lastContactDays: 15,
      },
      score: 92,
      reasons: [
        `[Affinity] HUL has booked ${siteId} corridor before.`,
        `[Industry Fit] FMCG brands dominate high-traffic flyover corridors.`,
        `[Relationship] Strong relationship (9/10).`,
      ],
      suggestedRate: Math.round(monthlyRate * 1.0),
      isIncumbent: false,
      churnRisk: 12,
      coldRelationship: false,
    },
    {
      customer: {
        id: "CUST-12",
        name: "P&G India",
        industry: "FMCG",
        budgetBand: "High",
        relationshipScore: 85,
        lastContactDays: 22,
      },
      score: 87,
      reasons: [
        `[Industry Fit] FMCG brands align with high-traffic corridors.`,
        `[Relationship] Good relationship (8.5/10).`,
        `[Value Match] Budget aligns with site rate card.`,
      ],
      suggestedRate: Math.round(monthlyRate * 0.98),
      isIncumbent: false,
      churnRisk: 18,
      coldRelationship: false,
    },
    {
      customer: {
        id: "CUST-33",
        name: "ITC Limited",
        industry: "FMCG",
        budgetBand: "High",
        relationshipScore: 78,
        lastContactDays: 35,
      },
      score: 82,
      reasons: [
        `[Affinity] ITC has presence in nearby corridors.`,
        `[Industry Fit] Strong FMCG portfolio for premium sites.`,
        `[Value Match] Budget compatible with rate card.`,
      ],
      suggestedRate: Math.round(monthlyRate * 0.95),
      isIncumbent: false,
      churnRisk: 25,
      coldRelationship: false,
    },
  ];
  return mockLeads;
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
