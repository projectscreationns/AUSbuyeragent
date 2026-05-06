#!/usr/bin/env python3
"""
AUS Buyer Agent — Google Custom Search API Listing Scout

Root cause fix: Domain/REA block scrapers, but Google indexes every listing.
Google Custom Search API exposes that index as structured JSON.

Cost: $5/1000 queries. One full run = ~50-100 queries = $0.25-0.50.
With $300 credits = 60,000 searches.

SETUP:
  1. Enable "Custom Search API" in Google Cloud Console → APIs & Services
  2. Create a Programmable Search Engine at https://programmablesearchengine.google.com/
     → Restrict to: realestate.com.au, domain.com.au, reiwa.com.au, allhomes.com.au
  3. Copy the Search Engine ID (cx) → add to .env as GOOGLE_CSE_ID
  4. Use your Google API key (or create one) → add to .env as GOOGLE_API_KEY
  5. Run: python3 scripts/scout_google.py

Usage:
  python3 scripts/scout_google.py                    # scan all suburbs
  python3 scripts/scout_google.py --suburb Kirwan     # scan one suburb
  python3 scripts/scout_google.py --dry-run           # test without API calls
"""

import re
import json
import sys
import time
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
LISTINGS_FILE = ROOT / "public" / "data" / "listings.json"
SUBURBS_FILE = ROOT / "public" / "data" / "suburbs.json"
ENV_FILE = ROOT / ".env"
BUDGET = 800000

# ─── Load keys from .env ────────────────────────────────────

def load_env():
    keys = {}
    if not ENV_FILE.exists():
        return keys
    for line in ENV_FILE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if '=' in line:
            k, v = line.split('=', 1)
            keys[k.strip()] = v.strip()
    return keys

ENV = load_env()
API_KEY = ENV.get('GOOGLE_API_KEY') or ENV.get('GOOGLE_MAPS_API_KEY')
CSE_ID = ENV.get('GOOGLE_CSE_ID')

# ─── Suburb targets ─────────────────────────────────────────
# (name, state, postcode, median_house, rent_3bed_wk, rent_4bed_wk)

SUBURBS = [
    # QLD — Townsville
    ('Kirwan',           'QLD', '4817', 550000, 500, 580),
    ('Condon',           'QLD', '4815', 599000, 500, 580),
    ('Aitkenvale',       'QLD', '4814', 681000, 520, 600),
    ('Kelso',            'QLD', '4815', 580000, 490, 570),
    ('Mount Louisa',     'QLD', '4814', 620000, 510, 590),
    # SA — Adelaide north
    ('Para Hills',       'SA',  '5096', 520000, 480, 560),
    ('Salisbury North',  'SA',  '5108', 615000, 510, 590),
    ('Ingle Farm',       'SA',  '5098', 700000, 520, 600),
    ('Parafield Gardens','SA',  '5107', 650000, 500, 580),
    ('Gawler East',      'SA',  '5118', 720000, 520, 600),
    # VIC — outer southeast
    ('Hampton Park',     'VIC', '3976', 680000, 540, 610),
    ('Cranbourne West',  'VIC', '3977', 695000, 550, 620),
    ('Narre Warren',     'VIC', '3805', 720000, 560, 630),
    # WA — middle ring
    ('Baldivis',         'WA',  '6171', 750000, 620, 700),
    ('Wellard',          'WA',  '6170', 710000, 580, 670),
    ('Mandurah',         'WA',  '6210', 575000, 520, 600),
    ('Thornlie',         'WA',  '6108', 680000, 560, 650),
]

# ─── Google Custom Search API ───────────────────────────────

def google_search(query, start=1):
    """Call Google Custom Search API. Returns list of result items."""
    params = urllib.parse.urlencode({
        'key': API_KEY,
        'cx': CSE_ID,
        'q': query,
        'start': start,
        'num': 10,
    })
    url = f"https://www.googleapis.com/customsearch/v1?{params}"

    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  API error {e.code}: {body[:200]}")
        return [], 0
    except Exception as e:
        print(f"  Request failed: {e}")
        return [], 0

    total = int(data.get('searchInformation', {}).get('totalResults', 0))
    items = data.get('items', [])
    return items, total


def search_suburb_listings(name, state, postcode, num_pages=3):
    """Search Google for listings in a suburb. Returns raw search results."""
    queries = [
        f'site:realestate.com.au "{name}" "{state}" house for sale',
        f'site:domain.com.au "{name}" house for sale',
    ]

    all_results = []
    seen_links = set()

    for q in queries:
        for page in range(num_pages):
            start = page * 10 + 1
            if start > 30:
                break

            items, total = google_search(q, start=start)
            if not items:
                break

            for item in items:
                link = item.get('link', '')
                if link in seen_links:
                    continue
                seen_links.add(link)
                all_results.append(item)

            # Don't paginate if fewer than 10 results
            if len(items) < 10:
                break

            time.sleep(0.3)

        time.sleep(0.5)

    return all_results


# ─── Parse Google result into listing ────────────────────────

def parse_google_result(item, suburb_name, state, postcode, median):
    """Extract listing data from a Google Custom Search result."""
    title = item.get('title', '')
    snippet = item.get('snippet', '')
    link = item.get('link', '')
    combined = f"{title} {snippet}"

    # Skip non-listing pages (suburb profiles, guides, sold results)
    lower_title = title.lower()
    if any(skip in lower_title for skip in [
        'suburb profile', 'market trends', 'median price',
        'real estate agents', 'property history', 'sold ',
        'recently sold', 'rental', 'rent ', 'for rent',
        'property data', 'statistics', 'how much',
    ]):
        return None

    # Skip non-house types in URL
    lower_link = link.lower()
    if any(t in lower_link for t in [
        'property-unit', 'property-apartment', 'property-townhouse',
        'property-villa', 'property-land', '/rent/',
    ]):
        return None

    # Must reference the target suburb
    if suburb_name.lower() not in combined.lower():
        return None

    # ── Extract address ──
    # realestate.com.au title: "14 Smith Street, Kirwan, QLD 4817 - House for Sale"
    # domain.com.au title: "14 Smith Street, Kirwan QLD 4817 | domain.com.au"
    addr = None
    addr_patterns = [
        # "14 Smith St, Kirwan, QLD 4817"
        rf'(\d+[A-Za-z]?\s+[\w\s\']+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Close|Cl|Crescent|Cres|Place|Pl|Way|Lane|Ln|Parade|Pde|Terrace|Tce|Circuit|Cct|Boulevard|Blvd|Grove|Gr|Rise|View|Loop|Turn|Mews|Row|Pass|Trail|Run|Glen|Park|Walk|Gate|Dell|Nook|Bend|Link|Glade|Chase|Cove|Retreat|Gardens|Gdn|Highway|Hwy)[\w]*,?\s+{suburb_name}[,\s]+{state}\s*{postcode})',
        # Broader: "14 Something, Kirwan"
        rf'(\d+[A-Za-z]?\s+[\w\s\']+,\s*{suburb_name})',
        # From title before dash/pipe
        r'^(\d+[A-Za-z]?\s+[^|–\-]+?)(?:\s*[-–|])',
    ]
    for pat in addr_patterns:
        m = re.search(pat, combined, re.IGNORECASE)
        if m:
            addr = m.group(1).strip().rstrip(',').strip()
            break

    if not addr:
        # Try extracting from title directly if it starts with a number
        if re.match(r'^\d', title):
            addr = re.split(r'\s*[-–|]\s*', title)[0].strip()

    if not addr or not re.match(r'^\d', addr):
        return None

    # Clean up address — ensure it has suburb + state
    if suburb_name.lower() not in addr.lower():
        addr = f"{addr}, {suburb_name}, {state} {postcode}"
    elif state not in addr:
        addr = f"{addr}, {state} {postcode}"

    # Skip fake/placeholder addresses
    if re.search(r'browse|search|listings|multiple|harris re', addr, re.IGNORECASE):
        return None

    # ── Extract price ──
    price_text = None
    price_numeric = None

    price_patterns = [
        # "$549,000" or "$1,250,000"
        (r'\$\s*([\d,]+)', lambda m: int(m.group(1).replace(',', ''))),
        # "Offers over $530,000"
        (r'(?:Offers?\s+(?:over|from|above))\s+\$([\d,]+)', lambda m: int(m.group(1).replace(',', ''))),
        # "$530k" or "$530K"
        (r'\$\s*(\d{3,4})\s*[kK]', lambda m: int(m.group(1)) * 1000),
        # "From $530,000"
        (r'(?:From)\s+\$([\d,]+)', lambda m: int(m.group(1).replace(',', ''))),
        # Price range "$500,000 - $550,000" → take midpoint
        (r'\$\s*([\d,]+)\s*[-–]\s*\$([\d,]+)', lambda m: (int(m.group(1).replace(',', '')) + int(m.group(2).replace(',', ''))) // 2),
    ]

    for pat, extractor in price_patterns:
        m = re.search(pat, combined)
        if m:
            try:
                v = extractor(m)
                if 100000 <= v <= 3000000:
                    price_numeric = v
                    price_text = m.group(0).strip()
                    break
            except (ValueError, IndexError):
                continue

    # Check for "Contact Agent" / "POA" / "Call for price" / "Negotiable"
    contact_agent = bool(re.search(
        r'contact\s+agent|call\s+for\s+price|price\s+on\s+application|POA|negotiable|by\s+negotiation|expressions?\s+of\s+interest|EOI',
        combined, re.IGNORECASE
    ))

    if not price_numeric and contact_agent:
        price_text = "Contact Agent"
        price_numeric = None  # Will be estimated from median in enrichment
    elif not price_numeric:
        return None  # No price info at all — skip

    # Over budget
    if price_numeric and price_numeric > BUDGET:
        return None

    # ── Extract beds/baths/car ──
    beds = baths = car = None

    beds_m = re.search(r'(\d)\s*(?:bed|Bed|BED|bedroom|Bedroom|br\b|b\b)', combined)
    if beds_m:
        beds = int(beds_m.group(1))

    baths_m = re.search(r'(\d)\s*(?:bath|Bath|BATH|bathroom|Bathroom)', combined)
    if baths_m:
        baths = int(baths_m.group(1))

    car_m = re.search(r'(\d)\s*(?:car|Car|CAR|garage|Garage|parking|Parking)', combined)
    if car_m:
        car = int(car_m.group(1))

    # Skip if <3 beds (we know about it) — but allow unknown beds through
    if beds is not None and beds < 3:
        return None

    # ── Extract land size ──
    land_sqm = None
    land_text = None
    for lm in re.finditer(r'(\d{2,5})\s*(?:m²|m2|sqm|square\s*m)', combined, re.IGNORECASE):
        v = int(lm.group(1))
        if 100 <= v <= 5000:
            land_sqm = v
            land_text = f"{v}sqm"
            break

    return {
        'addr': addr,
        'price_text': price_text,
        'price_numeric': price_numeric,
        'contact_agent': contact_agent,
        'beds': beds,
        'baths': baths,
        'car': car,
        'land_text': land_text,
        'land_sqm': land_sqm,
        'url': link,
    }


# ─── Enrich with yield, verdict, cashflow ────────────────────

RED_FLAGS = ['mould', 'mold', 'asbestos', 'termite', 'white ant',
             'sold as is', 'as is where is', 'structural damage',
             'subsidence', 'underpinning', 'fire damage',
             'flood damage', 'flood affected']

VALUE_KWS = ['r40', 'r30', 'r60', 'subdivision', 'granny flat',
             'corner block', 'development potential', 'dual occupancy',
             'subdivide', 'duplex potential']


def enrich_listing(parsed, median, rent3, rent4, suburb_risk):
    """Add yield, cashflow, verdict to a parsed listing."""
    price = parsed['price_numeric']
    beds = parsed['beds']
    land_sqm = parsed['land_sqm']
    contact_agent = parsed['contact_agent']

    # Estimate price for Contact Agent listings using suburb median
    estimated = False
    if not price and contact_agent:
        price = median
        estimated = True

    if not price:
        return None

    # Yield & cashflow
    rent = rent4 if (beds and beds >= 4) else rent3
    if land_sqm and land_sqm >= 700:
        rent += 30

    y = round(rent * 52 / price * 100, 1)
    cf = round(rent - price * 0.062 / 52, 0)

    # Check snippet for red flags / value keywords
    snippet_lower = (parsed.get('_snippet', '') + ' ' + parsed['addr']).lower()
    red = [kw for kw in RED_FLAGS if kw in snippet_lower]
    values = [kw for kw in VALUE_KWS if kw in snippet_lower]

    # Supply risk from suburbs.json
    supply_risk = 'MEDIUM'
    overall_risk = 'MEDIUM'
    if suburb_risk:
        supply_risk = suburb_risk.get('supplyRisk', {}).get('rating', 'MEDIUM')
        overall_risk = suburb_risk.get('overallRisk', 'MEDIUM')

    # Verdict
    if red:
        verdict = 'AVOID'
        reason = f"AVOID — Red flags: {', '.join(red)}."
    else:
        inv_reasons = []
        if land_sqm and land_sqm >= 800:
            inv_reasons.append(f"{land_sqm}sqm mega-block")
        elif land_sqm and land_sqm >= 650:
            inv_reasons.append(f"{land_sqm}sqm large block")
        if values:
            inv_reasons.append(f"Value-add: {', '.join(values)}")
        if price and not estimated and price < median * 0.97:
            inv_reasons.append("Below suburb median")
        if y >= 5.0:
            inv_reasons.append(f"Yield {y}%")

        if len(inv_reasons) >= 1:
            if supply_risk == 'HIGH' or overall_risk == 'HIGH':
                verdict = 'WATCH'
                risk_note = suburb_risk.get('riskNote', '') if suburb_risk else ''
                reason = f"WATCH — Supply risk {supply_risk}. {risk_note}. Signals: {'. '.join(inv_reasons)}"
            else:
                verdict = 'INVESTIGATE'
                reason = f"INVESTIGATE — {'. '.join(inv_reasons[:3])}. ACTION: Call agent, request contract, book B&P."
                if supply_risk == 'MEDIUM':
                    reason = f"⚠ SUPPLY RISK MEDIUM. {reason}"
        else:
            verdict = 'MONITOR'
            reason = "MONITOR — Standard listing. Set price alert."

    va_parts = []
    if land_sqm and land_sqm >= 700:
        va_parts.append(f"{land_sqm}sqm — granny flat/subdivision potential")
    if values:
        va_parts.extend(values)

    price_display = parsed['price_text'] or 'Contact Agent'
    if estimated:
        price_display = f"Contact Agent (est ~${price:,})"

    return {
        'addr': parsed['addr'],
        'price': price_display,
        'priceNumeric': price,
        'priceEstimated': estimated,
        'beds': beds,
        'baths': parsed['baths'],
        'car': parsed['car'],
        'land': parsed['land_text'],
        'dom': None,
        'verdict': verdict,
        'motivation': 'HIGH' if verdict == 'INVESTIGATE' else ('MEDIUM' if verdict == 'WATCH' else 'LOW'),
        'motivationSignal': ', '.join(values) if values else 'None',
        'yieldEst': f"{y}%",
        'cashflowEst': f"${int(cf)}pw",
        'valueAdd': ' · '.join(va_parts) if va_parts else 'Hold for growth',
        'reason': reason,
        'url': parsed['url'],
        'redFlags': red,
    }


# ─── Main ────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Google Custom Search listing scout')
    parser.add_argument('--suburb', help='Scan only this suburb')
    parser.add_argument('--dry-run', action='store_true', help='Print queries without calling API')
    parser.add_argument('--fresh', action='store_true', help='Ignore existing data, rescan everything')
    args = parser.parse_args()

    if not args.dry_run and (not API_KEY or not CSE_ID):
        print("ERROR: Missing API keys. Add to .env:")
        print("  GOOGLE_API_KEY=your-google-api-key")
        print("  GOOGLE_CSE_ID=your-search-engine-id")
        print()
        print("Setup:")
        print("  1. Google Cloud Console → APIs & Services → Enable 'Custom Search API'")
        print("  2. https://programmablesearchengine.google.com/ → Create engine")
        print("     Restrict to: realestate.com.au, domain.com.au, reiwa.com.au")
        print("  3. Copy Search Engine ID → GOOGLE_CSE_ID")
        print("  4. Copy API Key → GOOGLE_API_KEY")
        sys.exit(1)

    # Load suburb risk data
    suburb_risks = {}
    if SUBURBS_FILE.exists():
        with open(SUBURBS_FILE) as f:
            sd = json.load(f)
        for s in sd.get('suburbs', []):
            suburb_risks[s['name'].lower()] = s.get('riskFilter', {})

    # Filter suburbs
    targets = SUBURBS
    if args.suburb:
        targets = [s for s in SUBURBS if s[0].lower() == args.suburb.lower()]
        if not targets:
            print(f"Suburb '{args.suburb}' not in target list. Available:")
            for s in SUBURBS:
                print(f"  {s[0]} ({s[1]})")
            sys.exit(1)

    # Load existing listings to merge
    existing = {}
    if LISTINGS_FILE.exists() and not args.fresh:
        with open(LISTINGS_FILE) as f:
            existing = json.load(f)

    print(f"[SCOUT-GOOGLE] Starting at {datetime.now().strftime('%H:%M')}")
    print(f"[SCOUT-GOOGLE] {len(targets)} suburbs to scan")
    print(f"[SCOUT-GOOGLE] API Key: {'✓' if API_KEY else '✗'}  CSE ID: {'✓' if CSE_ID else '✗'}")
    if args.dry_run:
        print("[SCOUT-GOOGLE] DRY RUN — no API calls\n")
    print()

    total_queries = 0
    total_listings = 0
    total_investigate = 0

    for idx, (name, state, postcode, median, r3, r4) in enumerate(targets):
        key = f"{name} ({state})"

        # Skip if already done via Google (unless --fresh)
        if not args.fresh and key in existing and 'Google Custom Search' in existing[key].get('source', ''):
            print(f"[{state}] {name}... SKIP (already done)")
            continue

        print(f"[{state}] {name} ({postcode})...", end=' ', flush=True)

        if args.dry_run:
            q1 = f'site:realestate.com.au "{name}" "{state}" house for sale'
            q2 = f'site:domain.com.au "{name}" house for sale'
            print(f"\n  Query 1: {q1}\n  Query 2: {q2}")
            continue

        # Search
        results = search_suburb_listings(name, state, postcode, num_pages=2)
        query_count = min(4, 2 + (2 if len(results) >= 10 else 0))  # estimate
        total_queries += query_count

        if not results:
            print("0 results")
            continue

        # Parse each result
        parsed = []
        for item in results:
            p = parse_google_result(item, name, state, postcode, median)
            if p:
                p['_snippet'] = item.get('snippet', '')
                parsed.append(p)

        # Dedupe by address
        seen_addr = set()
        unique = []
        for p in parsed:
            addr_key = re.sub(r'[^a-z0-9]', '', p['addr'].lower())
            if addr_key not in seen_addr:
                seen_addr.add(addr_key)
                unique.append(p)

        # Enrich
        risk = suburb_risks.get(name.lower(), {})
        enriched = []
        for p in unique:
            item = enrich_listing(p, median, r3, r4, risk)
            if item:
                enriched.append(item)

        if not enriched:
            print(f"{len(results)} results → 0 valid listings")
            continue

        inv = sum(1 for i in enriched if i['verdict'] == 'INVESTIGATE')
        mon = sum(1 for i in enriched if i['verdict'] == 'MONITOR')
        watch = sum(1 for i in enriched if i['verdict'] == 'WATCH')
        contact = sum(1 for i in enriched if i.get('priceEstimated'))

        total_listings += len(enriched)
        total_investigate += inv

        print(f"{len(enriched)} listings ({inv} INVESTIGATE, {mon} MONITOR, {watch} WATCH, {contact} Contact Agent)")

        # Sort: INVESTIGATE first, then WATCH, then MONITOR
        enriched.sort(key=lambda x: (
            x['verdict'] != 'INVESTIGATE',
            x['verdict'] != 'WATCH',
            -(x.get('priceNumeric') or 0)
        ))

        # Merge with existing (keep non-Google entries, replace Google ones)
        old_items = existing.get(key, {}).get('items', [])
        non_google = [i for i in old_items if 'Google' not in existing.get(key, {}).get('source', '')]

        # Dedupe old vs new by address
        new_addrs = {re.sub(r'[^a-z0-9]', '', i['addr'].lower()) for i in enriched}
        kept_old = [i for i in non_google if re.sub(r'[^a-z0-9]', '', i['addr'].lower()) not in new_addrs]

        all_items = enriched + kept_old

        existing[key] = {
            'suburb': name,
            'state': state,
            'items': all_items,
            'collected': len(all_items),
            'analysedAt': datetime.now().strftime('%d %b %H:%M'),
            'source': 'Google Custom Search API',
        }

        # Save after each suburb (incremental, won't lose progress)
        with open(LISTINGS_FILE, 'w') as f:
            json.dump(existing, f, indent=2)

        time.sleep(1)

    # ── Summary ──
    cost = total_queries * 0.005  # $5 per 1000 queries = $0.005 per query
    print(f"\n{'='*60}")
    print(f"[SCOUT-GOOGLE] COMPLETE")
    print(f"  Queries used: {total_queries} (~${cost:.3f})")
    print(f"  Listings found: {total_listings}")
    print(f"  INVESTIGATE: {total_investigate}")
    print(f"  Written to: {LISTINGS_FILE}")
    print(f"{'='*60}")

    # Print top picks
    if total_investigate > 0:
        print(f"\nTOP INVESTIGATE PICKS:")
        all_inv = []
        for k, d in existing.items():
            for i in d.get('items', []):
                if i['verdict'] == 'INVESTIGATE':
                    all_inv.append((k, i))
        all_inv.sort(key=lambda x: -(x[1].get('priceNumeric') or 0))
        for j, (sub, item) in enumerate(all_inv[:10], 1):
            est = " (est)" if item.get('priceEstimated') else ""
            print(f"  {j}. {item['addr'][:60]}")
            print(f"     {item['price']}{est} | {item.get('beds','?')}/{item.get('baths','?')}/{item.get('car','?')} | {item.get('land') or '?'}")
            print(f"     {item.get('reason','')[:80]}")


if __name__ == '__main__':
    main()
