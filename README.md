# Smart Leads Agent — Hoarding Vacancy & OpenRouter AI Cockpit 🚀

An executive, full-stack intelligence dashboard for Out-of-Home (OOH) media owners to detect upcoming hoarding vacancies, dynamically rank top-3 best-fit advertiser prospects using a 5-factor scoring engine, and generate personalized sales pitches powered by **OpenRouter AI** with rate card guardrails.

---

## 🏗️ Master Project Architecture

The repository is organized into a clean, modular full-stack architecture operating off `data/Smart_Leads_Master.xlsx`:

```
smart-leads-agent (Workspace Root)
├── backend/                     # Python FastAPI Backend Engine
│   ├── api_server.py            # REST API endpoints server (http://127.0.0.1:8000/api)
│   ├── lead_scoring_engine.py   # 5-factor lead scoring & customer profile builder
│   ├── pitch_generator.py       # OpenRouter AI pitch generator & rate guardrails
│   ├── requirements.txt         # Backend Python dependencies
│   └── __init__.py              # Python package marker
│
├── data/                        # Centralized Master Dataset Directory
│   └── Smart_Leads_Master.xlsx  # Master Excel dataset (Master_Site_Data & Phase2_Leads)
│
├── src/                         # React Frontend Application (Vite + TanStack Router)
│   ├── main.tsx                 # React application entrypoint
│   ├── routes/index.tsx         # Cockpit dashboard page & lead drawer modal
│   ├── components/VacancyMap.tsx# Interactive Leaflet billboard map component (520px)
│   ├── lib/leads-api.ts         # Frontend API integration layer connecting to backend
│   ├── lib/lead-store.ts        # Zustand local storage store for saved drafts & notes
│   ├── lib/utils.ts             # Tailwind class merging utility
│   └── styles.css               # Design system, glassmorphism tokens, and animations
│
├── .env                         # Environment variables (OpenRouter API Key, Map keys)
├── .env.example                 # Environment template for repository
├── package.json                 # Project scripts & npm dependencies (smart-leads-agent)
├── requirements.txt             # Root Python requirements file
├── tsconfig.json                # TypeScript compiler & path alias configuration (@/* -> ./src/*)
├── vite.config.ts               # Vite build configuration
└── README.md                    # Detailed project documentation
```

---

## 🧮 5-Factor Lead Scoring Engine

The scoring engine (`backend/lead_scoring_engine.py`) processes 25 real sites and 45 Phase-2 leads from `data/Smart_Leads_Master.xlsx` and calculates a normalized 0–100 score for every prospect based on 5 weighted factors:

1. **Historical Affinity (30%)**: Past booking count at the specific site or surrounding corridor.
2. **Industry Category Fit (25%)**: Category alignment with location type (e.g., FMCG brands on high-traffic flyover corridors like Kandivali Flyover WEB).
3. **Relationship Score (20%)**: CRM relationship rating (1–10 scale).
4. **Recency (15%)**: Days since last active campaign completion.
5. **Value Match (10%)**: Customer budget compatibility vs site monthly card rate.

---

## 🤖 OpenRouter AI Pitch Generator & Rate Guardrails

The pitch engine (`backend/pitch_generator.py`) generates tailored pitch emails using the OpenRouter AI API (`openrouter/auto`) with key features:

- **Why-Summary Narration**: Generates a one-line plain-English explanation detailing why the lead was selected and how the offer was customized.
- **Rate Card Guardrail Verification**: Checks the generated text to ensure the quoted rate matches the site's card rate verbatim. If price drift is detected, a hard-substitute guardrail corrects the rate.
- **5-Style Pitch Cycling**: Automatically cycles through 5 distinct pitch draft styles (Executive C-Level Proposal, Footfall Focus, Priority Access, Opportunity Alert, Competitive Advantage).
- **Execution Metadata**: Returns real-time latency (`latency_ms`), model ID, and guardrail status pill.

---

## 🎨 Frontend Dashboard Features

- **Interactive Site Map**: Enlarged `520px` Leaflet map displaying billboard locations with urgency-colored markers (`≤30d` red, `≤60d` yellow, `90d` gray) and tile style controls (Dark, Light, Satellite, Streets).
- **25-Site Vacancy Pipeline**: Expanded scroll container (`720px`) for smooth navigation through all sites in the pipeline.
- **Dynamic Search & Filtering**: Real-time filtering by site ID, location area, industry, or customer name across 30, 60, and 90-day vacancy windows.
- **Rank Badging**: Color-coded badges for ranked prospects (#1 Gold, #2 Silver, #3 Bronze).
- **Local Persistence**: Save pitch drafts and internal client notes locally using Zustand.

---

## ⚙️ Environment Configuration (`.env`)

Configure `.env` in the project root:

```env
# OpenRouter LLM Configuration
OPENROUTER_API_KEY="your_openrouter_api_key_here"
OPENROUTER_MODEL="openrouter/auto"

# Map Keys
VITE_GOOGLE_MAPS_API_KEY="your_google_maps_api_key_here"
VITE_GOOGLE_MAPS_TRACKING_ID="your_google_maps_tracking_id_here"
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** v18+ & **npm**
- **Python** 3.10+

### 1. Install Backend Dependencies
```bash
pip install -r backend/requirements.txt
```

### 2. Start Python FastAPI Server
```bash
npm run backend
# Starts FastAPI server at http://127.0.0.1:8000
```

### 3. Start React Frontend Server
```bash
npm run dev
# Starts React Vite dev server at http://localhost:3000
```

---

## 📡 REST API Reference

| Endpoint | Method | Description | Sample Output |
| :--- | :--- | :--- | :--- |
| `/api/health` | `GET` | Server health status & site counts | `{"status": "ok", "sites_count": 25}` |
| `/api/vacancies` | `GET` | List vacant sites & top-3 ranked leads | `[{"hoarding": {...}, "leads": [...]}]` |
| `/api/pitch` | `GET` | Generate AI pitch for site & customer | `{"pitch_text": "...", "why_summary": "...", "llm_mode": "openrouter"}` |

### Sample API Pitch Call
```bash
curl.exe "http://127.0.0.1:8000/api/pitch?site_id=HRD-100&customer_id=CUST-48"
```

---

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite 8, TypeScript, Tailwind CSS, Leaflet Maps, Zustand, Lucide Icons
- **Backend**: Python 3.11, FastAPI, Uvicorn, Pandas, OpenPyXL, OpenRouter API
- **Data Source**: `data/Smart_Leads_Master.xlsx`

---

## 🌐 GitHub Repository & Deployment

- **GitHub Repo**: [https://github.com/HarshR-gif/Smart-Leads-Agent-for-Hoardings](https://github.com/HarshR-gif/Smart-Leads-Agent-for-Hoardings)
- **Deployment**: Ready for deployment on **Render.com**, **Vercel**, or **Google Cloud Run**.