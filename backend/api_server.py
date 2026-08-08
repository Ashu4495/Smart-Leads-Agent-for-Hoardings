"""
Backend FastAPI server for Smart Leads Agent for Hoardings
===========================================================
Connects the Excel dataset in Data/Smart_Leads_Master.xlsx with the React frontend.
Exposes REST API endpoints for Vacancies, Ranked Leads, and Pitch Generation.
"""

import os
import sys
import datetime
import pandas as pd
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

BACKEND_DIR = Path(__file__).resolve().parent
ROOT = BACKEND_DIR.parent
for p in (str(BACKEND_DIR), str(ROOT)):
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from backend.lead_scoring_engine import get_leads, load_data, _normalize_site_id, _build_customer_profiles, get_site_details, REF_DATE
except ImportError:
    from lead_scoring_engine import get_leads, load_data, _normalize_site_id, _build_customer_profiles, get_site_details, REF_DATE

try:
    from backend.pitch_generator import generate_pitch
except ImportError:
    try:
        from pitch_generator import generate_pitch
    except ImportError:
        generate_pitch = None

app = FastAPI(title="Smart Leads Agent API", version="1.0.0")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Known coordinates for locations in Mumbai / Pune to show on Map
LOCATION_COORDS = {
    "BKC": (19.0667, 72.8667),
    "POWAI": (19.1176, 72.9060),
    "ANDHERI": (19.1197, 72.8464),
    "GOREGAON": (19.1663, 72.8526),
    "MALAD": (19.1860, 72.8485),
    "KANDIVALI": (19.2070, 72.8543),
    "BORIVALI": (19.2307, 72.8567),
    "THANE": (19.2183, 72.9781),
    "SION": (19.0400, 72.8600),
    "WORLI": (19.0176, 72.8162),
    "MUMBAI": (19.0760, 72.8777),
    "PUNE": (18.5204, 73.8567),
    "BANER": (18.5590, 73.7868),
    "HINJEWADI": (18.5912, 73.7389),
    "KOTHRUD": (18.5074, 73.8077),
    "VIMAN NAGAR": (18.5679, 73.9143),
}

def _get_coords_for_location(location: str, idx: int) -> tuple[float, float]:
    loc_upper = location.upper()
    for key, coords in LOCATION_COORDS.items():
        if key in loc_upper:
            # Add small deterministic offset based on index so markers don't overlap completely
            lat = coords[0] + ((idx % 7) - 3) * 0.005
            lng = coords[1] + (((idx * 3) % 7) - 3) * 0.005
            return (round(lat, 5), round(lng, 5))
    # Default Mumbai region with slight offset
    return (round(19.0760 + ((idx % 10) - 5) * 0.008, 5), round(72.8777 + (((idx * 3) % 10) - 5) * 0.008, 5))

def _extract_area(location: str) -> str:
    parts = [p.strip() for p in location.split(",")]
    if len(parts) > 1:
        return parts[-1]
    tokens = location.split()
    return tokens[0] if tokens else location

@app.get("/")
def root():
    if DIST_DIR.exists() and (DIST_DIR / "index.html").exists():
        return FileResponse(DIST_DIR / "index.html")
    return {
        "status": "ok",
        "service": "Smart Leads Agent Backend API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/api/health",
            "vacancies": "/api/vacancies?window_days=90",
            "pitch": "/api/pitch?site_id=HRD-100&customer_id=CUST-48"
        }
    }

@app.get("/api/health")
def health_check():
    try:
        df_master, df_leads = load_data()
        sites_count = len(df_master["Site ID (PK)"].unique()) if "Site ID (PK)" in df_master.columns else 0
        return {
            "status": "ok",
            "message": "Smart Leads Agent Backend API is running",
            "sites_count": sites_count,
            "phase2_leads_count": len(df_leads) if df_leads is not None else 0
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/api/vacancies")
def get_all_vacancies(window_days: int = 90):
    """
    Returns all hoarding vacancies and their ranked top-3 leads from Smart_Leads_Master.xlsx.
    """
    df_master, df_leads = load_data()
    customers = _build_customer_profiles(df_master, df_leads)
    
    # Extract unique sites
    sites_df = df_master[["Site ID (PK)", "Location", "Monthly Rate (INR)"]].drop_duplicates(subset=["Site ID (PK)"])
    
    vacancies = []
    
    for idx, (_, row) in enumerate(sites_df.iterrows()):
        raw_sid = str(row["Site ID (PK)"]).strip()
        sid = _normalize_site_id(raw_sid)
        loc = str(row["Location"]).strip()
        monthly_rate = float(row["Monthly Rate (INR)"]) if pd.notna(row["Monthly Rate (INR)"]) else 150000.0
        
        # Get additional site specs if available in master
        matching_rows = df_master[df_master["Site ID (PK)"].str.strip().str.upper() == sid]
        site_row = matching_rows.iloc[0] if not matching_rows.empty else row
        
        traffic_score = int(site_row.get("Traffic Score", 75)) if pd.notna(site_row.get("Traffic Score")) else 75
        size_sqft = site_row.get("Size (sqft)", "30x15 ft")
        if isinstance(size_sqft, (int, float)) and pd.notna(size_sqft):
            size_str = f"{int(size_sqft)} sqft"
        else:
            size_str = str(size_sqft) if pd.notna(size_sqft) else "30x15 ft"
            
        # Free from date
        free_from_raw = site_row.get("Free From Date")
        if pd.notna(free_from_raw):
            try:
                free_date = pd.to_datetime(free_from_raw).date()
            except Exception:
                free_date = REF_DATE + datetime.timedelta(days=15 + (idx % 45))
        else:
            free_date = REF_DATE + datetime.timedelta(days=10 + (idx % 50))
            
        days_until_free = max(1, (free_date - REF_DATE).days)
        
        if days_until_free > window_days:
            continue
            
        coords = _get_coords_for_location(loc, idx)
        area = _extract_area(loc)
        
        # Get ranked top 3 leads for this site
        raw_leads = get_leads(sid)
        formatted_leads = []
        
        for r in raw_leads:
            cid = r["customer_id"]
            cust_prof = customers.get(cid, {})
            c_name = r["name"]
            c_ind = cust_prof.get("industry", "advertiser").title()
            c_band = cust_prof.get("budget_band", "mid").title()
            c_rel = cust_prof.get("relationship_score", 5.0)
            
            # Recency in days
            last_contact = cust_prof.get("last_contact_date")
            if pd.notna(last_contact):
                try:
                    last_days = (REF_DATE - pd.to_datetime(last_contact).date()).days
                except Exception:
                    last_days = 30
            else:
                last_days = 45
                
            raw_score = r["score"]
            # Convert 0-1 scale to 0-100 scale if needed
            score_100 = round(raw_score * 100, 1) if raw_score <= 1.0 else round(raw_score, 1)
            
            # Check incumbent
            past_bookings = cust_prof.get("past_bookings", [])
            is_incumbent = any(b.get("site_id") == sid for b in past_bookings)
            
            # Suggested rate
            suggested_rate = round(monthly_rate * (0.95 if is_incumbent else 1.0))
            
            formatted_leads.append({
                "customer": {
                    "id": cid,
                    "name": c_name,
                    "industry": c_ind,
                    "budgetBand": c_band,
                    "relationshipScore": int(c_rel * 10), # scale 0-100
                    "lastContactDays": max(1, last_days)
                },
                "score": score_100,
                "reasons": r.get("reasons", []),
                "suggestedRate": suggested_rate,
                "isIncumbent": is_incumbent,
                "churnRisk": round(max(5, 100 - c_rel * 10), 1),
                "coldRelationship": last_days > 90 or c_rel < 4.0
            })
            
        vacancies.append({
            "hoarding": {
                "id": sid,
                "location": loc,
                "area": area,
                "size": size_str,
                "trafficScore": traffic_score,
                "monthlyRate": int(monthly_rate),
                "lat": coords[0],
                "lng": coords[1]
            },
            "freeFrom": free_date.isoformat(),
            "daysUntilFree": days_until_free,
            "revenueAtRisk": int(monthly_rate),
            "lastBooking": {
                "id": f"B-{sid}",
                "hoardingId": sid,
                "customerId": formatted_leads[0]["customer"]["id"] if formatted_leads else "CUST-01",
                "start": (free_date - datetime.timedelta(days=30)).isoformat(),
                "end": free_date.isoformat(),
                "value": int(monthly_rate)
            },
            "leads": formatted_leads
        })
        
    vacancies.sort(key=lambda x: x["daysUntilFree"])
    return vacancies

class PitchRequest(BaseModel):
    site_id: str
    customer_id: str

@app.get("/api/pitch")
@app.post("/api/pitch")
def get_pitch(site_id: Optional[str] = Query(None), customer_id: Optional[str] = Query(None), body: Optional[PitchRequest] = None):
    sid = site_id or (body.site_id if body else None)
    cid = customer_id or (body.customer_id if body else None)
    
    if not sid or not cid:
        raise HTTPException(status_code=400, detail="Both site_id and customer_id are required")
        
    if generate_pitch is None:
        raise HTTPException(status_code=500, detail="Pitch generator module not available")
        
    try:
        res = generate_pitch(sid, cid)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating pitch: {str(e)}")

# Serve React Frontend Static Build if present in dist/
DIST_DIR = ROOT / "dist"
if DIST_DIR.exists():
    assets_dir = DIST_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        if full_path.startswith("api"):
            raise HTTPException(status_code=404, detail="API endpoint not found")
        target_file = DIST_DIR / full_path
        if target_file.exists() and target_file.is_file():
            return FileResponse(target_file)
        return FileResponse(
            DIST_DIR / "index.html",
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
