# Smart Leads Agent for Hoardings

> An AI-powered sales intelligence platform for Out-of-Home (OOH) media — detect upcoming billboard vacancies, rank the best-fit advertisers, and generate personalised pitch emails in seconds.

---

## What It Does

Out-of-Home media sales teams spend hours manually identifying which clients to call when a hoarding site is about to go vacant. This platform eliminates that guesswork.

Give it your site data and customer list. It will:

1. **Detect vacancies** — flags every hoarding whose lease expires within your chosen window (30 / 60 / 90 days).
2. **Score & rank leads** — runs each potential advertiser through a 5-factor scoring model and surfaces the top 3 best-fit prospects per site.
3. **Write the pitch** — calls OpenRouter AI to draft a tailored sales email with rate-card accuracy guaranteed.

---

## Project Structure

```
Smart-Leads-Agent-for-Hoardings/
│
├── backend/
│   ├── api_server.py          # FastAPI REST server — serves all /api/* routes
│   ├── lead_scoring_engine.py # 5-factor scoring engine & customer profiler
│   ├── pitch_generator.py     # OpenRouter AI pitch generator + guardrail layer
│   └── __init__.py
│
├── data/
│   └── Smart_Leads_Master.xlsx  # Master dataset (sites + leads, two sheets)
│
├── src/
│   ├── main.tsx               # React app entry point
│   ├── routes/index.tsx       # Main cockpit dashboard & lead detail drawer
│   ├── components/
│   │   └── VacancyMap.tsx     # Interactive Leaflet map with urgency markers
│   └── lib/
│       ├── leads-api.ts       # API client — auto-resolves dev vs production URL
│       ├── lead-store.ts      # Zustand store for saved drafts & notes
│       └── utils.ts           # Utility helpers
│
├── .env                       # Local environment secrets (not committed)
├── .env.example               # Template — copy this to create your .env
├── render.yaml                # Render.com full-stack deployment config
├── vite.config.ts             # Vite build config
├── package.json               # Node scripts & dependencies
└── requirements.txt           # Python dependencies
```

---

## Lead Scoring Model

Every prospect is scored 0–100 using five weighted factors:

| Factor | Weight | What It Measures |
|---|---|---|
| Historical Affinity | 30% | How many times the brand has booked at this site or nearby corridor |
| Industry Fit | 25% | How well the brand's category matches the site's location type |
| Relationship Score | 20% | CRM relationship rating (1–10) with the account |
| Recency | 15% | Days elapsed since the brand's last active OOH campaign |
| Value Match | 10% | Brand's typical budget vs the site's monthly card rate |

The top 3 prospects per site are surfaced in the dashboard with rank badges (Gold / Silver / Bronze).

---

## AI Pitch Generator

The pitch engine (`backend/pitch_generator.py`) connects to **OpenRouter AI** and produces a ready-to-send sales email for any site + customer pair.

**Key behaviours:**

- **Rate guardrail** — after generation, a regex check verifies the quoted price matches the rate card exactly. If price drift is detected, the correct rate is substituted automatically before the pitch is returned.
- **Why-summary** — alongside the pitch, the engine returns a one-line plain-English explanation of why this lead was selected.
- **5 pitch styles** — the engine cycles through five distinct tones (Executive proposal, Footfall focus, Priority access, Opportunity alert, Competitive advantage) to keep outreach fresh.
- **Latency metadata** — every response includes generation time (`latency_ms`) and the model ID used.

---

## Frontend Dashboard

Built with **React 19 + Vite + TypeScript**.

| Feature | Details |
|---|---|
| Vacancy Pipeline | Scrollable list of all vacant sites with urgency windows |
| Interactive Map | Leaflet map with colour-coded urgency markers (red ≤ 30d, yellow ≤ 60d, grey = 90d). Default tile style: Streets |
| Search & Filter | Filter by site ID, area, industry, or customer across 30 / 60 / 90-day windows |
| Lead Drawer | Click any site to open a side drawer with ranked leads and AI pitch controls |
| Rank Badges | #1 Gold, #2 Silver, #3 Bronze on every lead card |
| Saved Drafts | Pitch drafts and internal notes persist locally via Zustand |

---

## Tech Stack

**Frontend**
- React 19, Vite 8, TypeScript
- Leaflet.js (interactive maps)
- Zustand (local state & persistence)
- Lucide Icons

**Backend**
- Python 3.11, FastAPI, Uvicorn
- Pandas + OpenPyXL (Excel data processing)
- OpenRouter API (LLM integration)

**Data**
- `data/Smart_Leads_Master.xlsx` — two sheets: `Master_Site_Data` (25 sites) and `Phase2_Leads` (45 customers)

---

## Local Setup

### Prerequisites

- Node.js v18+ and npm
- Python 3.10+

### Steps

**1. Clone the repo**
```bash
git clone https://github.com/HarshR-gif/Smart-Leads-Agent-for-Hoardings.git
cd Smart-Leads-Agent-for-Hoardings
```

**2. Set up environment variables**
```bash
cp .env.example .env
# Open .env and add your OpenRouter API key
```

**3. Install Python dependencies**
```bash
pip install -r requirements.txt
```

**4. Install Node dependencies**
```bash
npm install
```

**5. Start the backend**
```bash
npm run backend
# FastAPI server starts at http://127.0.0.1:8000
```

**6. Start the frontend**
```bash
npm run dev
# React dev server starts at http://localhost:3000
```

Open `http://localhost:3000` — the dashboard connects to the backend automatically.

---

## Environment Variables

Create a `.env` file in the project root (use `.env.example` as a template):

```env
# OpenRouter LLM
OPENROUTER_API_KEY="your_openrouter_api_key_here"
OPENROUTER_MODEL="openrouter/auto"

# Optional: override the API base URL for the frontend
VITE_API_BASE_URL=""
```

---

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | GET | Server health check + site count |
| `/api/vacancies` | GET | All vacant sites with ranked leads (`?window_days=90`) |
| `/api/pitch` | GET | Generate AI pitch (`?site_id=HRD-100&customer_id=CUST-48`) |

**Example:**
```bash
curl "http://127.0.0.1:8000/api/pitch?site_id=HRD-100&customer_id=CUST-48"
```

---

## Deployment

The project is configured for a **single-service full-stack deployment** on Render.com using `render.yaml`.

The build process:
1. Installs Node dependencies and builds the React app (`dist/`)
2. Installs Python dependencies
3. Starts the FastAPI server — which also serves the React build as static files

When deployed, visiting the Render URL loads the full React cockpit UI. All `/api/*` requests are handled by the same FastAPI service on the same domain.

**Live deployment:** [https://smart-leads-agent-for-hoardings.onrender.com](https://smart-leads-agent-for-hoardings.onrender.com)

---

## Repository

[https://github.com/HarshR-gif/Smart-Leads-Agent-for-Hoardings](https://github.com/HarshR-gif/Smart-Leads-Agent-for-Hoardings)