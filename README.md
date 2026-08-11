<div align="center">
  
# 🏙️ Smart Leads Agent for Hoardings

**An AI-powered sales intelligence platform for Out-of-Home (OOH) media.**  
*Detect upcoming billboard vacancies, rank the best-fit advertisers using a custom scoring algorithm, and generate personalized, highly-converting pitch emails in seconds.*

🔗 **[Live Demo](https://smart-leads-agent-for-hoardings.onrender.com)**

[![FastAPI](https://img.shields.io/badge/FastAPI-005571?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/vite-%23646CFF.svg?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Framer Motion](https://img.shields.io/badge/Framer_Motion-black?style=for-the-badge&logo=framer&logoColor=blue)](https://www.framer.com/motion/)

</div>

---

## 🚀 Overview

Out-of-Home media sales teams spend hours manually identifying which clients to call when a hoarding site is about to go vacant. This platform completely eliminates that guesswork by automating the pipeline.

Give it your site data and customer list, and the Smart Leads Agent will automatically:

1. **Detect Vacancies** — Flags every hoarding whose lease expires within your chosen window (30 / 60 / 90 days).
2. **Score & Rank Leads** — Evaluates each potential advertiser through a proprietary 5-factor scoring model to surface the top 3 best-fit prospects per site.
3. **Write the Pitch** — Calls the OpenRouter AI LLM to draft a tailored sales email with rate-card accuracy guaranteed.

---

## ✨ Key Features

### 🔍 Interactive Vacancy Pipeline & Map
- **90 Days Vision Grid:** A stunning, responsive masonry grid displaying upcoming vacancies, revenue at risk, urgency badges, and top prospects.
- **Interactive Map:** Leaflet map with color-coded urgency markers (🔴 ≤ 30 days, 🟡 ≤ 60 days, ⚪ = 90 days). 
- **Lightning Fast Search:** Instantly filter by site ID, area, industry, or customer names across all time windows.

### 🧠 Advanced Lead Scoring Model
Every prospect is evaluated and scored (0–100) using five weighted factors to ensure the highest likelihood of conversion:
- **Historical Affinity (30%)** — Brand's booking history at this site or nearby corridors.
- **Industry Fit (25%)** — How well the brand's category matches the site's location demographics.
- **Relationship Score (20%)** — Internal CRM relationship rating (1–10).
- **Recency (15%)** — Days elapsed since the brand's last active OOH campaign.
- **Value Match (10%)** — Brand's typical budget vs the site's monthly card rate.

*The top 3 prospects per site are highlighted using premium Gold, Silver, and Bronze badges.*

### 🤖 AI Pitch Generator with Rate Guardrails
Connects to **OpenRouter AI** to produce ready-to-send sales emails for any site + customer pair.
- **Rate Guardrail System:** Ensures the AI never hallucinates pricing. A post-generation check verifies the quoted price matches the rate card exactly.
- **Why-Summary:** Returns a one-line plain-English explanation of exactly *why* this lead was selected.
- **5 Pitch Styles:** Cycles through distinct tones (Executive proposal, Footfall focus, Priority access, Opportunity alert, Competitive advantage) to keep outreach fresh.

### ⚡ Performance Optimized
- **Pre-computed Profiles:** The backend calculates normalized site matrices and customer profiles upfront, eliminating nested loops during API requests and slashing load times from ~40s down to milliseconds.
- **Lean Architecture:** Unused UI libraries and scaffolding dependencies were completely purged in favor of lightweight, custom Tailwind CSS utility classes.
- **Fluid Animations:** Powered by `framer-motion` for physics-based layout transitions and staggered entry animations.

---

## 📂 Project Architecture

```
Smart-Leads-Agent-for-Hoardings/
│
├── backend/
│   ├── api_server.py          # FastAPI REST server — serves all /api/* routes
│   ├── lead_scoring_engine.py # 5-factor scoring engine & customer profiler
│   ├── pitch_generator.py     # OpenRouter AI generator + guardrail layer
│   └── __init__.py
│
├── data/
│   └── Smart_Leads_Master.xlsx  # Master dataset (sites + leads)
│
├── src/
│   ├── main.tsx               # React app entry point
│   ├── routes/index.tsx       # Main dashboard & UI components
│   ├── components/
│   │   └── VacancyMap.tsx     # Interactive Leaflet map
│   └── lib/
│       ├── leads-api.ts       # Type-safe API client
│       └── lead-store.ts      # Zustand state management
│
├── .env                       # Local secrets (ignored by git)
├── render.yaml                # Render.com deployment config
└── vite.config.ts             # Vite build config
```

---

## 🛠️ Tech Stack

**Frontend**
- **Core:** React 19, Vite 8, TypeScript, TanStack Router
- **Styling:** Custom Tailwind CSS (v4), Framer Motion (for physics-based animations)
- **Mapping:** Leaflet.js

**Backend**
- **Framework:** Python 3.11, FastAPI, Uvicorn
- **Data Processing:** Pandas, OpenPyXL (Excel integration)
- **AI/LLM:** OpenRouter API

---

## 💻 Local Setup Instructions

### Prerequisites
- Node.js v18+ and npm
- Python 3.10+

### Steps

**1. Clone the repository**
```bash
git clone https://github.com/Ashu4495/Smart-Leads-Agent-for-Hoardings.git
cd Smart-Leads-Agent-for-Hoardings
```

**2. Set up environment variables**
```bash
cp .env.example .env
```
Open `.env` and add your **OpenRouter API key**.

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
```
*FastAPI server will start at `http://127.0.0.1:8000`*

**6. Start the frontend**
```bash
npm run dev
```
*React dev server will start at `http://localhost:3000`. It will automatically proxy API requests to the backend.*

---

## 📡 API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/health` | `GET` | Server health check & active site count |
| `/api/vacancies` | `GET` | Returns all vacant sites with pre-scored leads (`?window_days=90`) |
| `/api/pitch` | `GET` | Generates the AI pitch (`?site_id=HRD-100&customer_id=CUST-48`) |

---

## 🚀 Deployment

The project is configured for a **single-service full-stack deployment** on [Render](https://render.com) using `render.yaml`. 
The build process seamlessly handles the React Vite build and FastAPI mounting, allowing both to be served on a single domain.

**Live Deployment:** [https://smart-leads-agent-for-hoardings.onrender.com](https://smart-leads-agent-for-hoardings.onrender.com)

---

<div align="center">
  <i>Developed to revolutionize OOH Media Sales workflows.</i>
</div>