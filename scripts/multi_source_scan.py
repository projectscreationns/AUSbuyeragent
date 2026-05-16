"""
AUS Buyer Agent — Multi-Source Adelaide Scanner

Stacks multiple free APIs for maximum coverage:
  1. Domain API (official, structured JSON — best source)
  2. Browserless.io Unblock API (residential proxy, renders JS)
  3. Serper.dev (Google search snippets)

Setup:
  pip install curl_cffi
  Copy your keys into .env (or edit the KEY variables below)

Usage:
  python scripts/multi_source_scan.py                    # scan all suburbs
  python scripts/multi_source_scan.py --suburb "Para Hills"  # one suburb
"""

import json, re, sys, time, os, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
LISTINGS_FILE = ROOT / "public" / "data" / "listings.json"
ENV_FILE = ROOT / ".env"
BUDGET = 800000

# Load keys from .env
def load_env():
    keys = {}
    if ENV_FILE.exists():
        for line in open(ENV_FILE):
            if '=' in line and not line.startswith('#'):
                k, v = line.strip().split('=', 1)
                keys[k.strip()] = v.strip()
    return keys

ENV = load_env()
DOMAIN_KEY = ENV.get('DOMAIN_API_KEY', '')
BROWSERLESS_KEY = ENV.get('BROWSERLESS_API_KEY', '2UWaZVJnDLV8cGj4ad54238b0803883909021b22fdf818878')
SERPER_KEY = ENV.get('SERPER_API_KEY', '')

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

RED_FLAGS = ['mould','mold','asbestos','termite','white ant','sold as is','structural damage','subsidence','fire damage','flood damage']
VALUE_KWS = ['r40','r30','r60','subdivision','granny flat','corner block','development potential','dual occupancy','subdivide']
STREET_RE = re.compile(r'(Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Close|Cl|Crescent|Cres|Place|Pl|Way|Lane|Ln|Parade|Pde|Terrace|Tce|Circuit|Cct|Boulevard|Blvd|Grove|Rise|View|Loop|Turn|Mews|Row)', re.I)

# ── Source 1: Domain API ─────────────────────────────────────────────

def domain_api_search(suburb, postcode):
    if not DOMAIN_KEY:
        return []
    body = json.dumps({
        "listingType": "Sale",
        "propertyTypes": ["House"],
        "locations": [{"suburb": suburb, "state": "SA", "postCode": postcode}],
        "minPrice": 300000,
        "maxPrice": BUDGET,
        "pageSize": 100,
    }).encode()
    req = urllib.request.Request(
        "https://api.domain.com.au/v1/listings/residential/_search",
        data=body,
        headers={"X-Api-Key": DOMAIN_KEY, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        if not isinstance(data, list):
            return []
        listings = []
        for item in data:
            listing = item.get("listing", {})
            props = listing.get("propertyDetails", {})
            price_info = listing.get("priceDetails", {})
            addr_parts = props.get("displayableAddress", "")
            if not addr_parts:
                street = props.get("streetNumber", "")
                if street:
                    addr_parts = f"{street} {props.get('street', '')}"
            price_text = price_info.get("displayPrice", "Contact Agent")
            price_num = price_info.get("price")
            if not price_num:
                for pm in re.finditer(r'\$([\d,]+)', price_text):
                    v = int(pm.group(1).replace(',', ''))
                    if 200000 <= v <= BUDGET:
                        price_num = v
                        break
            seo = listing.get("seoUrl", "")
            url = f"https://www.domain.com.au/{seo}" if seo else ""
            listings.append({
                "addr": f"{addr_parts}, {suburb}, SA {postcode}" if suburb.lower() not in addr_parts.lower() else addr_parts,
                "price": price_text,
                "priceNumeric": price_num,
                "beds": props.get("bedrooms"),
                "baths": props.get("bathrooms"),
                "car": props.get("carspaces"),
                "land": f"{props.get('landArea')}sqm" if props.get("landArea") else None,
                "landSqm": props.get("landArea", 0) or 0,
                "url": url,
                "source": "Domain API",
            })
        return listings
    except Exception as e:
        return []

# ── Source 2: Browserless Unblock API ─────────────────────────────────

def browserless_search(suburb, postcode):
    if not BROWSERLESS_KEY:
        return []
    slug = suburb.lower().replace(' ', '+')
    url = f"https://www.realestate.com.au/buy/property-house+between-0-{BUDGET}-in-{slug},+sa+{postcode}/list-1"
    body = json.dumps({
        "url": url, "content": True, "cookies": False, "screenshot": False,
        "waitForSelector": {"selector": "article", "timeout": 15000},
    }).encode()
    req = urllib.request.Request(
        f"https://production-sfo.browserless.io/unblock?token={BROWSERLESS_KEY}&proxy=residential",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            html = json.loads(resp.read()).get("content", "")
    except Exception:
        return []
    if len(html) < 10000:
        return []
    listings = []
    seen = set()
    addrs = re.findall(r'"streetAddress"\s*:\s*"([^"]+)"', html)
    urls = re.findall(r'"(https://www\.realestate\.com\.au/property-[^"]+)"', html)
    for addr in addrs:
        if len(addr) < 8 or not re.match(r'^\d', addr):
            continue
        key = re.sub(r'[^a-z0-9]', '', addr.lower())
        if key in seen:
            continue
        seen.add(key)
        url_match = ""
        slug_part = addr.lower().replace(' ', '-')[:15]
        for u in urls:
            if any(p in u.lower() for p in slug_part.split('-')[:2]):
                url_match = u
                break
        listings.append({
            "addr": f"{addr}, {suburb}, SA {postcode}",
            "price": "See REA listing",
            "priceNumeric": None,
            "beds": None, "baths": None, "car": None,
            "land": None, "landSqm": 0,
            "url": url_match,
            "source": "Browserless/REA",
        })
    return listings

# ── Source 3: Serper Google Search ────────────────────────────────────

def serper_search(suburb, postcode):
    if not SERPER_KEY:
        return []
    queries = [
        f'site:realestate.com.au "{suburb}" SA house for sale',
        f'site:domain.com.au "{suburb}" SA {postcode} house for sale',
        f'"{suburb}" SA {postcode} house sale $ bedroom',
        f'"{suburb}" SA house for sale under $800000 address',
    ]
    all_results = []
    for q in queries:
        body = json.dumps({"q": q, "num": 10, "gl": "au"}).encode()
        req = urllib.request.Request(
            "https://google.serper.dev/search",
            data=body,
            headers={"X-API-KEY": SERPER_KEY, "Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                all_results.extend(json.loads(resp.read()).get("organic", []))
        except Exception:
            pass
        time.sleep(0.3)
    listings = []
    seen = set()
    for item in all_results:
        combined = f"{item.get('title', '')} {item.get('snippet', '')}"
        link = item.get("link", "")
        for m in re.finditer(r'(\d+[A-Za-z]?\s+[\w\s\']+?(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Close|Cl|Crescent|Cres|Place|Pl|Way|Lane|Ln|Parade|Pde|Terrace|Tce|Circuit|Cct|Boulevard|Blvd|Grove|Rise|View|Loop|Turn|Mews|Row)\w*)', combined, re.I):
            addr = m.group(1).strip()
            if len(addr) < 10 or not re.match(r'^\d', addr):
                continue
            key = re.sub(r'[^a-z0-9]', '', addr.lower())
            if key in seen:
                continue
            seen.add(key)
            price_num = None
            price_text = "Contact Agent"
            for pm in re.finditer(r'\$([\d,]+)', combined):
                v = int(pm.group(1).replace(',', ''))
                if 200000 <= v <= BUDGET:
                    price_num = v
                    price_text = f"${pm.group(1)}"
                    break
            beds = baths = car = land_sqm = None
            bm = re.search(r'(\d)\s*(?:bed|Bed)', combined)
            if bm: beds = int(bm.group(1))
            bam = re.search(r'(\d)\s*(?:bath|Bath)', combined)
            if bam: baths = int(bam.group(1))
            lm = re.search(r'(\d{2,5})\s*(?:m²|m2|sqm)', combined, re.I)
            if lm:
                v = int(lm.group(1))
                if 100 <= v <= 5000: land_sqm = v
            listings.append({
                "addr": f"{addr}, {suburb}, SA {postcode}",
                "price": price_text, "priceNumeric": price_num,
                "beds": beds, "baths": baths, "car": car,
                "land": f"{land_sqm}sqm" if land_sqm else None,
                "landSqm": land_sqm or 0,
                "url": link, "source": "Serper/Google",
            })
    return listings

# ── Enrich + Merge ────────────────────────────────────────────────────

def enrich(p, median, r3, r4):
    price = p["priceNumeric"] or median
    estimated = p["priceNumeric"] is None
    beds = p["beds"]
    land = p.get("landSqm", 0)
    rent = r4 if (beds and beds >= 4) else r3
    if land >= 700: rent += 30
    y = round(rent * 52 / price * 100, 1)
    cf = round(rent - price * 0.062 / 52)
    combined = p["addr"].lower()
    red = [kw for kw in RED_FLAGS if kw in combined]
    vals = [kw for kw in VALUE_KWS if kw in combined]
    inv = []
    if land >= 800: inv.append(f"{land}sqm mega-block")
    elif land >= 650: inv.append(f"{land}sqm large block")
    if vals: inv.append(f"Value-add: {', '.join(vals)}")
    if price and not estimated and price < median * 0.97: inv.append("Below median")
    if y >= 5.0: inv.append(f"Yield {y}%")
    if red:
        verdict = "AVOID"
        reason = f"AVOID — {', '.join(red)}"
    elif inv:
        verdict = "INVESTIGATE"
        reason = f"INVESTIGATE — {'. '.join(inv[:3])}. ACTION: Call agent."
    else:
        verdict = "MONITOR"
        reason = "MONITOR — Standard listing."
    return {
        "addr": p["addr"],
        "price": f"Contact Agent (est ~${price:,})" if estimated else (p["price"] or "Contact Agent"),
        "priceNumeric": price, "priceEstimated": estimated,
        "beds": beds, "baths": p["baths"], "car": p["car"],
        "land": p.get("land"), "dom": None,
        "verdict": verdict, "motivation": "HIGH" if verdict == "INVESTIGATE" else "LOW",
        "motivationSignal": ", ".join(vals) if vals else "None",
        "yieldEst": f"{y}%", "cashflowEst": f"${cf}pw",
        "valueAdd": " · ".join([f"{land}sqm" if land >= 700 else ""] + vals).strip(" · ") or "Hold for growth",
        "reason": reason,
        "url": p.get("url", ""),
        "redFlags": red,
        "source": p.get("source", ""),
    }

def merge_listings(all_raw, suburb, postcode):
    seen = {}
    for item in all_raw:
        addr = item["addr"]
        key = re.sub(r'[^a-z0-9]', '', addr.lower())
        if key in seen:
            existing = seen[key]
            if not existing.get("priceNumeric") and item.get("priceNumeric"):
                existing["priceNumeric"] = item["priceNumeric"]
                existing["price"] = item["price"]
            if not existing.get("beds") and item.get("beds"):
                existing["beds"] = item["beds"]
                existing["baths"] = item.get("baths")
                existing["car"] = item.get("car")
            if not existing.get("landSqm") and item.get("landSqm"):
                existing["landSqm"] = item["landSqm"]
                existing["land"] = item.get("land")
            if not existing.get("url") and item.get("url"):
                existing["url"] = item["url"]
            existing["source"] = f"{existing['source']} + {item['source']}"
        else:
            seen[key] = item
    return list(seen.values())

# ── Main ──────────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--suburb", help="Scan one suburb")
    args = parser.parse_args()

    targets = SUBURBS
    if args.suburb:
        targets = [s for s in SUBURBS if s[0].lower() == args.suburb.lower()]
        if not targets:
            print(f"Unknown suburb. Available: {', '.join(s[0] for s in SUBURBS)}")
            sys.exit(1)

    existing = json.load(open(LISTINGS_FILE)) if LISTINGS_FILE.exists() else {}

    sources = []
    if DOMAIN_KEY: sources.append("Domain API")
    if BROWSERLESS_KEY: sources.append("Browserless")
    if SERPER_KEY: sources.append("Serper")

    print(f"╔{'═'*56}╗")
    print(f"║  MULTI-SOURCE ADELAIDE SCANNER                         ║")
    print(f"║  Sources: {', '.join(sources):44s} ║")
    print(f"║  Suburbs: {len(targets):44d} ║")
    print(f"╚{'═'*56}╝\n")

    total = 0
    total_inv = 0

    for name, pc, median, r3, r4 in targets:
        key = f"{name} (SA)"
        print(f"[SA] {name} ({pc})", flush=True)

        all_raw = []

        # Source 1: Domain API
        if DOMAIN_KEY:
            domain_listings = domain_api_search(name, pc)
            print(f"  Domain API: {len(domain_listings)}", end="")
            all_raw.extend(domain_listings)
            time.sleep(1)

        # Source 2: Browserless
        if BROWSERLESS_KEY:
            bl_listings = browserless_search(name, pc)
            print(f"  Browserless: {len(bl_listings)}", end="")
            all_raw.extend(bl_listings)
            time.sleep(3)

        # Source 3: Serper
        if SERPER_KEY:
            serper_listings = serper_search(name, pc)
            print(f"  Serper: {len(serper_listings)}", end="")
            all_raw.extend(serper_listings)
            time.sleep(1)

        merged = merge_listings(all_raw, name, pc)
        merged = [m for m in merged if STREET_RE.search(m["addr"])]
        enriched = [enrich(m, median, r3, r4) for m in merged]
        enriched.sort(key=lambda x: (x["verdict"] != "INVESTIGATE", -(x.get("priceNumeric") or 0)))

        inv = sum(1 for e in enriched if e["verdict"] == "INVESTIGATE")
        total += len(enriched)
        total_inv += inv
        print(f"  → {len(enriched)} merged ({inv} INV)")

        if enriched:
            existing[key] = {
                "suburb": name, "state": "SA", "items": enriched,
                "collected": len(enriched),
                "analysedAt": datetime.now().strftime("%d %b %H:%M"),
                "source": f"Multi-source: {', '.join(sources)}",
            }
            json.dump(existing, open(LISTINGS_FILE, "w"), indent=2)

        time.sleep(2)

    print(f"\n{'═'*60}")
    print(f"MULTI-SOURCE SCAN COMPLETE")
    print(f"  Listings: {total}")
    print(f"  INVESTIGATE: {total_inv}")
    print(f"  Written to: {LISTINGS_FILE}")
    print(f"{'═'*60}")

if __name__ == "__main__":
    main()
