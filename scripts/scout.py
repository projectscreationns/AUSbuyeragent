#!/usr/bin/env python3
"""
AUS Buyer Agent — Automated Listing Scout (Stage 4)
Reads suburbs.json, scrapes REIWA (WA) + Ray White (QLD/SA/VIC),
applies red flag quality check, writes listings.json.

Usage: python3 scripts/scout.py
"""

import re, json, os, sys, time, subprocess
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
SUBURBS_FILE = ROOT / "public" / "data" / "suburbs.json"
LISTINGS_FILE = ROOT / "public" / "data" / "listings.json"
BUDGET = 800000
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

RED_FLAGS = ['mould', 'mold', 'asbestos', 'termite', 'white ant', 'sold as is', 'as is where is',
             'structural damage', 'subsidence', 'underpinning', 'fire damage', 'flood damage', 'flood affected']
VALUE_KWS = ['r40', 'r30', 'r60', 'subdivision', 'granny flat', 'corner block', 'development potential',
             'dual occupancy', 'subdivide', 'duplex potential']

# ─── State-specific scrapers ───────────────────────────────

REIWA_SUBURBS = {
    'armadale': ('Armadale', 'WA', '6112', 600000, 550, 650),
    'thornlie': ('Thornlie', 'WA', '6108', 680000, 560, 650),
    'maddington': ('Maddington', 'WA', '6109', 610000, 540, 620),
    'kelmscott': ('Kelmscott', 'WA', '6111', 640000, 550, 640),
    'gosnells': ('Gosnells', 'WA', '6110', 620000, 540, 620),
}

RAYWHITE_SITES = {
    'raywhitekirwan': {
        'url': 'https://raywhitekirwan.com.au/properties/for-sale',
        'state': 'QLD', 'target_slugs': ['kirwan', 'mount-louisa', 'condon', 'rasmussen', 'kelso'],
        'medians': {'kirwan': (550000, 500, 580), 'mount-louisa': (580000, 520, 600)},
    },
    'raywhitetownsville': {
        'url': 'https://raywhitetownsville.com.au/properties/residential-for-sale?suburbPostCode=Kirwan+4817',
        'state': 'QLD', 'target_slugs': ['kirwan', 'aitkenvale', 'heatley', 'hermit-park'],
        'medians': {'kirwan': (550000, 500, 580), 'aitkenvale': (580000, 520, 600)},
    },
    'raywhitecranbourne': {
        'url': 'https://raywhitecranbourne.com/properties/residential-for-sale',
        'state': 'VIC', 'target_slugs': ['cranbourne', 'hampton-park', 'botanic-ridge', 'clyde', 'lyndhurst'],
        'medians': {'cranbourne': (695000, 550, 620), 'hampton-park': (680000, 540, 610)},
    },
    'raywhitegawlereast': {
        'url': 'https://raywhitegawlereast.com.au/properties/residential-for-sale',
        'state': 'SA', 'target_slugs': ['gawler', 'angle-vale', 'munno-para', 'evanston', 'andrews-farm'],
        'medians': {'gawler': (637000, 480, 560), 'angle-vale': (720000, 520, 600)},
    },
}

def curl(url, outpath, delay=1.5):
    """Fetch URL with browser User-Agent."""
    subprocess.run(['curl', '-s', '-L', '-A', UA, url, '-o', outpath],
                   capture_output=True, timeout=30)
    time.sleep(delay)
    return os.path.exists(outpath) and os.path.getsize(outpath) > 10000

def extract_reiwa_urls(html, slug):
    urls = set(re.findall(rf'https://reiwa\.com\.au/[\d\w\-]+\-{slug}\-\d+/', html))
    return sorted([u for u in urls if 'https---' not in u])

def extract_raywhite_urls(html, base_url, state, target_slugs):
    pattern = rf'/properties/residential-for-sale/{state.lower()}/([\w\-]+)-(\d{{4}})/(house)/(\d+)'
    matches = re.findall(pattern, html)
    results = []
    for suburb_slug, postcode, ptype, lid in matches:
        if any(t in suburb_slug for t in target_slugs):
            full = f"{base_url}/properties/residential-for-sale/{state.lower()}/{suburb_slug}-{postcode}/{ptype}/{lid}"
            results.append((full, suburb_slug, postcode))
    return list(dict.fromkeys(results))

def parse_listing_page(html):
    """Parse a single listing page for details."""
    if len(html) < 10000:
        return None

    # Strip scripts/styles for text extraction
    clean = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL)
    clean = re.sub(r'<style[^>]*>.*?</style>', '', clean, flags=re.DOTALL)
    text = re.sub(r'<[^>]+>', ' ', clean)
    text = re.sub(r'&[a-z]+;', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()

    # Address from H1
    h1 = re.search(r'<h1[^>]*>([^<]+)</h1>', html)
    addr = h1.group(1).strip() if h1 else None

    # Full address with state/postcode
    full_addr = None
    m = re.search(r'(\d+[A-Za-z]?\s+[\w\s]{3,40}?,?\s+[\w\s]+,\s+(?:WA|SA|QLD|VIC|NSW)\s+\d{4})', text[:3000])
    if m:
        full_addr = m.group(1)
    elif addr:
        sp = re.search(r'(\w+,\s+(?:WA|SA|QLD|VIC|NSW)\s+\d{4})', text[:2000])
        if sp:
            full_addr = f"{addr}, {sp.group(1)}"
        else:
            full_addr = addr

    if not full_addr:
        return None
    if re.match(r'^\d+/', full_addr.strip()):
        return None  # strata

    # Price
    price_text = None
    price_num = None
    title = re.search(r'<title>[^<]*</title>', html)
    title_text = title.group(0) if title else ''
    for pat in [r'\$[\d,]+\s*-\s*\$[\d,]+', r'(?:From|Offers Over|Offers From)\s*\$[\d,]+', r'\$\d{3,4},\d{3}(?!\d)']:
        pm = re.search(pat, text[:5000])
        if pm:
            price_text = pm.group(0)
            nums = re.findall(r'[\d,]+', price_text)
            if nums:
                try:
                    v = int(nums[0].replace(',', ''))
                    if 100000 <= v <= 3000000:
                        price_num = v
                        break
                except:
                    pass

    if price_num and price_num > BUDGET:
        return None

    # Beds/baths/cars
    beds_m = re.search(r'(\d+)\s*Beds?', text)
    baths_m = re.search(r'(\d+)\s*Baths?', text)
    cars_m = re.search(r'(\d+)\s*(?:Cars?|Garage)', text)
    beds = int(beds_m.group(1)) if beds_m else None
    baths = int(baths_m.group(1)) if baths_m else None
    car = int(cars_m.group(1) or 0) if cars_m else None

    if not beds or beds < 3:
        return None

    # Land
    land_sqm = None
    for lm in re.finditer(r'(\d{2,5})\s*(?:m²|m2|sqm|square)', text):
        v = int(lm.group(1))
        if 100 <= v <= 5000:
            land_sqm = v
            break

    # Flags
    low = text.lower()
    red = [kw for kw in RED_FLAGS if kw in low]
    values = [kw for kw in VALUE_KWS if kw in low]

    # URL
    url = None
    cm = re.search(r'<link rel="canonical" href="([^"]+)"', html)
    if cm:
        url = cm.group(1)

    return {
        'addr': full_addr, 'price': price_text or 'Contact Agent', 'priceNumeric': price_num,
        'beds': beds, 'baths': baths, 'car': car,
        'land': f"{land_sqm}sqm" if land_sqm else None, 'land_sqm': land_sqm,
        'red_flags': red, 'value_adds': values, 'url': url
    }

def build_verdict(listing, median, rent3, rent4, suburb_risk):
    """Apply verdict logic with risk filter."""
    price = listing['priceNumeric']
    beds = listing['beds']
    land = listing['land_sqm']
    red = listing['red_flags']
    values = listing['value_adds']

    # Yield/cashflow
    rent = rent4 if beds >= 4 else rent3
    if land and land >= 700: rent += 30
    y = round(rent * 52 / price * 100, 1) if price else None
    cf = round(rent - price * 0.062 / 52, 0) if price else None

    # Verdict
    if red:
        verdict = 'AVOID'
        reason = f"AVOID — Red flags: {', '.join(red)}."
    else:
        inv_reasons = []
        if land and land >= 800: inv_reasons.append(f"{land}sqm mega-block")
        elif land and land >= 650: inv_reasons.append(f"{land}sqm large block")
        if values: inv_reasons.append(f"Value-add: {','.join(values)}")
        if price and price < median * 0.97: inv_reasons.append("Below suburb median")
        if y and y >= 5.0: inv_reasons.append(f"Yield {y}%")

        # Check supply risk
        supply_risk = suburb_risk.get('supplyRisk', {}).get('rating', 'MEDIUM') if suburb_risk else 'MEDIUM'
        overall_risk = suburb_risk.get('overallRisk', 'MEDIUM') if suburb_risk else 'MEDIUM'

        if len(inv_reasons) >= 1 and (land and land >= 650):
            if supply_risk == 'HIGH' or overall_risk == 'HIGH':
                verdict = 'WATCH'
                reason = f"⚠ DOWNGRADED: Supply risk {supply_risk}. {suburb_risk.get('riskNote','')}. Original: {'. '.join(inv_reasons)}"
            else:
                verdict = 'INVESTIGATE'
                reason = f"INVESTIGATE — {'. '.join(inv_reasons[:3])}. ACTION: Call agent, request contract, book B&P."
                if supply_risk == 'MEDIUM':
                    reason = f"⚠ SUPPLY RISK MEDIUM. {reason}"
        else:
            verdict = 'MONITOR'
            reason = "MONITOR — Standard listing. Set price alert."

    va_parts = []
    if land and land >= 700: va_parts.append(f"{land}sqm → granny flat/subdivision")
    if values: va_parts.extend(values)

    return {
        'addr': listing['addr'], 'price': listing['price'], 'priceNumeric': price,
        'beds': beds, 'baths': listing['baths'], 'car': listing['car'],
        'land': listing['land'], 'dom': None,
        'verdict': verdict, 'motivation': 'HIGH' if verdict == 'INVESTIGATE' else 'LOW',
        'motivationSignal': ', '.join(values) if values else 'No signals',
        'yieldEst': f"{y}%" if y else 'N/A',
        'cashflowEst': f"${int(cf)}pw" if cf else 'N/A',
        'valueAdd': ' · '.join(va_parts) if va_parts else 'Hold for growth',
        'reason': reason, 'url': listing['url']
    }

# ─── Main ──────────────────────────────────────────────────

def main():
    print(f"[SCOUT] Starting at {datetime.now().strftime('%Y-%m-%d %H:%M')}")

    # Load risk data
    suburb_risks = {}
    if SUBURBS_FILE.exists():
        with open(SUBURBS_FILE) as f:
            sd = json.load(f)
        for s in sd.get('suburbs', []):
            suburb_risks[s['name'].lower()] = s.get('riskFilter', {})

    tmpdir = Path('/tmp/scout_' + datetime.now().strftime('%H%M%S'))
    tmpdir.mkdir(exist_ok=True)

    output = {}

    # ── WA via REIWA ──
    print("\n[SCOUT] Scanning WA suburbs via REIWA...")
    for slug, (name, state, pc, median, r3, r4) in REIWA_SUBURBS.items():
        print(f"  Fetching {name}...", end=' ', flush=True)
        list_page = tmpdir / f"wa_{slug}.html"
        if not curl(f"https://reiwa.com.au/for-sale/{slug}/houses/", str(list_page)):
            print("FAILED (rate limited)")
            continue

        with open(list_page) as f:
            html = f.read()
        urls = extract_reiwa_urls(html, slug)
        print(f"{len(urls)} listings found.", flush=True)

        items = []
        for i, url in enumerate(urls[:15]):
            detail_page = tmpdir / f"wa_{slug}_{i}.html"
            if curl(url, str(detail_page), delay=1):
                with open(detail_page) as f:
                    detail_html = f.read()
                parsed = parse_listing_page(detail_html)
                if parsed:
                    risk = suburb_risks.get(name.lower(), {})
                    item = build_verdict(parsed, median, r3, r4, risk)
                    items.append(item)

        if items:
            items.sort(key=lambda x: (x['verdict'] == 'AVOID', x['verdict'] != 'INVESTIGATE'))
            output[name] = {
                'suburb': name, 'state': 'WA', 'items': items,
                'collected': len(urls), 'analysedAt': datetime.now().strftime('%d %b %H:%M'),
                'source': 'REIWA.com.au — automated scout'
            }
            inv = sum(1 for i in items if i['verdict'] == 'INVESTIGATE')
            print(f"  {name}: {len(items)} kept ({inv} INVESTIGATE)")

    # ── QLD/SA/VIC via Ray White ──
    for site_name, config in RAYWHITE_SITES.items():
        state = config['state']
        print(f"\n[SCOUT] Scanning {state} via {site_name}...")
        list_page = tmpdir / f"{site_name}.html"
        base_url = config['url'].split('/properties')[0]

        if not curl(config['url'], str(list_page)):
            print("  FAILED (rate limited)")
            continue

        with open(list_page) as f:
            html = f.read()
        listing_urls = extract_raywhite_urls(html, base_url, state, config['target_slugs'])
        print(f"  {len(listing_urls)} house listings found.", flush=True)

        suburb_items = {}
        for url, sub_slug, pc in listing_urls[:20]:
            detail_page = tmpdir / f"{site_name}_{sub_slug}_{pc}.html"
            if curl(url, str(detail_page), delay=1):
                with open(detail_page) as f:
                    detail_html = f.read()
                parsed = parse_listing_page(detail_html)
                if parsed:
                    # Get median for this suburb
                    medians = config.get('medians', {})
                    base_sub = sub_slug.split('-')[0]
                    med_info = medians.get(sub_slug, medians.get(base_sub, (650000, 520, 600)))
                    median, r3, r4 = med_info

                    risk = suburb_risks.get(sub_slug.replace('-', ' '), {})
                    item = build_verdict(parsed, median, r3, r4, risk)

                    suburb_name = sub_slug.replace('-', ' ').title()
                    key = f"{suburb_name} ({state})"
                    if key not in suburb_items:
                        suburb_items[key] = []
                    suburb_items[key].append(item)

        for key, items in suburb_items.items():
            items.sort(key=lambda x: (x['verdict'] == 'AVOID', x['verdict'] != 'INVESTIGATE'))
            suburb_name = key.split(' (')[0]
            output[key] = {
                'suburb': suburb_name, 'state': state, 'items': items,
                'collected': len(items), 'analysedAt': datetime.now().strftime('%d %b %H:%M'),
                'source': f'{site_name} — automated scout'
            }
            inv = sum(1 for i in items if i['verdict'] == 'INVESTIGATE')
            print(f"  {key}: {len(items)} kept ({inv} INVESTIGATE)")

    # ── Write output ──
    with open(LISTINGS_FILE, 'w') as f:
        json.dump(output, f, indent=2)

    # ── Summary ──
    total = sum(len(d['items']) for d in output.values())
    inv = sum(1 for d in output.values() for i in d['items'] if i['verdict'] == 'INVESTIGATE')
    mon = sum(1 for d in output.values() for i in d['items'] if i['verdict'] == 'MONITOR')
    watch = sum(1 for d in output.values() for i in d['items'] if i['verdict'] == 'WATCH')
    avoid = sum(1 for d in output.values() for i in d['items'] if i['verdict'] == 'AVOID')

    print(f"\n{'='*60}")
    print(f"[SCOUT] COMPLETE — {total} listings across {len(output)} suburbs")
    print(f"  {inv} INVESTIGATE / {watch} WATCH / {mon} MONITOR / {avoid} AVOID")
    print(f"  Written to {LISTINGS_FILE}")
    print(f"{'='*60}")

    # Print top INVESTIGATE
    if inv > 0:
        print("\n🏆 TOP INVESTIGATE PICKS:")
        all_inv = [(k, i) for k, d in output.items() for i in d['items'] if i['verdict'] == 'INVESTIGATE']
        for j, (sub, item) in enumerate(all_inv[:10], 1):
            print(f"  {j}. {item['addr'][:60]}")
            print(f"     {item['price']} | {item['beds']}/{item['baths']}/{item['car']} | {item['land'] or '?'}")
            print(f"     {item['valueAdd']}")

if __name__ == '__main__':
    main()
