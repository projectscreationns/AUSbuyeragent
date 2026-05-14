#!/usr/bin/env python3
"""
AUS Buyer Agent — Serper.dev Listing Scout

Uses Serper.dev (Google Search API) to find real listings across ALL states.
Serper returns Google's actual indexed results — no hallucination.

Cost: $2.50/1000 searches. Free trial = 2,500 searches.
One full run of 17 suburbs = ~70 queries = ~$0.18.

Usage:
  python3 scripts/scout_serper.py                    # scan all suburbs
  python3 scripts/scout_serper.py --suburb Kirwan     # scan one suburb
  python3 scripts/scout_serper.py --dry-run           # test without API calls
  python3 scripts/scout_serper.py --fresh             # ignore existing, rescan all
"""

import re
import json
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
LISTINGS_FILE = ROOT / "public" / "data" / "listings.json"
SUBURBS_FILE = ROOT / "public" / "data" / "suburbs.json"
ENV_FILE = ROOT / ".env"
BUDGET = 800000

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
SERPER_KEY = ENV.get('SERPER_API_KEY')

SUBURBS = [
    # (name, state, postcode, median_house, rent_3bed_wk, rent_4bed_wk)
    ('Kirwan',           'QLD', '4817', 550000, 500, 580),
    ('Condon',           'QLD', '4815', 599000, 500, 580),
    ('Aitkenvale',       'QLD', '4814', 681000, 520, 600),
    ('Kelso',            'QLD', '4815', 580000, 490, 570),
    ('Mount Louisa',     'QLD', '4814', 620000, 510, 590),
    ('Para Hills',       'SA',  '5096', 520000, 480, 560),
    ('Salisbury North',  'SA',  '5108', 615000, 510, 590),
    ('Ingle Farm',       'SA',  '5098', 700000, 520, 600),
    ('Parafield Gardens','SA',  '5107', 650000, 500, 580),
    ('Gawler East',      'SA',  '5118', 720000, 520, 600),
    ('Hampton Park',     'VIC', '3976', 680000, 540, 610),
    ('Cranbourne West',  'VIC', '3977', 695000, 550, 620),
    ('Narre Warren',     'VIC', '3805', 720000, 560, 630),
    ('Baldivis',         'WA',  '6171', 750000, 620, 700),
    ('Wellard',          'WA',  '6170', 710000, 580, 670),
    ('Mandurah',         'WA',  '6210', 575000, 520, 600),
    ('Thornlie',         'WA',  '6108', 680000, 560, 650),
]

RED_FLAGS = ['mould', 'mold', 'asbestos', 'termite', 'white ant',
             'sold as is', 'as is where is', 'structural damage',
             'subsidence', 'underpinning', 'fire damage',
             'flood damage', 'flood affected']

VALUE_KWS = ['r40', 'r30', 'r60', 'subdivision', 'granny flat',
             'corner block', 'development potential', 'dual occupancy',
             'subdivide', 'duplex potential']


def serper_search(query):
    body = json.dumps({'q': query, 'num': 10}).encode()
    req = urllib.request.Request('https://google.serper.dev/search', data=body, headers={
        'X-API-KEY': SERPER_KEY,
        'Content-Type': 'application/json'
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read())
        return data.get('organic', [])
    except urllib.error.HTTPError as e:
        print(f"  API error {e.code}: {e.read().decode()[:200]}")
        return []
    except Exception as e:
        print(f"  Request failed: {e}")
        return []


def extract_listings_from_results(results, suburb_name, state, postcode, median):
    """Parse Serper results to extract individual listings."""
    listings = []
    seen_addrs = set()

    for item in results:
        title = item.get('title', '')
        snippet = item.get('snippet', '')
        link = item.get('link', '')
        combined = f"{title} {snippet}"

        # Skip index/search pages, sold pages, rental pages, stale listings
        lower = combined.lower()
        if any(skip in lower for skip in ['suburb profile', 'market trends', 'median price',
            'recently sold', 'property sold', 'for rent', 'rental', 'property data',
            'statistics', 'how much', 'property market', 'suburb/kirwan', 'house prices',
            'under offer', 'under contract', 'sold', 'withdrawn', 'off market',
            'settlement', 'exchanged', 'auction results',
            'unit for sale', 'apartment for sale', 'villa for sale', 'townhouse for sale']):
            continue

        # Extract individual addresses from snippet
        # Snippets often list: "27 President Street, Kirwan QLD 4817"
        addr_patterns = [
            rf'(\d+[A-Za-z]?\s+[\w\s\']+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Close|Cl|Crescent|Cres|Place|Pl|Way|Lane|Ln|Parade|Pde|Terrace|Tce|Circuit|Cct|Boulevard|Blvd|Grove|Gr|Rise|View|Loop|Turn|Mews|Row)[\w]*)[,\s]*(?:{suburb_name}|{suburb_name.upper()})',
            rf'(\d+[A-Za-z]?\s+[\w\s\']+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Close|Cl|Crescent|Cres|Place|Pl|Way|Lane|Ln|Parade|Pde|Terrace|Tce|Circuit|Cct|Boulevard|Blvd|Grove|Gr|Rise|View|Loop|Turn|Mews|Row)[\w]*)',
        ]

        for pat in addr_patterns:
            for m in re.finditer(pat, combined, re.IGNORECASE):
                addr = m.group(1).strip().rstrip(',').strip()
                if not re.match(r'^\d', addr):
                    continue
                if len(addr) < 10:
                    continue
                if re.search(r'browse|search|listings|multiple|harris', addr, re.I):
                    continue

                addr_key = re.sub(r'[^a-z0-9]', '', addr.lower())
                if addr_key in seen_addrs:
                    continue
                seen_addrs.add(addr_key)

                full_addr = f"{addr}, {suburb_name}, {state} {postcode}"

                # Extract price near this address in snippet
                price_num = None
                price_text = None
                # Look for price patterns in the surrounding text
                context = combined
                price_pats = [
                    (r'\$\s*([\d,]+)', lambda m: int(m.group(1).replace(',', ''))),
                    (r'(?:Offers?\s*(?:over|from|above))\s+\$\s*([\d,]+)', lambda m: int(m.group(1).replace(',', ''))),
                    (r'\$\s*(\d{3,4})\s*[kK]', lambda m: int(m.group(1)) * 1000),
                    (r'\$\s*([\d,]+)\s*[-–]\s*\$\s*([\d,]+)', lambda m: (int(m.group(1).replace(',','')) + int(m.group(2).replace(',',''))) // 2),
                ]
                for ppat, extractor in price_pats:
                    pm = re.search(ppat, context)
                    if pm:
                        try:
                            v = extractor(pm)
                            if 100000 <= v <= 800000:
                                price_num = v
                                price_text = pm.group(0).strip()
                                break
                        except:
                            continue

                contact = bool(re.search(r'contact\s+agent|call\s+for|by\s+negotiation|POA|price\s+on\s+app|expressions?\s+of\s+interest', context, re.I))
                if not price_num and contact:
                    price_text = "Contact Agent"
                elif not price_num:
                    price_text = "Contact Agent"

                # Beds/baths from snippet
                beds = baths = car = None
                beds_m = re.search(r'(\d)\s*(?:bed|Bed|bedroom|br\b)', context)
                baths_m = re.search(r'(\d)\s*(?:bath|Bath|bathroom)', context)
                car_m = re.search(r'(\d)\s*(?:car|Car|garage|Garage|parking)', context)
                if beds_m: beds = int(beds_m.group(1))
                if baths_m: baths = int(baths_m.group(1))
                if car_m: car = int(car_m.group(1))

                # Land
                land_sqm = None
                for lm in re.finditer(r'(\d{2,5})\s*(?:m²|m2|sqm)', context, re.I):
                    v = int(lm.group(1))
                    if 100 <= v <= 5000:
                        land_sqm = v
                        break

                listings.append({
                    'addr': full_addr,
                    'price_text': price_text,
                    'price_numeric': price_num,
                    'beds': beds, 'baths': baths, 'car': car,
                    'land_sqm': land_sqm,
                    'url': link,
                    'snippet': snippet,
                })

        # Also check title for a single listing page
        # e.g. "14 Smith Street, Kirwan, QLD 4817 - House for Sale"
        title_m = re.match(r'^(\d+[A-Za-z]?\s+[\w\s\']+),?\s+' + suburb_name, title, re.I)
        if title_m:
            addr = title_m.group(1).strip()
            addr_key = re.sub(r'[^a-z0-9]', '', addr.lower())
            if addr_key not in seen_addrs and len(addr) >= 10:
                seen_addrs.add(addr_key)
                full_addr = f"{addr}, {suburb_name}, {state} {postcode}"

                price_num = None
                price_text = None
                for ppat, extractor in price_pats:
                    pm = re.search(ppat, snippet)
                    if pm:
                        try:
                            v = extractor(pm)
                            if 100000 <= v <= 800000:
                                price_num = v
                                price_text = pm.group(0).strip()
                                break
                        except:
                            continue
                if not price_num:
                    price_text = "Contact Agent"

                beds = baths = car = land_sqm = None
                beds_m = re.search(r'(\d)\s*(?:bed|Bed|bedroom)', snippet)
                baths_m = re.search(r'(\d)\s*(?:bath|Bath|bathroom)', snippet)
                car_m = re.search(r'(\d)\s*(?:car|Car|garage|Garage)', snippet)
                if beds_m: beds = int(beds_m.group(1))
                if baths_m: baths = int(baths_m.group(1))
                if car_m: car = int(car_m.group(1))
                for lm in re.finditer(r'(\d{2,5})\s*(?:m²|m2|sqm)', snippet, re.I):
                    v = int(lm.group(1))
                    if 100 <= v <= 5000:
                        land_sqm = v
                        break

                listings.append({
                    'addr': full_addr,
                    'price_text': price_text,
                    'price_numeric': price_num,
                    'beds': beds, 'baths': baths, 'car': car,
                    'land_sqm': land_sqm,
                    'url': link,
                    'snippet': snippet,
                })

    return listings


def enrich(parsed, median, rent3, rent4, suburb_risk):
    price = parsed['price_numeric']
    estimated = False
    if not price:
        price = median
        estimated = True

    beds = parsed['beds']
    land_sqm = parsed['land_sqm']

    rent = rent4 if (beds and beds >= 4) else rent3
    if land_sqm and land_sqm >= 700: rent += 30

    y = round(rent * 52 / price * 100, 1)
    cf = round(rent - price * 0.062 / 52, 0)

    snippet_lower = (parsed.get('snippet', '') + ' ' + parsed['addr']).lower()
    red = [kw for kw in RED_FLAGS if kw in snippet_lower]
    values = [kw for kw in VALUE_KWS if kw in snippet_lower]

    supply_risk = 'MEDIUM'
    if suburb_risk:
        supply_risk = suburb_risk.get('supplyRisk', {}).get('rating', 'MEDIUM')
        overall_risk = suburb_risk.get('overallRisk', 'MEDIUM')
    else:
        overall_risk = 'MEDIUM'

    if red:
        verdict = 'AVOID'
        reason = f"AVOID — Red flags: {', '.join(red)}."
    else:
        inv_reasons = []
        if land_sqm and land_sqm >= 800: inv_reasons.append(f"{land_sqm}sqm mega-block")
        elif land_sqm and land_sqm >= 650: inv_reasons.append(f"{land_sqm}sqm large block")
        if values: inv_reasons.append(f"Value-add: {', '.join(values)}")
        if price and not estimated and price < median * 0.97: inv_reasons.append("Below suburb median")
        if y >= 5.0: inv_reasons.append(f"Yield {y}%")

        if len(inv_reasons) >= 1:
            if supply_risk == 'HIGH' or overall_risk == 'HIGH':
                verdict = 'WATCH'
                reason = f"WATCH — Supply risk {supply_risk}. {', '.join(inv_reasons)}"
            else:
                verdict = 'INVESTIGATE'
                reason = f"INVESTIGATE — {'. '.join(inv_reasons[:3])}. ACTION: Call agent, request contract, book B&P."
                if supply_risk == 'MEDIUM':
                    reason = f"⚠ SUPPLY RISK MEDIUM. {reason}"
        else:
            verdict = 'MONITOR'
            reason = "MONITOR — Standard listing. Set price alert."

    va_parts = []
    if land_sqm and land_sqm >= 700: va_parts.append(f"{land_sqm}sqm — granny flat/subdivision potential")
    if values: va_parts.extend(values)

    price_display = parsed['price_text'] or 'Contact Agent'
    if estimated and 'Contact' not in (price_display or ''):
        price_display = f"Contact Agent (est ~${price:,})"

    return {
        'addr': parsed['addr'],
        'price': price_display,
        'priceNumeric': price,
        'priceEstimated': estimated,
        'beds': beds, 'baths': parsed['baths'], 'car': parsed['car'],
        'land': f"{land_sqm}sqm" if land_sqm else None,
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


def scan_suburb(name, state, postcode, median, r3, r4, suburb_risk, dry_run=False):
    """Run multiple Serper searches for a suburb, return enriched listings."""
    queries = [
        f'"{name}" {state} {postcode} house for sale address price bedroom',
        f'site:realestate.com.au "{name}" {state} house for sale',
        f'site:domain.com.au "{name}" {state} {postcode} house for sale',
        f'"{name}" {state} house sale $',
    ]

    all_raw = []
    query_count = 0

    for q in queries:
        if dry_run:
            print(f"    Query: {q}")
            continue
        results = serper_search(q)
        query_count += 1
        all_raw.extend(results)
        time.sleep(0.5)

    if dry_run:
        return [], len(queries)

    parsed = extract_listings_from_results(all_raw, name, state, postcode, median)

    # Dedupe
    seen = set()
    unique = []
    for p in parsed:
        key = re.sub(r'[^a-z0-9]', '', p['addr'].lower())
        if key not in seen:
            seen.add(key)
            unique.append(p)

    enriched = []
    for p in unique:
        item = enrich(p, median, r3, r4, suburb_risk)
        if item:
            enriched.append(item)

    enriched.sort(key=lambda x: (
        x['verdict'] != 'INVESTIGATE',
        x['verdict'] != 'WATCH',
        -(x.get('priceNumeric') or 0)
    ))

    return enriched, query_count


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Serper.dev listing scout')
    parser.add_argument('--suburb', help='Scan only this suburb')
    parser.add_argument('--dry-run', action='store_true', help='Print queries without API calls')
    parser.add_argument('--fresh', action='store_true', help='Ignore existing, rescan all')
    args = parser.parse_args()

    if not args.dry_run and not SERPER_KEY:
        print("ERROR: SERPER_API_KEY not in .env")
        print("  1. Sign up at https://serper.dev (free trial = 2,500 searches)")
        print("  2. Add to .env: SERPER_API_KEY=your-key")
        sys.exit(1)

    suburb_risks = {}
    if SUBURBS_FILE.exists():
        with open(SUBURBS_FILE) as f:
            sd = json.load(f)
        for s in sd.get('suburbs', []):
            suburb_risks[s['name'].lower()] = s.get('riskFilter', {})

    targets = SUBURBS
    if args.suburb:
        targets = [s for s in SUBURBS if s[0].lower() == args.suburb.lower()]
        if not targets:
            print(f"Suburb '{args.suburb}' not found. Available:")
            for s in SUBURBS: print(f"  {s[0]} ({s[1]})")
            sys.exit(1)

    existing = {}
    if LISTINGS_FILE.exists() and not args.fresh:
        with open(LISTINGS_FILE) as f:
            existing = json.load(f)

    print(f"[SCOUT-SERPER] Starting at {datetime.now().strftime('%H:%M')}")
    print(f"[SCOUT-SERPER] {len(targets)} suburbs to scan")
    if args.dry_run:
        print("[SCOUT-SERPER] DRY RUN\n")
    print()

    total_queries = 0
    total_listings = 0
    total_investigate = 0

    for name, state, postcode, median, r3, r4 in targets:
        key = f"{name} ({state})"

        if not args.fresh and key in existing and 'Serper' in existing[key].get('source', ''):
            print(f"[{state}] {name}... SKIP (already done)")
            continue

        print(f"[{state}] {name} ({postcode})...", end=' ', flush=True)

        risk = suburb_risks.get(name.lower(), {})
        enriched, qc = scan_suburb(name, state, postcode, median, r3, r4, risk, args.dry_run)
        total_queries += qc

        if args.dry_run:
            print()
            continue

        if not enriched:
            print("0 listings found")
            continue

        inv = sum(1 for i in enriched if i['verdict'] == 'INVESTIGATE')
        mon = sum(1 for i in enriched if i['verdict'] == 'MONITOR')
        contact = sum(1 for i in enriched if i.get('priceEstimated'))
        total_listings += len(enriched)
        total_investigate += inv

        print(f"{len(enriched)} listings ({inv} INVESTIGATE, {mon} MONITOR, {contact} Contact Agent)")

        # Merge: keep non-Serper entries from existing
        old_items = existing.get(key, {}).get('items', [])
        old_source = existing.get(key, {}).get('source', '')
        non_serper = [i for i in old_items if 'Serper' not in old_source]
        new_addrs = {re.sub(r'[^a-z0-9]', '', i['addr'].lower()) for i in enriched}
        kept = [i for i in non_serper if re.sub(r'[^a-z0-9]', '', i['addr'].lower()) not in new_addrs]

        all_items = enriched + kept

        existing[key] = {
            'suburb': name, 'state': state,
            'items': all_items,
            'collected': len(all_items),
            'analysedAt': datetime.now().strftime('%d %b %H:%M'),
            'source': 'Serper.dev Google Search API',
        }

        with open(LISTINGS_FILE, 'w') as f:
            json.dump(existing, f, indent=2)

        time.sleep(1)

    cost = total_queries * 0.0025
    print(f"\n{'='*60}")
    print(f"[SCOUT-SERPER] COMPLETE")
    print(f"  Queries: {total_queries} (~${cost:.3f})")
    print(f"  Listings: {total_listings}")
    print(f"  INVESTIGATE: {total_investigate}")
    print(f"  Written to: {LISTINGS_FILE}")
    print(f"{'='*60}")

    if total_investigate > 0:
        print(f"\nTOP INVESTIGATE:")
        all_inv = [(k, i) for k, d in existing.items() for i in d.get('items', []) if i['verdict'] == 'INVESTIGATE']
        for j, (sub, item) in enumerate(all_inv[:10], 1):
            est = " (est)" if item.get('priceEstimated') else ""
            print(f"  {j}. {item['addr'][:55]}")
            print(f"     {item['price']}{est} | {item.get('beds','?')}/{item.get('baths','?')}/{item.get('car','?')} | {item.get('land') or '?'}")


if __name__ == '__main__':
    main()
