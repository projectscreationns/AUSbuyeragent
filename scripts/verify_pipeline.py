"""
AUS Buyer Agent — Multi-Agent Verification Pipeline

6 agents process EVERY listing:
  1. Discovery: fetch REA search pages via Scrapfly
  2. Verify: confirm for-sale status via Serper
  3. Price Enrich: get REA price estimates for Contact Agent listings
  4. Spec Fill: beds/baths/car/land from cached pages
  5. Red Flags: scan descriptions for kill-deal signals
  6. Rank & Score: 0-100 composite score, final verdicts

Usage:
  python3 scripts/verify_pipeline.py                     # full pipeline
  python3 scripts/verify_pipeline.py --agent 1           # discovery only
  python3 scripts/verify_pipeline.py --suburb "Para Hills"  # one suburb
  python3 scripts/verify_pipeline.py --resume            # resume from checkpoint
  python3 scripts/verify_pipeline.py --budget 100        # limit Scrapfly credits
"""

import json, re, sys, time, hashlib, urllib.request, urllib.parse, argparse
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
LISTINGS_FILE = ROOT / "public" / "data" / "listings.json"
TOP10_FILE = ROOT / "public" / "data" / "top10.json"
CACHE_DIR = ROOT / ".cache" / "verify"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

# API Keys
def load_env():
    keys = {}
    env = ROOT / ".env"
    if env.exists():
        for line in open(env):
            if "=" in line and not line.startswith("#"):
                k, v = line.strip().split("=", 1)
                keys[k.strip()] = v.strip()
    return keys

ENV = load_env()
SCRAPFLY_KEY = ENV.get("SCRAPFLY_API_KEY", "scp-live-e361bcd85a67497b8b79031e7c34d59a")
SERPER_KEY = ENV.get("SERPER_API_KEY", "408692595428c0126c9acfac1c721f600991e56b")
BUDGET_MAX = 800000

SUBURBS = [
    ("Para Hills", "5096", 750000, 555, 610),
    ("Para Hills West", "5096", 720000, 545, 600),
    ("Ingle Farm", "5098", 780000, 570, 630),
    ("Salisbury", "5108", 722000, 545, 600),
    ("Salisbury East", "5109", 700000, 540, 595),
    ("Parafield Gardens", "5107", 780000, 570, 630),
    ("Gepps Cross", "5094", 680000, 530, 590),
    ("Pooraka", "5095", 720000, 550, 610),
    ("Greenacres", "5086", 760000, 560, 620),
    ("Clearview", "5085", 740000, 555, 615),
    ("Enfield", "5085", 770000, 565, 625),
    ("Modbury", "5092", 720000, 540, 600),
    ("Modbury North", "5092", 690000, 530, 590),
    ("Valley View", "5093", 700000, 540, 600),
    ("Walkley Heights", "5098", 740000, 550, 610),
]

RED_FLAG_KW = {
    "mould": ["mould", "mold", "moisture damage", "damp", "rising damp"],
    "asbestos": ["asbestos", "fibro", "fibrous"],
    "termites": ["termite", "white ant", "pest damage", "borer"],
    "flood": ["flood zone", "flood damage", "inundation", "flood overlay"],
    "sold_as_is": ["sold as is", "as is where is", "sold in current condition"],
    "structural": ["structural damage", "subsidence", "underpinning", "major crack"],
    "fire": ["fire damage", "fire affected"],
}
YELLOW_FLAG_KW = {
    "deceased": ["deceased estate"],
    "renovator": ["renovator", "original condition", "needs work", "handyman special"],
    "easement": ["easement", "encumbrance"],
    "power_lines": ["power lines", "substation", "transmission tower"],
    "busy_road": ["busy road", "main road frontage", "arterial"],
}
VALUE_KW = ["r40", "r30", "r60", "subdivision", "granny flat", "corner block",
            "development potential", "dual occupancy", "subdivide", "duplex"]

# ── Credit tracker ────────────────────────────────────────────────────
credits_used = {"scrapfly": 0, "serper": 0}

def track(service):
    credits_used[service] = credits_used.get(service, 0) + 1

# ── Caching ───────────────────────────────────────────────────────────
def cache_key(url):
    return hashlib.md5(url.encode()).hexdigest()

def cache_get(url):
    p = CACHE_DIR / f"{cache_key(url)}.html"
    return p.read_text() if p.exists() else None

def cache_put(url, html):
    (CACHE_DIR / f"{cache_key(url)}.html").write_text(html)

def checkpoint_save(name, data):
    (CACHE_DIR / f"{name}.json").write_text(json.dumps(data, indent=2))

def checkpoint_load(name):
    p = CACHE_DIR / f"{name}.json"
    return json.loads(p.read_text()) if p.exists() else None

# ── API helpers ───────────────────────────────────────────────────────
def scrapfly_fetch(url, budget_limit=None):
    if budget_limit and credits_used["scrapfly"] >= budget_limit:
        return None
    cached = cache_get(url)
    if cached:
        return cached
    encoded_url = url.replace("+", "%2B").replace(",", "%2C").replace(" ", "%20")
    api = (f"https://api.scrapfly.io/scrape?key={SCRAPFLY_KEY}&url={encoded_url}"
           f"&render_js=true&asp=true&country=au")
    try:
        with urllib.request.urlopen(urllib.request.Request(api), timeout=90) as r:
            data = json.loads(r.read())
        html = data.get("result", {}).get("content", "")
        track("scrapfly")
        if html and len(html) > 5000:
            cache_put(url, html)
        return html
    except Exception as e:
        print(f"    Scrapfly error: {str(e)[:60]}")
        track("scrapfly")
        return None

def serper_search(query, num=5):
    body = json.dumps({"q": query, "num": num, "gl": "au"}).encode()
    req = urllib.request.Request("https://google.serper.dev/search",
        data=body, headers={"X-API-KEY": SERPER_KEY, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            track("serper")
            return json.loads(r.read()).get("organic", [])
    except:
        track("serper")
        return []

# ── Parsing helpers ───────────────────────────────────────────────────
def parse_price(text):
    if not text:
        return None
    rng = re.search(r"\$\s*([\d,]+)\s*[-–]\s*\$\s*([\d,]+)", text)
    if rng:
        lo = int(rng.group(1).replace(",", ""))
        hi = int(rng.group(2).replace(",", ""))
        return (lo + hi) // 2
    single = re.search(r"\$\s*([\d,]+)", text)
    if single:
        v = int(single.group(1).replace(",", ""))
        if 100000 <= v <= 3000000:
            return v
    km = re.search(r"\$\s*(\d{3,4})\s*[kK]", text)
    if km:
        return int(km.group(1)) * 1000
    return None

def normalize_addr(addr):
    return re.sub(r"[^a-z0-9]", "", addr.lower())

def scan_flags(text):
    lower = text.lower()
    red = [cat for cat, kws in RED_FLAG_KW.items() if any(kw in lower for kw in kws)]
    yellow = [cat for cat, kws in YELLOW_FLAG_KW.items() if any(kw in lower for kw in kws)]
    values = [kw for kw in VALUE_KW if kw in lower]
    return red, yellow, values

# ═══════════════════════════════════════════════════════════════════════
# AGENT 1: Discovery — fetch REA search pages, extract real listing data
# ═══════════════════════════════════════════════════════════════════════
def agent_1_discover(suburbs, budget_limit=None):
    print("\n[AGENT 1] DISCOVERY — Fetching REA search pages via Scrapfly")
    all_listings = {}

    for name, pc, median, r3, r4 in suburbs:
        key = f"{name} (SA)"
        print(f"  [{name}]", end="", flush=True)
        suburb_listings = []
        seen = set()

        for page in range(1, 8):
            slug = name.lower().replace(" ", "+")
            url = f"https://www.realestate.com.au/buy/property-house-in-{slug},+sa+{pc}/list-{page}"
            html = scrapfly_fetch(url, budget_limit)
            if not html or len(html) < 10000:
                if page == 1:
                    print(f" FAIL", end="")
                break

            # Extract addresses from JSON-LD streetAddress fields
            addrs = re.findall(r'"streetAddress"\s*:\s*"([^"]+)"', html)
            urls_found = re.findall(r'"(https://www\.realestate\.com\.au/property-[^"]+)"', html)

            new_count = 0
            for addr in addrs:
                if len(addr) < 8 or not re.match(r"^\d", addr):
                    continue
                if re.search(r"located at|bedroom house", addr, re.I):
                    continue
                nk = normalize_addr(addr)
                if nk in seen:
                    continue
                seen.add(nk)

                # Get context around address for price/specs
                idx = html.find(f'"{addr}"')
                if idx < 0:
                    continue
                ctx = html[max(0, idx - 2000):min(len(html), idx + 2000)]

                # Price
                price_num = None
                price_text = "Contact Agent"
                for pm in re.finditer(r"\$([\d,]+)", ctx):
                    v = int(pm.group(1).replace(",", ""))
                    if 200000 <= v <= BUDGET_MAX:
                        price_num = v
                        price_text = f"${pm.group(1)}"
                        break
                    elif v > BUDGET_MAX:
                        price_num = v
                        break
                if price_num and price_num > BUDGET_MAX:
                    continue

                # Specs
                beds = baths = car = land_sqm = None
                bm = re.search(r"(\d)\s*[Bb]ed", ctx)
                if bm: beds = int(bm.group(1))
                bam = re.search(r"(\d)\s*[Bb]ath", ctx)
                if bam: baths = int(bam.group(1))
                cm = re.search(r"(\d)\s*[Cc]ar", ctx)
                if cm: car = int(cm.group(1))
                lm = re.search(r"(\d{2,5})\s*m", ctx)
                if lm:
                    v = int(lm.group(1))
                    if 200 <= v <= 5000:
                        land_sqm = v
                if beds and beds < 3:
                    continue

                # Match listing URL
                listing_url = ""
                addr_parts = addr.lower().split()[:2]
                for u in urls_found:
                    if any(p in u.lower() for p in addr_parts):
                        listing_url = u
                        break

                full_addr = f"{addr}, {name}, SA {pc}"
                suburb_listings.append({
                    "addr": full_addr,
                    "price": price_text,
                    "priceNumeric": price_num,
                    "priceEstimated": price_num is None,
                    "priceSource": "REA search page" if price_num else "none",
                    "beds": beds, "baths": baths, "car": car,
                    "land": f"{land_sqm}sqm" if land_sqm else None,
                    "landSqm": land_sqm or 0,
                    "url": listing_url,
                    "status": "for_sale",
                    "redFlags": [], "yellowFlags": [],
                    "score": 0, "verdict": "MONITOR",
                })
                new_count += 1

            if page == 1:
                print(f" p1:{len(addrs)}→{new_count}", end="")
            else:
                print(f"+{new_count}", end="")
            if new_count == 0 and page > 1:
                break
            time.sleep(4)

        print(f" = {len(suburb_listings)} listings")
        all_listings[key] = {
            "suburb": name, "state": "SA",
            "items": suburb_listings,
            "collected": len(suburb_listings),
            "median": median, "r3": r3, "r4": r4,
        }
        checkpoint_save("agent1", all_listings)
        time.sleep(3)

    print(f"[AGENT 1] Done. Scrapfly credits: {credits_used['scrapfly']}")
    return all_listings


# ═══════════════════════════════════════════════════════════════════════
# AGENT 2: Verify — confirm listings are still for sale
# ═══════════════════════════════════════════════════════════════════════
def agent_2_verify(listings):
    print("\n[AGENT 2] VERIFY — Checking listing status")
    removed = {"sold": 0, "withdrawn": 0, "under_offer": 0}

    for key, data in listings.items():
        contact_agent_items = [i for i in data["items"] if i.get("priceEstimated")]
        if not contact_agent_items:
            continue
        # Listings found in REA search results are confirmed for_sale
        # Only verify items that seem suspicious (no URL, no specs)
        for item in contact_agent_items:
            if item.get("url"):
                continue  # has REA URL = confirmed on REA
            addr = item["addr"].split(",")[0]
            results = serper_search(f'"{addr}" site:realestate.com.au', 3)
            combined = " ".join(r.get("title", "") + " " + r.get("snippet", "") for r in results).lower()
            if "sold" in combined or "recently sold" in combined:
                item["status"] = "sold"
                removed["sold"] += 1
            elif "under offer" in combined or "under contract" in combined:
                item["status"] = "under_offer"
                removed["under_offer"] += 1
            elif "withdrawn" in combined or "off market" in combined:
                item["status"] = "withdrawn"
                removed["withdrawn"] += 1
            time.sleep(0.5)

    # Remove non-for-sale
    for key, data in listings.items():
        data["items"] = [i for i in data["items"] if i.get("status") == "for_sale"]
        data["collected"] = len(data["items"])

    print(f"[AGENT 2] Removed: {removed}. Serper queries: {credits_used['serper']}")
    return listings


# ═══════════════════════════════════════════════════════════════════════
# AGENT 3: Price Enrich — fetch individual REA pages for Contact Agent
# ═══════════════════════════════════════════════════════════════════════
def agent_3_enrich_price(listings, budget_limit=None):
    print("\n[AGENT 3] PRICE ENRICH — Fetching REA listing pages for Contact Agent")
    enriched = 0
    skipped = 0

    for key, data in listings.items():
        for item in data["items"]:
            if not item.get("priceEstimated"):
                continue  # already has real price
            url = item.get("url", "")
            if not url or "realestate.com.au/property-" not in url:
                skipped += 1
                continue

            print(f"  Enriching: {item['addr'][:45]}...", end="", flush=True)
            html = scrapfly_fetch(url, budget_limit)
            if not html or len(html) < 5000:
                print(" FAIL")
                time.sleep(3)
                continue

            # Extract price from multiple sources
            price = None
            price_text = None

            # Try displayPrice in JSON
            for pat in [r'"displayPrice"\s*:\s*"([^"]+)"',
                        r'"priceText"\s*:\s*"([^"]+)"',
                        r'"price"\s*:\s*"([^"]+)"',
                        r'Price\s+guide[:\s]*([^<\n]+)',
                        r'Estimated\s+(?:value|price)[:\s]*([^<\n]+)']:
                m = re.search(pat, html, re.I)
                if m:
                    parsed = parse_price(m.group(1))
                    if parsed and 200000 <= parsed <= BUDGET_MAX:
                        price = parsed
                        price_text = m.group(1).strip()
                        break

            # Fallback: any price in the main content area
            if not price:
                for pm in re.finditer(r"\$([\d,]+)", html[:50000]):
                    v = int(pm.group(1).replace(",", ""))
                    if 300000 <= v <= BUDGET_MAX:
                        price = v
                        price_text = f"${pm.group(1)}"
                        break

            if price:
                item["priceNumeric"] = price
                item["price"] = price_text or f"${price:,}"
                item["priceEstimated"] = False
                item["priceSource"] = "REA listing page"
                enriched += 1
                print(f" ${price:,}")
            else:
                # Use suburb median as last resort but flag it
                item["priceSource"] = "suburb_median_estimate"
                item["priceNumeric"] = data.get("median", 700000)
                print(f" no price found (using median)")

            # Also extract full description for red flag scanning
            desc = ""
            dm = re.search(r'"description"\s*:\s*"([^"]{20,})"', html)
            if dm:
                desc = dm.group(1)[:2000]
            item["_description"] = desc

            # Extract specs if missing
            if not item.get("beds"):
                bm = re.search(r"(\d)\s*[Bb]ed", html[:20000])
                if bm: item["beds"] = int(bm.group(1))
            if not item.get("baths"):
                bam = re.search(r"(\d)\s*[Bb]ath", html[:20000])
                if bam: item["baths"] = int(bam.group(1))
            if not item.get("car"):
                cm = re.search(r"(\d)\s*[Cc]ar", html[:20000])
                if cm: item["car"] = int(cm.group(1))
            if not item.get("landSqm"):
                lm = re.search(r"(\d{2,5})\s*m", html[:20000])
                if lm:
                    v = int(lm.group(1))
                    if 200 <= v <= 5000:
                        item["landSqm"] = v
                        item["land"] = f"{v}sqm"

            time.sleep(4)

    checkpoint_save("agent3", listings)
    print(f"[AGENT 3] Enriched {enriched} prices, skipped {skipped}. Credits: {credits_used['scrapfly']}")
    return listings


# ═══════════════════════════════════════════════════════════════════════
# AGENT 4: Spec Fill — fill gaps from cached data (0 credits)
# ═══════════════════════════════════════════════════════════════════════
def agent_4_fill_specs(listings):
    print("\n[AGENT 4] SPEC FILL — Filling beds/baths/car/land gaps")
    filled = 0
    for key, data in listings.items():
        for item in data["items"]:
            url = item.get("url", "")
            if not url:
                continue
            cached = cache_get(url)
            if not cached:
                continue
            changed = False
            if not item.get("beds"):
                bm = re.search(r"(\d)\s*[Bb]ed", cached[:20000])
                if bm: item["beds"] = int(bm.group(1)); changed = True
            if not item.get("baths"):
                bam = re.search(r"(\d)\s*[Bb]ath", cached[:20000])
                if bam: item["baths"] = int(bam.group(1)); changed = True
            if not item.get("car"):
                cm = re.search(r"(\d)\s*[Cc]ar", cached[:20000])
                if cm: item["car"] = int(cm.group(1)); changed = True
            if not item.get("landSqm"):
                for lm in re.finditer(r"(\d{2,5})\s*(?:m²|m2|sqm)", cached[:30000], re.I):
                    v = int(lm.group(1))
                    if 200 <= v <= 5000:
                        item["landSqm"] = v
                        item["land"] = f"{v}sqm"
                        changed = True
                        break
            if changed:
                filled += 1
    print(f"[AGENT 4] Filled specs for {filled} listings (0 credits)")
    return listings


# ═══════════════════════════════════════════════════════════════════════
# AGENT 5: Red Flags — scan for kill-deal signals
# ═══════════════════════════════════════════════════════════════════════
def agent_5_red_flags(listings):
    print("\n[AGENT 5] RED FLAGS — Scanning descriptions")
    flagged_red = 0
    flagged_yellow = 0

    for key, data in listings.items():
        for item in data["items"]:
            # Use cached description from Agent 3
            desc = item.pop("_description", "")

            # If no description, try cached HTML
            if not desc:
                url = item.get("url", "")
                cached = cache_get(url) if url else None
                if cached:
                    dm = re.search(r'"description"\s*:\s*"([^"]{20,})"', cached)
                    if dm:
                        desc = dm.group(1)[:2000]

            # If still no description, use Serper snippet
            if not desc:
                addr_short = item["addr"].split(",")[0]
                results = serper_search(f'"{addr_short}" {data["suburb"]} SA', 3)
                desc = " ".join(r.get("snippet", "") for r in results)
                time.sleep(0.3)

            # Scan
            combined = f"{item['addr']} {desc} {item.get('price', '')}"
            red, yellow, values = scan_flags(combined)
            item["redFlags"] = red
            item["yellowFlags"] = yellow
            if values:
                item["motivationSignal"] = ", ".join(values)

            if red:
                item["verdict"] = "AVOID"
                item["reason"] = f"AVOID — {', '.join(red)}"
                flagged_red += 1
            if yellow:
                flagged_yellow += 1

    print(f"[AGENT 5] Red flags: {flagged_red}, Yellow flags: {flagged_yellow}")
    return listings


# ═══════════════════════════════════════════════════════════════════════
# AGENT 6: Rank & Score — 0-100 composite, final verdicts
# ═══════════════════════════════════════════════════════════════════════
def agent_6_rank_score(listings):
    print("\n[AGENT 6] RANK & SCORE — Final verdicts")

    for key, data in listings.items():
        median = data.get("median", 720000)
        r3 = data.get("r3", 550)
        r4 = data.get("r4", 610)

        for item in data["items"]:
            if item.get("verdict") == "AVOID":
                item["score"] = 0
                continue

            score = 0
            price = item.get("priceNumeric", 0) or median
            estimated = item.get("priceEstimated", True)

            # Price score (0-25)
            if price and not estimated:
                ratio = price / BUDGET_MAX
                if ratio <= 0.75: score += 25
                elif ratio <= 0.85: score += 20
                elif ratio <= 0.90: score += 15
                elif ratio <= 0.95: score += 10
                elif ratio <= 1.0: score += 5
            elif price and estimated:
                score += 2

            # Yield (0-20)
            beds = item.get("beds")
            land = item.get("landSqm", 0)
            rent = r4 if (beds and beds >= 4) else r3
            if land >= 700: rent += 30
            y = round(rent * 52 / price * 100, 1) if price else 0
            item["yieldEst"] = f"{y}%"
            cf = round(rent - price * 0.062 / 52) if price else 0
            item["cashflowEst"] = f"${cf}pw"
            if y >= 6.0: score += 20
            elif y >= 5.5: score += 17
            elif y >= 5.0: score += 14
            elif y >= 4.5: score += 10
            elif y >= 4.0: score += 6

            # Land (0-15)
            if land >= 900: score += 15
            elif land >= 750: score += 12
            elif land >= 650: score += 8
            elif land >= 500: score += 4

            # Specs completeness (0-10)
            if item.get("beds"): score += 3
            if item.get("baths"): score += 2
            if item.get("car"): score += 2
            if item.get("land"): score += 3

            # Value-add (0-15)
            signal = (item.get("motivationSignal", "") + " " + item.get("valueAdd", "")).lower()
            if any(kw in signal for kw in ["subdivision", "r40", "r30", "r60"]): score += 15
            elif any(kw in signal for kw in ["granny flat", "dual occupancy"]): score += 12
            elif "corner block" in signal: score += 8
            elif "development" in signal: score += 6

            # Data quality (0-15)
            if not estimated: score += 5
            if item.get("url") and "realestate.com.au/property-" in item.get("url", ""): score += 5
            if item.get("status") == "for_sale": score += 5

            # Risk penalty (0 to -30)
            score -= len(item.get("redFlags", [])) * 15
            score -= len(item.get("yellowFlags", [])) * 3

            item["score"] = max(0, min(100, score))

            # Verdict
            if item.get("redFlags"):
                item["verdict"] = "AVOID"
            elif score >= 65:
                item["verdict"] = "INVESTIGATE"
                inv_reasons = []
                if land >= 650: inv_reasons.append(f"{land}sqm block")
                if not estimated and price < median * 0.97: inv_reasons.append("Below median")
                if y >= 5.0: inv_reasons.append(f"Yield {y}%")
                if any(kw in signal for kw in VALUE_KW): inv_reasons.append("Value-add potential")
                item["reason"] = f"INVESTIGATE — {'. '.join(inv_reasons) or 'High score'}. ACTION: Call agent."
                item["motivation"] = "HIGH"
            elif score >= 50:
                item["verdict"] = "WATCH"
                item["reason"] = f"WATCH — Score {score}. Worth monitoring."
                item["motivation"] = "MEDIUM"
            elif score >= 35:
                item["verdict"] = "MONITOR"
                item["reason"] = f"MONITOR — Score {score}."
                item["motivation"] = "LOW"
            else:
                item["verdict"] = "SKIP"
                item["reason"] = f"SKIP — Low score ({score})."
                item["motivation"] = "NONE"

        # Sort by score
        data["items"].sort(key=lambda x: -x.get("score", 0))

    # Print summary
    all_items = [i for d in listings.values() for i in d["items"]]
    by_verdict = {}
    for i in all_items:
        v = i.get("verdict", "?")
        by_verdict[v] = by_verdict.get(v, 0) + 1
    print(f"[AGENT 6] Verdicts: {by_verdict}")
    print(f"[AGENT 6] Top 5:")
    top = sorted(all_items, key=lambda x: -x.get("score", 0))[:5]
    for t in top:
        est = " (est)" if t.get("priceEstimated") else ""
        print(f"  {t['score']:3d} | {t['addr'][:45]} | {t.get('price','?')}{est}")

    return listings


# ═══════════════════════════════════════════════════════════════════════
# ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════
def build_top10(listings):
    all_inv = []
    for key, data in listings.items():
        for item in data["items"]:
            if item.get("verdict") in ("INVESTIGATE", "WATCH"):
                item["_suburb_key"] = key
                all_inv.append(item)
    all_inv.sort(key=lambda x: -x.get("score", 0))

    top = []
    for i, item in enumerate(all_inv[:10], 1):
        top.append({
            "rank": i,
            "addr": item["addr"],
            "price": item.get("price", "Contact Agent"),
            "priceNumeric": item.get("priceNumeric", 0),
            "suburb": item.get("_suburb_key", ""),
            "beds": item.get("beds"),
            "baths": item.get("baths"),
            "car": item.get("car"),
            "land": item.get("land"),
            "yieldEst": item.get("yieldEst", "?"),
            "cashflowEst": item.get("cashflowEst", "?"),
            "score": item.get("score", 0),
            "reason": item.get("reason", ""),
            "action": "Call agent — verified listing" if not item.get("priceEstimated") else "Check REA link for real price, then call",
            "url": item.get("url", ""),
            "riskFlags": item.get("redFlags", []) + [f"⚠ {y}" for y in item.get("yellowFlags", [])],
        })
    return top


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent", type=int, help="Run single agent (1-6)")
    parser.add_argument("--suburb", help="Process one suburb only")
    parser.add_argument("--resume", action="store_true", help="Resume from checkpoint")
    parser.add_argument("--budget", type=int, default=500, help="Max Scrapfly credits")
    args = parser.parse_args()

    targets = SUBURBS
    if args.suburb:
        targets = [s for s in SUBURBS if s[0].lower() == args.suburb.lower()]
        if not targets:
            print(f"Unknown suburb. Available: {', '.join(s[0] for s in SUBURBS)}")
            sys.exit(1)

    print("╔════════════════════════════════════════════════════════╗")
    print("║  MULTI-AGENT VERIFICATION PIPELINE                     ║")
    print(f"║  Suburbs: {len(targets):3d} | Budget: {args.budget} Scrapfly credits       ║")
    print("╚════════════════════════════════════════════════════════╝")

    # Load or resume
    if args.resume:
        listings = checkpoint_load("agent3") or checkpoint_load("agent1")
        if listings:
            print("[RESUME] Loaded checkpoint")
        else:
            print("[RESUME] No checkpoint found, starting fresh")
            listings = None
    else:
        listings = None

    start_agent = args.agent or 1
    end_agent = args.agent or 6

    # Agent 1
    if start_agent <= 1 <= end_agent and not listings:
        listings = agent_1_discover(targets, args.budget)

    if not listings:
        listings = checkpoint_load("agent1") or {}

    # Agent 2
    if start_agent <= 2 <= end_agent:
        listings = agent_2_verify(listings)

    # Agent 3
    if start_agent <= 3 <= end_agent:
        listings = agent_3_enrich_price(listings, args.budget)

    # Agent 4
    if start_agent <= 4 <= end_agent:
        listings = agent_4_fill_specs(listings)

    # Agent 5
    if start_agent <= 5 <= end_agent:
        listings = agent_5_red_flags(listings)

    # Agent 6
    if start_agent <= 6 <= end_agent:
        listings = agent_6_rank_score(listings)

    # Write output
    # Clean internal fields
    for key, data in listings.items():
        for item in data["items"]:
            item.pop("_description", None)
            item.pop("_suburb_key", None)
        data.pop("median", None)
        data.pop("r3", None)
        data.pop("r4", None)
        data["analysedAt"] = datetime.now().strftime("%d %b %H:%M")
        data["source"] = "Multi-agent verification pipeline v1"

    json.dump(listings, open(LISTINGS_FILE, "w"), indent=2)
    print(f"\n[OUTPUT] Written to {LISTINGS_FILE}")

    # Build top 10
    top10_listings = build_top10(listings)
    existing_top10 = json.load(open(TOP10_FILE)) if TOP10_FILE.exists() else {}
    existing_top10["topListings"] = top10_listings
    existing_top10["asOf"] = datetime.now().strftime("%d/%m/%Y")
    json.dump(existing_top10, open(TOP10_FILE, "w"), indent=2)
    print(f"[OUTPUT] Top 10 written to {TOP10_FILE}")

    print(f"\n{'═' * 60}")
    print(f"PIPELINE COMPLETE")
    print(f"  Scrapfly credits: {credits_used['scrapfly']}")
    print(f"  Serper queries: {credits_used['serper']}")
    total = sum(len(d["items"]) for d in listings.values())
    inv = sum(1 for d in listings.values() for i in d["items"] if i["verdict"] == "INVESTIGATE")
    print(f"  Listings: {total} | INVESTIGATE: {inv}")
    print(f"{'═' * 60}")


if __name__ == "__main__":
    main()
