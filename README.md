# Smart Leads Agent — Hoarding Vacancy & AI Pitch Cockpit 🚀

An executive, full-stack intelligence dashboard for Out-of-Home (OOH) media owners to detect upcoming hoarding vacancies, dynamically rank top-3 best-fit advertiser prospects using a 5-factor scoring engine, and generate personalized sales pitches powered by **OpenRouter AI** with rate card guardrails.

---

## 🏗️ Architecture Overview

The system is built as a decoupled full-stack application operating off the dataset in `data/Smart_Leads_Master.xlsx`:

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
│   ├── components/VacancyMap.tsx# Interactive Leaflet billboard map component
│   ├── lib/leads-api.ts         # Frontend API integration layer connecting to backend
│   ├── lib/lead-store.ts        # Zustand local storage store for saved drafts & notes
│   ├── lib/utils.ts             # Tailwind class merging utility
│   └── styles.css               # Design system, glassmorphism tokens, and animations
│
├── .env                         # Environment variables (OpenRouter API Key, Map keys)
├── package.json                 # Project scripts & npm dependencies
├── tsconfig.json                # TypeScript compiler & path alias configuration
├── vite.config.ts               # Vite build configuration
└── README.md                    # Project documentation
```

---

## ✨ Key Features

- **📊 Master Excel Data Integration**: Fully ingested from `data/Smart_Leads_Master.xlsx` featuring 25 hoarding sites and 45 Phase-2 leads.
- **🧮 5-Factor Lead Scoring Engine**: Dynamically calculates prospect scores (0–100) based on:
  1. **Historical Affinity**: Past booking history at site/corridor.
  2. **Industry Alignment**: Category fit for site location type (e.g., FMCG on flyovers, Luxury in South Mumbai).
  3. **Relationship Score**: CRM relationship strength (1–10).
  4. **Recency**: Days since last active campaign.
  5. **Value Match**: Customer budget vs site monthly card rate.
- **🤖 OpenRouter AI Pitch Generation**: Generates personalized pitch emails using OpenRouter API (`openrouter/auto` / `google/gemini-2.0-flash-exp:free`) with:
  - **Why-Summary Narration**: Plain-English explanation of why the lead was selected.
  - **Rate Card Guardrail**: Enforces exact quoted monthly card rate match (no hallucinated pricing).
  - **5-Style Fallback Cycle**: Automatically cycles through unique executive pitch variations.
- **🗺️ Interactive Billboard Map**: Leaflet map container displaying billboard sites with urgency markers (`≤30d` red, `≤60d` yellow, `90d` gray) and tile style controls.
- **🎨 Executive Dark/Light Dashboard**: Glassmorphic UI with search filters, 30/60/90 day vacancy windows, score badges, and local pitch draft storage.

---

## ⚙️ Environment Configuration (`.env`)

Create or update [.env](file:///c:/Users/Ashu/Downloads/React%20Frontpage/.env) in the project root:

```env
# OpenRouter LLM Configuration
OPENROUTER_API_KEY="your_openrouter_api_key_here"
OPENROUTER_MODEL="openrouter/auto"

# Map Keys
VITE_GOOGLE_MAPS_API_KEY="AIzaSyBmvJph4LmrbtW7skeczzpBIyb9WWzFKo4"
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** v18+ & **npm**
- **Python** 3.10+

### 1. Install Backend Dependencies
```bash
# Install Python packages
.\venv\Scripts\python.exe -m pip install -r backend/requirements.txt
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
| `/api/pitch` | `GET` | Generate AI pitch for site & customer | `{"pitch_text": "...", "why_summary": "..."}` |

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

## 📦 Production Build

To build the optimized production bundle:
```bash
npm run build
```
The output files will be generated in `dist/`.
