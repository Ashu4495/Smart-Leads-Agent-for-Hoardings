"""
get_leads.py — Smart Leads Engine for Hoarding (OOH) Sites
============================================================
Reads Smart_Leads_Master.xlsx and scores every eligible customer
against a target site across 5 weighted factors.  All reasons are
written in plain English, mentioning the company name and industry.

Usage:  python get_leads.py
"""

import os
import re
import sys
import textwrap
import datetime
import pandas as pd

# ---------------------------------------------------------------------------
# 1.  BUDGET BAND CAPS  (INR / month)
# ---------------------------------------------------------------------------
BUDGET_BANDS = {
    'low':  {'max': 200_000, 'label': 'Low  (up to INR 2,00,000 / mo)'},
    'mid':  {'max': 350_000, 'label': 'Mid  (INR 2,00,001 – 3,50,000 / mo)'},
    'high': {'max': 10_000_000, 'label': 'High (above INR 3,50,000 / mo)'},
}

# ---------------------------------------------------------------------------
# 2.  INDUSTRY-TO-LOCATION AFFINITY MAP
#     Which industries typically benefit from which location keywords?
# ---------------------------------------------------------------------------
INDUSTRY_LOCATION_AFFINITY = {
    'fmcg':        ['flyover', 'junction', 'toll', 'road', 'circle', 'naka'],
    'retail':      ['metro', 'mall', 'road', 'junction', 'market'],
    'jewellery':   ['metro', 'road', 'malad', 'andheri', 'kandivali', 'bkc'],
    'automotive':  ['road', 'toll', 'naka', 'junction', 'highway', 'borivali'],
    'real_estate': ['bkc', 'powai', 'hiranandani', 'thane', 'goregaon', 'approach'],
    'healthcare':  ['metro', 'circle', 'sion', 'andheri', 'road'],
    'education':   ['metro', 'flyover', 'junction', 'road', 'kandivali'],
    'electronics': ['metro', 'bkc', 'powai', 'junction', 'approach', 'hiranandani'],
    'hospitality': ['bkc', 'powai', 'road', 'metro'],
}

# Friendly industry display names
INDUSTRY_LABELS = {
    'fmcg':        'FMCG',
    'retail':      'Retail',
    'jewellery':   'Jewellery',
    'automotive':  'Automotive',
    'real_estate': 'Real Estate',
    'healthcare':  'Healthcare',
    'education':   'Education',
    'electronics': 'Electronics',
    'hospitality': 'Hospitality',
}

# ---------------------------------------------------------------------------
# 3.  SCORING WEIGHTS  (must sum to 1.0)
# ---------------------------------------------------------------------------
W_AFFINITY     = 0.30   # Past bookings at / near this site
W_INDUSTRY     = 0.20   # Industry–location fit
W_RELATIONSHIP = 0.20   # CRM relationship score
W_RECENCY      = 0.15   # Days since last contact
W_VALUE        = 0.15   # Avg historical spend vs site rate

REF_DATE = datetime.date(2026, 8, 8)


# ---------------------------------------------------------------------------
# 4.  DATA LOADING
# ---------------------------------------------------------------------------
def _excel_path():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.dirname(base_dir)
    candidates = [
        os.path.join(root_dir, 'data', 'Smart_Leads_Master.xlsx'),
        os.path.join(root_dir, 'Data', 'Smart_Leads_Master.xlsx'),
        os.path.join(base_dir, 'Data', 'Smart_Leads_Master.xlsx'),
        os.path.join(base_dir, 'data', 'Smart_Leads_Master.xlsx'),
        os.path.join('data', 'Smart_Leads_Master.xlsx'),
        os.path.join('Data', 'Smart_Leads_Master.xlsx'),
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    raise FileNotFoundError('Smart_Leads_Master.xlsx not found in data/ or Data/')


def load_data():
    path = _excel_path()
    xls = pd.ExcelFile(path)
    df_master = pd.read_excel(xls, 'Master_Site_Data')
    df_leads  = pd.read_excel(xls, 'Phase2_Leads') if 'Phase2_Leads' in xls.sheet_names else None
    return df_master, df_leads


# ---------------------------------------------------------------------------
# 5.  SITE LOOKUP  (fresh per query — no caching)
# ---------------------------------------------------------------------------
def _normalize_site_id(raw: str) -> str:
    """Accept '113', 'hrd113', 'HRD-113' and normalize to 'HRD-113'."""
    s = raw.strip().upper().replace(' ', '')
    if re.fullmatch(r'\d+', s):
        return f'HRD-{s}'
    if re.fullmatch(r'HRD\d+', s):
        return f'HRD-{s[3:]}'
    return s


def get_site_details(raw_id: str, df_master: pd.DataFrame):
    sid = _normalize_site_id(raw_id)
    rows = df_master[df_master['Site ID (PK)'].str.strip().str.upper() == sid]
    if rows.empty:
        return None
    r = rows.iloc[0]
    return {
        'site_id':          sid,
        'location':         str(r['Location']),
        'monthly_rate_inr': float(r['Monthly Rate (INR)']),
    }


# ---------------------------------------------------------------------------
# 6.  CUSTOMER PROFILE BUILDER
# ---------------------------------------------------------------------------
def _build_customer_profiles(df_master: pd.DataFrame, df_leads=None) -> dict:
    """
    Build customer profiles from Master_Site_Data.
    Also seeds synthetic profiles for customers that appear only in Phase2_Leads
    (e.g. CUST-42 MediTrust Labs, CUST-47 NovaBikes, CUST-49 ZenCare Clinics)
    so they are never silently dropped.
    """
    profiles: dict = {}

    # Primary source: Master_Site_Data
    for _, row in df_master.iterrows():
        cid = row['Customer ID']
        if pd.isna(cid):
            continue
        cid = str(cid).strip()
        if cid not in profiles:
            profiles[cid] = {
                'customer_id':        cid,
                'name':               str(row['Customer Name']).strip(),
                'industry':           str(row['Industry']).strip().lower(),
                'budget_band':        str(row['Budget Band']).strip().lower(),
                'relationship_score': float(row['Relationship Score'])
                                      if pd.notna(row['Relationship Score']) else 5.0,
                'last_contact_date':  row['Last Contact Date'],
                'past_bookings':      [],
                'contract_values':    [],
            }
        b_sid  = str(row['Site ID (PK)']).strip().upper()
        b_loc  = str(row['Location']).strip()
        b_rate = float(row['Monthly Rate (INR)']) if pd.notna(row['Monthly Rate (INR)']) else 0.0

        profiles[cid]['past_bookings'].append({'site_id': b_sid, 'location': b_loc, 'rate': b_rate})
        if b_rate > 0:
            profiles[cid]['contract_values'].append(b_rate)

    # Supplementary source: Phase2_Leads (fills in customers not in Master)
    if df_leads is not None:
        for _, row in df_leads.iterrows():
            cid = str(row['Customer ID']).strip()
            if cid in profiles:
                continue   # already seeded from Master
            if pd.isna(row.get('Customer Name')):
                continue

            # Extract relationship score from stored reason text
            rel_score = 5.0
            r3_text = str(row.get('Reason 3 - Relationship', '')).strip()
            m_rel = re.search(r'score (\d+)/10', r3_text)
            if m_rel:
                rel_score = float(m_rel.group(1))

            # Extract last-contact days from stored reason text -> synthetic date
            last_contact = None
            r4_text = str(row.get('Reason 4 - Recency', '')).strip()
            m_days = re.search(r'(\d+) days ago', r4_text)
            if m_days:
                days_ago = int(m_days.group(1))
                last_contact = REF_DATE - datetime.timedelta(days=days_ago)

            # Extract avg monthly spend from stored reason text
            avg_spend = 0.0
            r5_text = str(row.get('Reason 5 - Value', '')).strip()
            m_spend = re.search(r'spend ~INR ([\d,]+)', r5_text)
            if m_spend:
                avg_spend = float(m_spend.group(1).replace(',', ''))

            profiles[cid] = {
                'customer_id':        cid,
                'name':               str(row['Customer Name']).strip(),
                'industry':           str(row.get('Industry', 'unknown')).strip().lower(),
                'budget_band':        str(row.get('Budget Band', 'mid')).strip().lower(),
                'relationship_score': rel_score,
                'last_contact_date':  last_contact,
                'past_bookings':      [],   # no booking history available
                'contract_values':    [avg_spend] if avg_spend > 0 else [],
            }

    return profiles


# ---------------------------------------------------------------------------
# 7.  SCORING HELPERS
# ---------------------------------------------------------------------------
def _score_affinity(cust: dict, site_id: str, site_loc: str) -> tuple:
    """
    Returns (score_contribution, reason_string).
    Distinguishes exact-site booking from same-area / corridor proximity.
    """
    sid = site_id.upper()
    loc_tokens = set(re.sub(r'[#\d]', '', site_loc).lower().split())

    exact        = [b for b in cust['past_bookings'] if b['site_id'] == sid]
    same_area    = [b for b in cust['past_bookings']
                    if b['site_id'] != sid
                    and loc_tokens.intersection(re.sub(r'[#\d]', '', b['location']).lower().split())]
    any_booking  = [b for b in cust['past_bookings'] if b['site_id'] != sid]

    name = cust['name']
    ind  = INDUSTRY_LABELS.get(cust['industry'], cust['industry'].title())

    if exact:
        num = len(exact)
        reason = (f"{name} has booked {site_id} before"
                  f" ({num} contract{'s' if num > 1 else ''}) — proven site performance for {ind} brands.")
        return W_AFFINITY, reason

    if same_area:
        ref  = same_area[0]
        common = ', '.join(loc_tokens.intersection(
                    re.sub(r'[#\d]', '', ref['location']).lower().split()))
        reason = (f"{name} previously booked {ref['site_id']} ({ref['location']})"
                  f" — same {common} corridor; strong location familiarity for an {ind} advertiser.")
        return W_AFFINITY * 0.55, reason

    if any_booking:
        ref = any_booking[0]
        reason = (f"{name} is an active OOH buyer (last booked {ref['site_id']}),"
                  f" though no prior history on this specific corridor.")
        return W_AFFINITY * 0.20, reason

    reason = f"{name} has no OOH booking history in the database — untested spend potential."
    return W_AFFINITY * 0.05, reason


def _score_industry(cust: dict, site_id: str, site_loc: str) -> tuple:
    """
    Returns (score_contribution, reason_string).
    Checks known industry–location keyword affinity.
    """
    ind      = cust['industry']
    ind_lbl  = INDUSTRY_LABELS.get(ind, ind.title())
    name     = cust['name']
    loc_low  = site_loc.lower()
    keywords = INDUSTRY_LOCATION_AFFINITY.get(ind, [])
    matched  = [kw for kw in keywords if kw in loc_low]

    if matched:
        kw_str = ', '.join(matched)
        reason = (f"{name} is a {ind_lbl} brand — {ind_lbl} advertisers frequently dominate"
                  f" {kw_str}-type OOH corridors like {site_loc}.")
        return W_INDUSTRY, reason

    reason = (f"{name} ({ind_lbl}) does not have a strong keyword affinity"
              f" with {site_loc} — may still benefit from the footfall volume.")
    return W_INDUSTRY * 0.40, reason


def _score_relationship(cust: dict) -> tuple:
    rel   = cust['relationship_score']
    name  = cust['name']
    score = (rel / 10.0) * W_RELATIONSHIP

    if rel >= 8:
        tone = f"strong relationship ({int(rel)}/10) — high conversion likelihood"
    elif rel >= 5:
        tone = f"moderate relationship ({int(rel)}/10) — responsive to outreach"
    elif rel >= 3:
        tone = f"low relationship ({int(rel)}/10) — needs re-engagement first"
    else:
        tone = f"very low relationship ({int(rel)}/10) — cold prospect, tread carefully"

    reason = f"{name} has a {tone}."
    return score, reason


def _score_recency(cust: dict) -> tuple:
    name = cust['name']
    days = 180   # default (cold)
    if pd.notna(cust['last_contact_date']):
        try:
            days = (REF_DATE - pd.to_datetime(cust['last_contact_date']).date()).days
        except Exception:
            pass

    if days <= 14:
        bucket = 'very hot lead'
        score  = W_RECENCY
    elif days <= 30:
        bucket = 'warm lead'
        score  = W_RECENCY * 0.90
    elif days <= 60:
        bucket = 'recent contact'
        score  = W_RECENCY * 0.70
    elif days <= 90:
        bucket = 'follow-up window'
        score  = W_RECENCY * 0.55
    elif days <= 180:
        bucket = 'cooling off'
        score  = W_RECENCY * 0.35
    else:
        bucket = 'stale — re-activation needed'
        score  = W_RECENCY * 0.10

    reason = f"{name} was last contacted {days} days ago ({bucket})."
    return score, reason


def _score_value(cust: dict, site_rate: float) -> tuple:
    name  = cust['name']
    vals  = cust['contract_values']
    if vals:
        avg = sum(vals) / len(vals)
    else:
        avg = site_rate * 0.5   # penalise unknown

    ratio = avg / site_rate if site_rate > 0 else 1.0
    score = min(ratio, 1.0) * W_VALUE        # contribution capped at weight
    # (ratio displayed uncapped)

    if ratio >= 1.20:
        commentary = f"consistently outspends this site's rate — premium buyer"
    elif ratio >= 1.0:
        commentary = f"avg spend covers the full site rate — comfortable fit"
    elif ratio >= 0.75:
        commentary = f"avg spend is close to rate — viable with slight stretch"
    elif ratio >= 0.50:
        commentary = f"avg spend is below rate — may need upsell conversation"
    else:
        commentary = f"avg spend significantly below rate — budget risk"

    reason = (f"{name} avg monthly OOH spend ~INR {int(avg):,} vs"
              f" site rate INR {int(site_rate):,} (ratio {ratio:.3f}) — {commentary}.")
    return score, reason


# ---------------------------------------------------------------------------
# 8.  DYNAMIC SCORING ENGINE
# ---------------------------------------------------------------------------
def _dynamic_score(cust: dict, site_id: str, site_loc: str, site_rate: float) -> dict:
    s1, r1 = _score_affinity(cust, site_id, site_loc)
    s2, r2 = _score_industry(cust, site_id, site_loc)
    s3, r3 = _score_relationship(cust)
    s4, r4 = _score_recency(cust)
    s5, r5 = _score_value(cust, site_rate)

    total = round(s1 + s2 + s3 + s4 + s5, 4)
    return {
        'customer_id': cust['customer_id'],
        'name':        cust['name'],
        'score':       total,
        'reasons': [
            f"[Affinity]     {r1}",
            f"[Industry Fit] {r2}",
            f"[Relationship] {r3}",
            f"[Recency]      {r4}",
            f"[Value Fit]    {r5}",
        ],
    }


# ---------------------------------------------------------------------------
# 9.  PHASE-2 LEADS ENRICHMENT  (pre-computed sheet, reasons enhanced inline)
# ---------------------------------------------------------------------------
def _enrich_phase2_row(row, cust: dict, site_rate: float, site_loc: str, site_id: str) -> dict:
    """Use stored Lead Score but rewrite all 5 reasons with company-aware language."""
    cid = cust['customer_id']

    # Factor 1 — Affinity (rewrite using our helper for consistency)
    _, r1 = _score_affinity(cust, site_id, site_loc)

    # Factor 2 — Industry Fit (rewrite with company name)
    _, r2 = _score_industry(cust, site_id, site_loc)

    # Factor 3 — Relationship (from stored score, rewrite)
    _, r3 = _score_relationship(cust)

    # Factor 4 — Recency (rewrite)
    _, r4 = _score_recency(cust)

    # Factor 5 — Value Fit (extract actual spend from stored text, rewrite)
    f5_raw = str(row.get('Reason 5 - Value', '')).encode('ascii', errors='ignore').decode('ascii')
    m = re.search(r'spend ~INR ([\d,]+)', f5_raw)
    if m:
        avg_spend = float(m.group(1).replace(',', ''))
    else:
        vals = cust['contract_values']
        avg_spend = sum(vals) / len(vals) if vals else site_rate
    ratio = avg_spend / site_rate if site_rate > 0 else 1.0
    if ratio >= 1.20:
        comm = 'consistently outspends rate — premium buyer'
    elif ratio >= 1.0:
        comm = 'avg spend covers full rate — comfortable fit'
    elif ratio >= 0.75:
        comm = 'near rate — viable with slight stretch'
    elif ratio >= 0.50:
        comm = 'below rate — may need upsell conversation'
    else:
        comm = 'significantly below rate — budget risk'
    r5 = (f"{cust['name']} avg monthly OOH spend ~INR {int(avg_spend):,} vs"
          f" site rate INR {int(site_rate):,} (ratio {ratio:.3f}) — {comm}.")

    return {
        'customer_id': cid,
        'name':        cust['name'],
        'score':       round(float(row['Lead Score']), 4),
        'reasons': [
            f"[Affinity]     {r1}",
            f"[Industry Fit] {r2}",
            f"[Relationship] {r3}",
            f"[Recency]      {r4}",
            f"[Value Fit]    {r5}",
        ],
    }


# ---------------------------------------------------------------------------
# 10.  PUBLIC API
# ---------------------------------------------------------------------------
def get_leads(raw_site_id: str) -> list:
    """
    Return top-3 best-fit customers for a given site.
    Each item: {customer_id, name, score, reasons}
    """
    df_master, df_leads = load_data()
    # Pass df_leads so Phase2-only customers get seeded into profiles
    customers = _build_customer_profiles(df_master, df_leads)

    site_id   = _normalize_site_id(raw_site_id)
    site_info = get_site_details(site_id, df_master)

    if not site_info:
        print(f"  [!] Site ID '{site_id}' not found in master records.")
        return []

    site_rate = site_info['monthly_rate_inr']
    site_loc  = site_info['location']

    # --- eligibility gate (BEFORE any scoring) ---
    def eligible(band: str) -> bool:
        return BUDGET_BANDS.get(band, {}).get('max', 0) >= site_rate

    # --- try Phase-2 pre-computed leads first ---
    if df_leads is not None and not df_leads.empty:
        matched = df_leads[df_leads['Site ID'].str.strip().str.upper() == site_id]
        if not matched.empty:
            results = []
            for _, row in matched.iterrows():
                cid    = str(row['Customer ID']).strip()
                c_band = str(row['Budget Band']).strip().lower()
                if not eligible(c_band):
                    continue
                # cid is now guaranteed to exist in customers (seeded above)
                cust_profile = customers.get(cid)
                if cust_profile is None:
                    continue  # truly missing — skip
                entry = _enrich_phase2_row(row, cust_profile, site_rate, site_loc, site_id)
                results.append(entry)
            results.sort(key=lambda x: x['score'], reverse=True)
            return results[:3]

    # --- dynamic scoring fallback ---
    results = []
    for cid, cust in customers.items():
        if not eligible(cust['budget_band']):
            continue
        results.append(_dynamic_score(cust, site_id, site_loc, site_rate))

    results.sort(key=lambda x: x['score'], reverse=True)
    return results[:3]


# ---------------------------------------------------------------------------
# 11.  TERMINAL  INTERFACE
# ---------------------------------------------------------------------------
def print_budget_verification(df_master: pd.DataFrame):
    W = 72
    print('=' * W)
    print('SMART LEADS AGENT  --  Budget Band Cutoffs & Site Rate Reference')
    print('=' * W)
    print()
    print('[Budget Band Cutoffs]')
    for k, v in BUDGET_BANDS.items():
        print(f"  {k.upper():<5}  Max = INR {v['max']:>12,}   {v['label']}")
    print()
    print('[Site Monthly Rates]')
    sites = df_master[['Site ID (PK)', 'Location', 'Monthly Rate (INR)']].drop_duplicates()
    for _, r in sites.iterrows():
        print(f"  {r['Site ID (PK)']:<9} | {r['Location']:<34} | INR {int(r['Monthly Rate (INR)']):>8,}")
    print('=' * W)
    print()
    sys.stdout.flush()


if __name__ == '__main__':
    # -- import pitch generator (Backend/ is one level down from here)
    import importlib.util, pathlib
    _pg_path = pathlib.Path(__file__).parent / 'Backend' / 'pitch_generator.py'
    _pg_spec = importlib.util.spec_from_file_location('pitch_generator', _pg_path)
    _pg_mod  = importlib.util.module_from_spec(_pg_spec)
    _pg_spec.loader.exec_module(_pg_mod)
    generate_pitch = _pg_mod.generate_pitch

    df_master, _ = load_data()
    print_budget_verification(df_master)

    raw = input('Enter Site ID (e.g. HRD-101, HRD-113, HRD-122, or just 113): ').strip()
    sys.stdout.write('\n')
    if not raw:
        raw = 'HRD-101'
        print(f'  [i] No input. Defaulting to {raw}')

    sid   = _normalize_site_id(raw)
    leads = get_leads(raw)

    W = 72

    print('=' * W)
    print(f'Top 3 Best-Fit Leads for Site  [ {sid} ]')
    print('=' * W)
    sys.stdout.flush()

    if not leads:
        print('\n  No eligible leads found for this site.')
    else:
        TAG_COL  = 15
        CONT_IND = '  ' + ' ' * TAG_COL + '  '
        TEXT_W   = W - len(CONT_IND)

        for i, lead in enumerate(leads, 1):
            bar   = '#' * int(lead['score'] * 40)
            score = lead['score']
            name  = lead['name']
            cid   = lead['customer_id']

            print()
            print('-' * W)
            print(f'  {i}.  {name}  ({cid})   Score: {score:.4f}')
            print(f'       [{bar:<40}]')
            print()

            for reason in lead['reasons']:
                if ']' in reason:
                    tag_end  = reason.index(']') + 1
                    tag_part = reason[:tag_end]
                    body     = reason[tag_end:].lstrip()
                    wrapped  = textwrap.fill(body, width=TEXT_W, subsequent_indent=CONT_IND)
                    print(f'  {tag_part:<{TAG_COL}}  {wrapped}')
                else:
                    print(textwrap.fill(reason, width=W, initial_indent='  ',
                                        subsequent_indent='  '))
            sys.stdout.flush()

            # ── generate pitch for this lead ──────────────────────────────
            print()
            print('  ' + '~' * (W - 4))
            print(f'  PITCH for {name}')
            print('  ' + '~' * (W - 4))
            try:
                pitch = generate_pitch(sid, cid)

                # WHY SUMMARY
                why = pitch.get('why_summary', '').strip()
                if why:
                    print()
                    print('  WHY THIS LEAD:')
                    for ln in textwrap.wrap(why, width=W - 4, initial_indent='    ',
                                            subsequent_indent='    '):
                        print(ln)

                # PITCH EMAIL
                print()
                print('  PITCH EMAIL:')
                print()
                email_lines = pitch.get('pitch_text', '').splitlines()
                for ln in email_lines:
                    if ln.strip():
                        print(textwrap.fill(ln, width=W - 2, initial_indent='  ',
                                            subsequent_indent='  '))
                    else:
                        print()



            except Exception as exc:
                print(f'  [Pitch error: {exc}]')

            sys.stdout.flush()

    print()
    print('=' * W)
    sys.stdout.flush()


