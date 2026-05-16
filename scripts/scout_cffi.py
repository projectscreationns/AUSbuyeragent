"""
AUS Buyer Agent — curl_cffi Listing Scout (Adelaide Metro)

Uses curl_cffi to spoof Chrome TLS fingerprint, bypassing anti-bot detection
without needing a real browser. Faster and lighter than Playwright.

Setup (one time):
  pip install curl_cffi

Usage:
  python scripts/scout_cffi.py                          # scan all Adelaide suburbs
  python scripts/scout_cffi.py --suburb "Para Hills"    # scan one suburb
"""

import re
import json
import sys
import time
from pathlib import Path
from datetime import datetime

try:
    from curl_cffi import requests
except ImportError:
    print("ERROR: curl_cffi not installed. Run: pip install curl_cffi")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
LISTINGS_FILE = ROOT / "public" / "data" / "listings.json"
BUDGET = 800000

SUBURBS = [
    ('Para Hills', '5096', 750000, 555, 610),
    ('Para Hills West', '5096', 720000, 545, 600),
    ('Ingle Farm', '5098', 780000, 570, 630),
    ('Salisbury', '5108', 722000, 545, 600),
    ('Salisbury East', '5109', 700000, 540, 595),
    ('Parafield Gardens', '5107', 780000, 570, 630),
    ('Gepps Cross', '5094', 680000, 530, 590),
    ('Pooraka', '5095', 720000, 550, 610),
    ('Greenacres', '5086', 760000, 560, 620),
    ('Clearview', '5085', 740000, 555, 615),
    ('Enfield', '5085', 770000, 565, 625),
    ('Modbury', '5092', 720000, 540, 600),
    ('Modbury North', '5092', 690000, 530, 590),
    ('Valley View', '5093', 700000, 540, 600),
    ('Walkley Heights', '5098', 740000, 550, 610),
]

STREET_RE = re.compile(r'(Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Close|Cl|Crescent|Cres|Place|Pl|Way|Lane|Ln|Parade|Pde|Terrace|Tce|Circuit|Cct|Boulevard|Blvd|Grove|Rise|View|Loop|Turn|Mews|Row)', re.I)
STALE_RE = re.compile(r'under offer|under contract|\bsold\b|withdrawn|off market|settlement|exchanged', re.I)
RED_FLAGS = ['mould','mold','asbestos','termite','white ant','sold as is','structural damage','subsidence','fire damage','flood damage']
VALUE_KWS = ['r40','r30','r60','subdivision','granny flat','corner block','development potential','dual occupancy','subdivide']


def fetch_rea(name, postcode, page_num=1):
    slug = name.lower().replace(' ', '+')
    url = f"https://www.realestate.com.au/buy/property-house-in-{slug},+sa+{postcode}/list-{page_num}"
    try:
        resp = requests.get(url, impersonate="chrome", timeout=30, headers={
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-AU,en;q=0.9",
            "Cache-Control": "no-cache",
        })
        return resp.status_code, resp.text
    except Exception as e:
        return 0, str(e)


def fetch_domain(name, postcode, page_num=1):
    slug = name.lower().replace(' ', '-')
    url = f"https://www.domain.com.au/sale/{slug}-sa-{postcode}/?ptype=house&price=0-{BUDGET}&page={page_num}"
    try:
        resp = requests.get(url, impersonate="chrome", timeout=30, headers={
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-AU,en;q=0.9",
        })
        return resp.status_code, resp.text
    except Exception as e:
        return 0, str(e)


def parse_listings(html, name, postcode):
    listings = []
    seen = set()

    if len(html) < 5000:
        return listings

    # Extract addresses with context
    for m in re.finditer(r'(\d+[A-Za-z]?\s+[\w\s\']+?(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Close|Cl|Crescent|Cres|Place|Pl|Way|Lane|Ln|Parade|Pde|Terrace|Tce|Circuit|Cct|Boulevard|Blvd|Grove|Rise|View|Loop|Turn|Mews|Row)\w*)', html, re.I):
        addr = m.group(1).strip()
        if len(addr) < 10 or not re.match(r'^\d', addr):
            continue
        if re.search(r'browse|search|listings|properties for', addr, re.I):
            continue
        if re.match(r'^\d+\s+(bed|bath|car|with|properties|results|listing|bedroom)', addr, re.I):
            continue

        key = re.sub(r'[^a-z0-9]', '', addr.lower())
        if key in seen:
            continue
        seen.add(key)

        # Get context around the address for price/specs
        start = max(0, m.start() - 500)
        end = min(len(html), m.end() + 500)
        context = html[start:end]

        # Price
        price_num = None
        price_text = 'Contact Agent'
        for pm in re.finditer(r'\$\s*([\d,]+)', context):
            v = int(pm.group(1).replace(',', ''))
            if 200000 <= v <= BUDGET:
                price_num = v
                price_text = f"${pm.group(1)}"
                break

        # Skip over budget
        if price_num and price_num > BUDGET:
            continue

        # Beds/baths/car
        beds = baths = car = None
        bm = re.search(r'(\d)\s*(?:bed|Bed|bedroom)', context)
        if bm: beds = int(bm.group(1))
        bam = re.search(r'(\d)\s*(?:bath|Bath|bathroom)', context)
        if bam: baths = int(bam.group(1))
        cm = re.search(r'(\d)\s*(?:car|Car|garage|Garage|parking)', context)
        if cm: car = int(cm.group(1))

        # Skip < 3 bed
        if beds is not None and beds < 3:
            continue

        # Skip stale
        if STALE_RE.search(context):
            continue

        # Land
        land_sqm = None
        lm = re.search(r'(\d{2,5})\s*(?:m²|m2|sqm)', context, re.I)
        if lm:
            v = int(lm.group(1))
            if 100 <= v <= 5000:
                land_sqm = v

        # Skip tiny land (units)
        if land_sqm and land_sqm < 200:
            continue

        full_addr = f"{addr}, {name}, SA {postcode}"

        listings.append({
            'addr': full_addr,
            'price_text': price_text,
            'price_num': price_num,
            'beds': beds, 'baths': baths, 'car': car,
            'land_sqm': land_sqm,
        })

    return listings


def enrich(p, median, r3, r4):
    price = p['price_num'] or median
    estimated = p['price_num'] is None
    beds = p['beds']
    land = p['land_sqm'] or 0
    rent = r4 if (beds and beds >= 4) else r3
    if land >= 700: rent += 30

    y = round(rent * 52 / price * 100, 1)
    cf = round(rent - price * 0.062 / 52)

    combined = p['addr'].lower()
    red = [kw for kw in RED_FLAGS if kw in combined]
    vals = [kw for kw in VALUE_KWS if kw in combined]

    if red:
        verdict = 'AVOID'
        reason = f"AVOID — {', '.join(red)}"
    else:
        inv = []
        if land >= 800: inv.append(f"{land}sqm mega-block")
        elif land >= 650: inv.append(f"{land}sqm large block")
        if vals: inv.append(f"Value-add: {', '.join(vals)}")
        if price and not estimated and price < median * 0.97: inv.append("Below median")
        if y >= 5.0: inv.append(f"Yield {y}%")
        if len(inv) >= 1:
            verdict = 'INVESTIGATE'
            reason = f"INVESTIGATE — {'. '.join(inv[:3])}. ACTION: Call agent."
        else:
            verdict = 'MONITOR'
            reason = "MONITOR — Standard listing."

    va = []
    if land >= 700: va.append(f"{land}sqm — subdivision potential")
    va.extend(vals)

    return {
        'addr': p['addr'],
        'price': f"Contact Agent (est ~${price:,})" if estimated else (p['price_text'] or 'Contact Agent'),
        'priceNumeric': price, 'priceEstimated': estimated,
        'beds': beds, 'baths': p['baths'], 'car': p['car'],
        'land': f"{land}sqm" if land else None, 'dom': None,
        'verdict': verdict, 'motivation': 'HIGH' if verdict == 'INVESTIGATE' else 'LOW',
        'motivationSignal': ', '.join(vals) if vals else 'None',
        'yieldEst': f"{y}%", 'cashflowEst': f"${cf}pw",
        'valueAdd': ' · '.join(va) if va else 'Hold for growth',
        'reason': reason, 'url': '', 'redFlags': red,
    }


def scan_suburb(name, postcode, median, r3, r4):
    all_listings = []
    seen_addrs = set()

    # Try REA first — paginate
    blocked = False
    for page in range(1, 10):
        status, html = fetch_rea(name, postcode, page)
        if status != 200 or len(html) < 5000:
            if page == 1:
                print(f"  REA: {status} ({len(html)} bytes)", end='')
                blocked = True
            break

        parsed = parse_listings(html, name, postcode)
        new = 0
        for p in parsed:
            key = re.sub(r'[^a-z0-9]', '', p['addr'].lower())
            if key not in seen_addrs:
                seen_addrs.add(key)
                all_listings.append(p)
                new += 1

        if page == 1:
            print(f"  REA: {len(parsed)} on page 1", end='')
        if new == 0 and page > 1:
            break
        time.sleep(2 + 1 * page)

    # Try Domain too
    for page in range(1, 6):
        status, html = fetch_domain(name, postcode, page)
        if status != 200 or len(html) < 5000:
            if page == 1:
                print(f" | Domain: {status} ({len(html)} bytes)", end='')
            break

        parsed = parse_listings(html, name, postcode)
        new = 0
        for p in parsed:
            key = re.sub(r'[^a-z0-9]', '', p['addr'].lower())
            if key not in seen_addrs:
                seen_addrs.add(key)
                all_listings.append(p)
                new += 1

        if page == 1:
            print(f" | Domain: +{new} new", end='')
        if new == 0 and page > 1:
            break
        time.sleep(2 + 1 * page)

    # Enrich
    enriched = [enrich(p, median, r3, r4) for p in all_listings]
    enriched = [e for e in enriched if STREET_RE.search(e['addr'])]
    enriched.sort(key=lambda x: (x['verdict'] != 'INVESTIGATE', -(x.get('priceNumeric') or 0)))

    return enriched


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--suburb', help='Scan one suburb')
    args = parser.parse_args()

    targets = SUBURBS
    if args.suburb:
        targets = [s for s in SUBURBS if s[0].lower() == args.suburb.lower()]
        if not targets:
            print(f"Suburb '{args.suburb}' not found. Available:")
            for s in SUBURBS: print(f"  {s[0]}")
            sys.exit(1)

    existing = json.load(open(LISTINGS_FILE)) if LISTINGS_FILE.exists() else {}

    print(f"[SCOUT-CFFI] Adelaide Metro — {len(targets)} suburbs")
    print(f"[SCOUT-CFFI] TLS fingerprint: Chrome (curl_cffi)")
    print(f"[SCOUT-CFFI] Started {datetime.now().strftime('%H:%M')}\n")

    total = 0
    total_inv = 0

    for name, pc, median, r3, r4 in targets:
        key = f"{name} (SA)"
        print(f"[SA] {name} ({pc})...", end='', flush=True)

        enriched = scan_suburb(name, pc, median, r3, r4)
        inv = sum(1 for e in enriched if e['verdict'] == 'INVESTIGATE')
        total += len(enriched)
        total_inv += inv

        print(f" → {len(enriched)} listings ({inv} INVESTIGATE)")

        if enriched:
            existing[key] = {
                'suburb': name, 'state': 'SA', 'items': enriched,
                'collected': len(enriched),
                'analysedAt': datetime.now().strftime('%d %b %H:%M'),
                'source': 'curl_cffi TLS fingerprint scrape',
            }
            json.dump(existing, open(LISTINGS_FILE, 'w'), indent=2)

        time.sleep(3)

    print(f"\n{'=' * 60}")
    print(f"[SCOUT-CFFI] COMPLETE")
    print(f"  Listings: {total}")
    print(f"  INVESTIGATE: {total_inv}")
    print(f"  Written to: {LISTINGS_FILE}")
    print(f"{'=' * 60}")


if __name__ == '__main__':
    main()
