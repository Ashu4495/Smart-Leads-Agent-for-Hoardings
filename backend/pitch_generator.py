"""
pitch_generator.py
==================
Generates a personalized sales pitch for a (site_id, customer_id) pair.

Flow:
  1. Call get_leads(site_id)  -> get score + reasons for the requested customer
  2. Pull site facts from Smart_Leads_Master.xlsx (same source as get_leads)
  3. Build LLM prompt -- monthly_rate_inr is injected as a FIXED literal
  4. Rate guardrail: verify the quoted rate in the pitch matches exactly
  5. Hard-substitute if guardrail fires after 3 attempts
  6. Return { pitch_text, quoted_rate_inr, why_summary }
"""

import os
import re
import sys
import textwrap
from pathlib import Path

import pandas as pd

# -- locate project root & backend dir so imports work from any CWD ------------
BACKEND_DIR = Path(__file__).resolve().parent
ROOT = BACKEND_DIR.parent
for p in (str(BACKEND_DIR), str(ROOT)):
    if p not in sys.path:
        sys.path.insert(0, p)

try:
    from backend.lead_scoring_engine import get_leads, load_data, _normalize_site_id
except ImportError:
    from lead_scoring_engine import get_leads, load_data, _normalize_site_id  # noqa: E402

# -- environment / LLM config ----------------------------------------------
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except ImportError:
    pass

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
OPENROUTER_MODEL   = os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-exp:free")
OPENROUTER_URL     = "https://openrouter.ai/api/v1/chat/completions"


# -- data helpers ----------------------------------------------------------
def _get_site_facts(site_id: str, df_master: pd.DataFrame):
    """Return a dict of site facts from Master_Site_Data for a given site."""
    sid = site_id.strip().upper()
    rows = df_master[df_master["Site ID (PK)"].str.strip().str.upper() == sid]
    if rows.empty:
        return None
    r = rows.iloc[0]

    free_from = ""
    if "Free From Date" in df_master.columns and pd.notna(r.get("Free From Date")):
        try:
            free_from = pd.to_datetime(r["Free From Date"]).strftime("%d %b %Y")
        except Exception:
            free_from = str(r["Free From Date"])

    traffic   = float(r["Traffic Score"])   if pd.notna(r.get("Traffic Score"))   else 0.0
    size_sqft = int(r["Size (sqft)"])       if pd.notna(r.get("Size (sqft)"))     else 0

    return {
        "site_id":          sid,
        "location":         str(r["Location"]),
        "size_sqft":        size_sqft,
        "traffic_score":    traffic,
        "monthly_rate_inr": float(r["Monthly Rate (INR)"]),
        "free_from_date":   free_from or "TBD",
    }


def _get_customer_facts(customer_id: str, df_master: pd.DataFrame, df_leads=None):
    """Return customer-level facts. Checks Master_Site_Data first,
    then Phase2_Leads as fallback for customers not in Master."""
    cid = customer_id.strip()
    rows = df_master[df_master["Customer ID"].str.strip() == cid]
    if not rows.empty:
        r = rows.iloc[0]
        return {
            "customer_id":        cid,
            "name":               str(r["Customer Name"]).strip(),
            "industry":           str(r["Industry"]).strip(),
            "relationship_score": float(r["Relationship Score"])
                                  if pd.notna(r.get("Relationship Score")) else 5.0,
        }

    # Fallback: Phase2_Leads (for CUST-42, CUST-47, CUST-49 etc.)
    if df_leads is not None:
        ph2_rows = df_leads[df_leads["Customer ID"].astype(str).str.strip() == cid]
        if not ph2_rows.empty:
            import re
            r2 = ph2_rows.iloc[0]
            rel_score = 5.0
            r3 = str(r2.get("Reason 3 - Relationship", ""))
            m  = re.search(r'score (\d+)/10', r3)
            if m:
                rel_score = float(m.group(1))
            return {
                "customer_id":        cid,
                "name":               str(r2["Customer Name"]).strip(),
                "industry":           str(r2.get("Industry", "unknown")).strip(),
                "relationship_score": rel_score,
            }
    return None


# -- pitch prompt builder --------------------------------------------------
def _build_prompt(site: dict, customer: dict, lead: dict) -> str:
    rate     = int(site["monthly_rate_inr"])
    rate_str = f"{rate:,}"
    reasons  = "\n".join(f"  - {r}" for r in lead["reasons"])

    return f"""You are a senior sales executive at a premium outdoor advertising company in Mumbai.
Generate a personalized sales pitch package with TWO parts:

PART 1 -- WHY THIS LEAD (one line, plain English, max 25 words):
Summarise the scoring reasons below into one natural sentence. Do NOT invent new reasons.

PART 2 -- PITCH EMAIL (professional, warm, max 200 words):
Write a short pitch email using ONLY facts provided below.

SITE FACTS
  Site ID       : {site['site_id']}
  Location      : {site['location']}
  Size          : {site['size_sqft']} sqft
  Traffic Score : {site['traffic_score']}/10
  Monthly Rate  : INR {rate_str}/month  <- QUOTE THIS EXACT NUMBER VERBATIM. Do NOT alter it.
  Available From: {site['free_from_date']}

CUSTOMER FACTS
  Company       : {customer['name']}
  Industry      : {customer['industry']}
  Relationship  : {customer['relationship_score']}/10

SCORING REASONS  (use these as-is, no invention):
{reasons}

OUTPUT FORMAT (follow exactly, no extra lines before WHY THIS LEAD):
WHY THIS LEAD: <one-line summary, max 25 words>
---
PITCH EMAIL:
Subject: <subject line>

Dear {customer['name']} Team,

<email body -- mention {site['location']}, traffic score {site['traffic_score']}/10,
rate INR {rate_str}/month verbatim, and a clear CTA referencing availability from {site['free_from_date']}>

Best regards,
Smart Leads -- OOH Sales Team
"""


# -- rate guardrail --------------------------------------------------------
def _check_rate_drift(text: str, rate: float) -> bool:
    """Return True if the pitch does NOT quote the exact rate, or quotes a wrong one."""
    rate_int = int(rate)
    valid    = {str(rate_int), f"{rate_int:,}"}
    lakh     = rate_int // 100_000
    rem      = rate_int % 100_000
    if lakh > 0:
        valid.add(f"{lakh},{rem:05d}")

    if not any(v in text for v in valid):
        return True   # exact rate missing entirely

    for m in re.finditer(r'\b(\d[\d,]{4,})\b', text):
        num_str = m.group(1).replace(",", "")
        if not num_str.isdigit():
            continue
        val = int(num_str)
        if val == rate_int:
            continue
        start = max(0, m.start() - 50)
        ctx   = text[start : m.end() + 20].lower()
        if any(kw in ctx for kw in ("inr", "rs.", "rate", "/month", "per month")):
            if not any(kw in ctx for kw in ("spend", "budget", "history", "spent")):
                return True   # wrong number quoted as rate
    return False


def _hard_substitute_rate(text: str, rate: float) -> str:
    """Force-replace any wrong rate mentions with the correct value."""
    rate_int = int(rate)
    rate_str = f"{rate_int:,}"

    def fix_num(m):
        raw = m.group(0).replace(",", "")
        if not raw.isdigit():
            return m.group(0)
        val = int(raw)
        if val == rate_int:
            return m.group(0)
        start = max(0, m.start() - 50)
        ctx   = text[start : m.end()].lower()
        if any(kw in ctx for kw in ("spend", "budget", "history", "spent")):
            return m.group(0)
        return rate_str

    fixed = re.sub(r'\b\d[\d,]{4,}\b', fix_num, text)
    if rate_str not in fixed and str(rate_int) not in fixed:
        fixed += f"\n[Rate: INR {rate_str}/month]"
    return fixed


# -- LLM call --------------------------------------------------------------
def _call_llm(prompt: str) -> str:
    """Call OpenRouter; fall back to deterministic template on error."""
    try:
        from dotenv import load_dotenv
        load_dotenv(ROOT / ".env", override=True)
    except ImportError:
        pass

    api_key = os.getenv("OPENROUTER_API_KEY", "").strip()
    model   = os.getenv("OPENROUTER_MODEL", "google/gemini-2.0-flash-exp:free").strip()

    if not api_key:
        return _template_pitch(prompt)
    try:
        import requests
        # Extract the exact rate from the prompt to reinforce in system message
        m_rate = re.search(r'Monthly Rate\s*:\s*INR\s*([\d,]+)/month', prompt)
        rate_literal = m_rate.group(1) if m_rate else ""
        system_msg = (
            f"You are a senior OOH sales executive writing short, professional pitch emails. "
            f"CRITICAL RULE: The site monthly rate is INR {rate_literal}/month. "
            f"You MUST quote this exact number verbatim in the email — do NOT round, change, or omit it. "
            f"Keep the email under 200 words and always complete the email fully before stopping."
        )
        resp = requests.post(
            OPENROUTER_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type":  "application/json",
                "HTTP-Referer":  "http://localhost:8000",
                "X-Title":       "Smart Leads Agent",
            },
            json={
                "model":       model,
                "messages":    [
                    {"role": "system", "content": system_msg},
                    {"role": "user",   "content": prompt},
                ],
                "max_tokens":  500,
                "temperature": 0.55,
            },
            timeout=45,
        )
        resp.raise_for_status()
        data    = resp.json()
        choices = data.get("choices", [])
        if not choices:
            raise ValueError(f"No choices in response: {data}")
        content = choices[0].get("message", {}).get("content", "")
        if not content:
            raise ValueError("Empty content returned")
        return content.strip()
    except Exception as exc:
        print(f"  [LLM] OpenRouter error: {exc} -- falling back to template", flush=True)
        return _template_pitch(prompt)


_pitch_variation_counter = 0

def _template_pitch(prompt: str) -> str:
    """Dynamic multi-style pitch generator that cycles variations on every call."""
    global _pitch_variation_counter
    _pitch_variation_counter += 1

    def ext(pattern):
        m = re.search(pattern, prompt, re.IGNORECASE)
        return m.group(1).strip() if m else ""

    location  = ext(r'Location\s*:\s*(.+)') or "Prime Billboard"
    company   = ext(r'Company\s*:\s*(.+)') or "Valued Advertiser"
    industry  = ext(r'Industry\s*:\s*(.+)') or "Brand"
    traffic   = ext(r'Traffic Score\s*:\s*(.+?)/10') or "8"
    rate_str  = ext(r'Monthly Rate\s*:\s*INR\s*([\d,]+)/month') or "150,000"
    free_from = ext(r'Available From\s*:\s*(.+)') or "Upcoming Month"
    rel_score = ext(r'Relationship\s*:\s*(.+?)/10') or "7.0"
    size_sqft = ext(r'Size\s*:\s*([\d,]+)\s*sqft') or "400"

    raw_reasons = re.findall(r"  - (.+)", prompt)
    def _clean(r):
        return re.sub(r'^\s*\[[^\]]+\]\s*', '', r).strip()

    clean_reasons = [_clean(r) for r in raw_reasons if _clean(r)]

    if clean_reasons:
        why = clean_reasons[0]
        if len(clean_reasons) > 1:
            why = f"{clean_reasons[0]}; additionally, {clean_reasons[1].lower()}"
    else:
        why = f"{company} is a strong fit based on industry alignment and historical spend."

    body_reasons = ". ".join(clean_reasons[1:3]) if len(clean_reasons) > 1 else ""
    if body_reasons and not body_reasons.endswith('.'):
        body_reasons += "."

    styles = [
        # Style 1: Executive C-Level Proposal
        (
            f"Subject: Exclusive OOH Proposal for {company} — {location}\n\n"
            f"Dear {company} Executive Team,\n\n"
            f"We are pleased to offer {company} priority access to a high-visibility outdoor advertising location at {location}.\n\n"
            f"Key Corridor Facts:\n"
            f"• Location: {location} ({size_sqft} sqft billboard)\n"
            f"• Traffic Score: {traffic}/10 high-density audience corridor\n"
            f"• Availability: {free_from} onwards\n"
            f"• Monthly Card Rate: INR {rate_str}/month\n\n"
            f"Strategic Fit:\n"
            f"{body_reasons}\n\n"
            f"Given our strong working relationship ({rel_score}/10 rating), we'd like to confirm your reservation before opening this inventory to competing brands.\n\n"
            f"Best regards,\nSenior Vice President — Outdoor Advertising"
        ),
        # Style 2: High Footfall & Campaign Focus
        (
            f"Subject: High-Impact Billboard Slot in {location} ({industry} Campaign Fit)\n\n"
            f"Hi {company} Sales & Marketing Team,\n\n"
            f"Quick update regarding prime OOH inventory: Our premium site at {location} "
            f"is coming up for renewal soon ({free_from}).\n\n"
            f"Why this is ideal for {company}:\n"
            f"• Traffic Score: {traffic}/10 ({size_sqft} sqft high-visibility display)\n"
            f"• Card Rate: INR {rate_str}/month\n"
            f"• Key Match: {why}\n\n"
            f"We can lock in this slot for your upcoming campaign at the confirmed rate of INR {rate_str}/month. "
            f"Let us know if you'd like to reserve this site before public release.\n\n"
            f"Warm regards,\nOOH Campaign Manager"
        ),
        # Style 3: Priority Access & Loyalty Discount Focus
        (
            f"Subject: Priority Access: {location} Hoarding Available {free_from}\n\n"
            f"Hello {company} Team,\n\n"
            f"As a valued client ({rel_score}/10 CRM rating), we wanted to share an upcoming high-value slot at {location}.\n\n"
            f"{body_reasons}\n\n"
            f"Site Specs:\n"
            f"- Location: {location}\n"
            f"- Monthly Rate: INR {rate_str}/month\n"
            f"- Size: {size_sqft} sqft | Traffic Index: {traffic}/10\n"
            f"- Availability: {free_from} onwards\n\n"
            f"Please let us know if you would like us to hold this location for your team.\n\n"
            f"Best regards,\nSmart Leads Team"
        ),
        # Style 4: Direct Opportunity Alert
        (
            f"Subject: Opportunity Alert: {location} Billboard Space Open {free_from}\n\n"
            f"Dear {company} Marketing Desk,\n\n"
            f"A high-performing outdoor advertising slot is becoming vacant at {location}.\n\n"
            f"Corridor Highlights:\n"
            f"1. Footfall Index: {traffic}/10 ({size_sqft} sqft site)\n"
            f"2. Target Advertiser Alignment: Ideal for {industry} campaigns\n"
            f"3. Rate: INR {rate_str}/month\n\n"
            f"{why}\n\n"
            f"Can we schedule a 5-minute call this week to lock in your campaign dates?\n\n"
            f"Sincerely,\nOOH Account Manager"
        ),
        # Style 5: Competitive Advantage Pitch
        (
            f"Subject: Dominate the {location} Corridor — {company}\n\n"
            f"Hi {company} Strategy Team,\n\n"
            f"If you're planning your upcoming OOH visibility drive, our premier billboard at {location} frees up on {free_from}.\n\n"
            f"With a {traffic}/10 traffic score and {size_sqft} sqft footprint, this location offers maximum brand recall. Card rate is set at INR {rate_str}/month.\n\n"
            f"{body_reasons}\n\n"
            f"Reply to this email to secure the slot today.\n\n"
            f"Best,\nSmart Leads Outdoor Desk"
        )
    ]

    idx = (_pitch_variation_counter - 1) % len(styles)
    chosen_body = styles[idx]
    return f"WHY THIS LEAD: {why}\n---\nPITCH EMAIL:\n{chosen_body}"


# -- response parser -------------------------------------------------------
def _parse_response(raw: str):
    """Split LLM output into (why_summary, pitch_email_text)."""
    m = re.search(r'(?i)WHY THIS LEAD:\s*(.+?)(?=\n---|\Z)', raw, re.DOTALL)
    why = m.group(1).strip().rstrip('*- ') if m else ""

    parts = re.split(r'\n---+\n?', raw, maxsplit=1)
    email_part = parts[1].strip() if len(parts) > 1 else raw.strip()
    email_part = re.sub(r'(?i)^\s*PITCH EMAIL:\s*\n?', '', email_part).strip()
    return why, email_part


# -- public API ------------------------------------------------------------
def generate_pitch(site_id: str, customer_id: str) -> dict:
    """
    Generate a personalized pitch for one (site_id, customer_id) pair.

    Returns:
        {
          pitch_text      : str  -- the full email text
          quoted_rate_inr : int  -- exact monthly rate used
          why_summary     : str  -- one-line plain-English reason summary
          guardrail_fired : bool -- True if hard-substitute was needed
          llm_mode        : str  -- 'openrouter' | 'template'
        }
    """
    sid = _normalize_site_id(site_id)
    cid = customer_id.strip()

    df_master, df_leads = load_data()

    site = _get_site_facts(sid, df_master)
    if site is None:
        raise ValueError(f"Site '{sid}' not found in Master_Site_Data")

    customer = _get_customer_facts(cid, df_master, df_leads)
    if customer is None:
        raise ValueError(f"Customer '{cid}' not found in Master_Site_Data or Phase2_Leads")

    # Get top-3 leads and find this customer's entry
    leads = get_leads(sid)
    lead  = next((l for l in leads if l["customer_id"] == cid), None)
    if lead is None:
        lead = {
            "customer_id": cid,
            "name":        customer["name"],
            "score":       0.0,
            "reasons":     [f"[Manual] Pitch generated on request for {customer['name']}"],
        }

    rate           = site["monthly_rate_inr"]
    prompt         = _build_prompt(site, customer, lead)
    guardrail_fired = False
    why_summary    = ""
    pitch_text     = ""

    for attempt in range(3):
        raw                    = _call_llm(prompt)
        why_summary, pitch_text = _parse_response(raw)
        if not _check_rate_drift(pitch_text, rate):
            break
        print(f"  [Guardrail] Rate drift detected on attempt {attempt + 1}/3", flush=True)
        if attempt == 2:
            pitch_text      = _hard_substitute_rate(pitch_text, rate)
            guardrail_fired = True

    return {
        "site_id":         sid,
        "customer_id":     cid,
        "site_location":   site["location"],
        "customer_name":   customer["name"],
        "quoted_rate_inr": int(rate),
        "lead_score":      lead["score"],
        "why_summary":     why_summary,
        "pitch_text":      pitch_text,
        "guardrail_fired": guardrail_fired,
        "llm_mode":        "openrouter" if OPENROUTER_API_KEY else "template",
    }


# -- CLI test --------------------------------------------------------------
if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Generate a pitch for a site+customer pair")
    ap.add_argument("site_id",     nargs="?", default="HRD-101")
    ap.add_argument("customer_id", nargs="?", default="CUST-34")
    args = ap.parse_args()

    print(f"\nGenerating pitch for {args.site_id.upper()} -> {args.customer_id.upper()} ...\n",
          flush=True)
    result = generate_pitch(args.site_id, args.customer_id)

    W = 72
    print("=" * W)
    print(f"  PITCH  :  {result['site_location']}  |  {result['customer_name']}")
    print(f"  Rate   :  INR {result['quoted_rate_inr']:,}/month   Score: {result['lead_score']:.4f}")
    print("=" * W)
    print(f"\nWHY THIS LEAD:")
    print(f"  {result['why_summary']}\n")
    print("-" * W)
    print("\nPITCH EMAIL:\n")
    for line in result["pitch_text"].splitlines():
        print(textwrap.fill(line, width=W, subsequent_indent="  ") if len(line) > W else line)
    print("\n" + "=" * W)



