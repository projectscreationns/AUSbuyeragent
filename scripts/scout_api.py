#!/usr/bin/env python3
"""
Listing Scout using Anthropic API with web_search.
Returns REAL current listings with addresses + prices.

Cost: ~$0.07/suburb, ~$1.40 per full multi-state run.
Usage: python3 scripts/scout_api.py
"""
import os, json, subprocess, sys, time
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).resolve().parent.parent
LISTINGS_FILE = ROOT / "public" / "data" / "listings.json"
ENV_FILE = ROOT / ".env"

# Load API key from .env
API_KEY = None
for line in ENV_FILE.read_text().splitlines():
    if line.startswith("ANTHROPIC_API_KEY="):
        API_KEY = line.split("=", 1)[1].strip()
        break

if not API_KEY:
    print("ERROR: ANTHROPIC_API_KEY not in .env")
    sys.exit(1)

# Suburb targets — expanded with proper medians and rent estimates
SUBURBS = [
    # QLD Townsville
    ('Kirwan', 'QLD', '4817', 550000, 500, 580),
    ('Condon', 'QLD', '4815', 599000, 500, 580),
    ('Aitkenvale', 'QLD', '4814', 681000, 520, 600),
    ('Kelso', 'QLD', '4815', 580000, 490, 570),
    ('Mount Louisa', 'QLD', '4814', 620000, 510, 590),
    # SA
    ('Para Hills', 'SA', '5096', 520000, 480, 560),
    ('Salisbury North', 'SA', '5108', 615000, 510, 590),
    ('Ingle Farm', 'SA', '5098', 700000, 520, 600),
    ('Parafield Gardens', 'SA', '5107', 650000, 500, 580),
    ('Gawler East', 'SA', '5118', 720000, 520, 600),
    # VIC middle-ring
    ('Hampton Park', 'VIC', '3976', 680000, 540, 610),
    ('Cranbourne West', 'VIC', '3977', 695000, 550, 620),
    ('Narre Warren', 'VIC', '3805', 720000, 560, 630),
    # WA (established middle-ring, lower crime)
    ('Baldivis', 'WA', '6171', 750000, 620, 700),
    ('Wellard', 'WA', '6170', 710000, 580, 670),
    ('Mandurah', 'WA', '6210', 575000, 520, 600),
    ('Thornlie', 'WA', '6108', 680000, 560, 650),
]

def search_suburb(name, state, postcode, median, r3, r4):
    """Call Claude API with web_search to find real listings."""
    prompt = f"""Find 5-8 current houses for sale in {name}, {state} {postcode} under $800,000.

For EACH listing, give me exact data:
- Street address (e.g. "27 Gollogly Lane, Condon, QLD 4815")
- Asking price in dollars
- Bedrooms, bathrooms, car spaces
- Land size in sqm if mentioned
- Any mention of: subdivision zoning (R20/R30/R40), granny flat potential, corner block, mould, asbestos, sold as is, flood zone
- Source URL

Return as JSON array in a ```json code block. Use this exact schema:
[
  {{
    "addr": "full street address",
    "price": "as displayed like 'Offers over $X' or '$X'",
    "priceNumeric": 550000,
    "beds": 3, "baths": 2, "car": 2,
    "land": "700sqm" or null,
    "features": ["subdivision", "granny flat", "corner block"],
    "redFlags": ["mould"] or [],
    "url": "source URL"
  }}
]

Skip listings over $800k. Skip units/townhouses/villas — houses only. Be accurate — use ONLY data from the search results."""

    import urllib.request
    import urllib.error

    body = {
        "model": "claude-sonnet-4-5-20250929",
        "max_tokens": 4096,
        "tools": [{"type": "web_search_20250305", "name": "web_search", "max_uses": 5}],
        "messages": [{"role": "user", "content": prompt}]
    }

    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode(),
        headers={
            "x-api-key": API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
    )

    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err = json.loads(e.read())
        print(f"  ✗ API error: {err.get('error',{}).get('message','unknown')}")
        return [], 0, 0

    if "error" in data:
        print(f"  ✗ {data['error'].get('message')}")
        return [], 0, 0

    # Extract text + parse JSON
    text = ""
    for block in data.get("content", []):
        if block.get("type") == "text":
            text += block.get("text", "")

    # Find JSON block
    import re
    m = re.search(r'```json\s*(\[.*?\])\s*```', text, re.DOTALL)
    if not m:
        m = re.search(r'(\[\s*\{.*?\}\s*\])', text, re.DOTALL)
    if not m:
        print(f"  ✗ No JSON in response")
        return [], data["usage"]["input_tokens"], data["usage"]["output_tokens"]

    try:
        listings = json.loads(m.group(1))
    except json.JSONDecodeError:
        print(f"  ✗ JSON parse error")
        return [], data["usage"]["input_tokens"], data["usage"]["output_tokens"]

    # Enrich with yield/cashflow + verdict
    enriched = []
    for l in listings:
        price = l.get("priceNumeric")
        beds = l.get("beds", 3)
        land_str = l.get("land")
        land_sqm = None
        if land_str:
            land_m = re.search(r"(\d+)", str(land_str))
            if land_m: land_sqm = int(land_m.group(1))

        rent = r4 if beds >= 4 else r3
        if land_sqm and land_sqm >= 700: rent += 30
        y = round(rent * 52 / price * 100, 1) if price else None
        cf = round(rent - price * 0.062 / 52, 0) if price else None

        features = [f.lower() for f in l.get("features", [])]
        red_flags = l.get("redFlags", [])

        # Verdict
        if red_flags:
            verdict = "AVOID"
            reason = f"AVOID — {', '.join(red_flags)}"
        else:
            signals = []
            if land_sqm and land_sqm >= 700: signals.append(f"{land_sqm}sqm block")
            if any(k in " ".join(features) for k in ["r40","r30","r60","subdivision"]): signals.append("subdivision zoning")
            if price and price < median: signals.append(f"below median ${median//1000}k")
            if y and y >= 5.0: signals.append(f"{y}% yield")
            verdict = "INVESTIGATE" if len(signals) >= 1 else "MONITOR"
            reason = f"INVESTIGATE — {'. '.join(signals)}." if verdict == "INVESTIGATE" else "MONITOR — standard listing"

        va = []
        if land_sqm and land_sqm >= 700: va.append(f"{land_sqm}sqm — granny flat/subdivision potential")
        for f in features:
            if f not in " ".join(va).lower(): va.append(f)

        enriched.append({
            "addr": l["addr"],
            "price": l.get("price", "Contact Agent"),
            "priceNumeric": price,
            "beds": beds, "baths": l.get("baths"), "car": l.get("car"),
            "land": land_str, "dom": None,
            "verdict": verdict,
            "motivation": "MEDIUM" if verdict == "INVESTIGATE" else "LOW",
            "motivationSignal": ", ".join(features) if features else "None",
            "yieldEst": f"{y}%" if y else "N/A",
            "cashflowEst": f"${int(cf)}pw" if cf else "N/A",
            "valueAdd": " · ".join(va) if va else "Hold for growth",
            "reason": reason,
            "url": l.get("url") or f"https://www.domain.com.au/sale/{name.lower().replace(' ','-')}-{state.lower()}-{postcode}/"
        })

    return enriched, data["usage"]["input_tokens"], data["usage"]["output_tokens"]

def main():
    print(f"[SCOUT-API] Starting at {datetime.now().strftime('%H:%M')}")
    print(f"[SCOUT-API] {len(SUBURBS)} suburbs to scan\n")

    # Load existing listings to merge with
    listings = {}
    if LISTINGS_FILE.exists():
        with open(LISTINGS_FILE) as f:
            listings = json.load(f)

    total_in = total_out = 0
    for idx, (name, state, pc, median, r3, r4) in enumerate(SUBURBS):
        if idx > 0:
            print(f"   [pacing 50s for rate limit]", flush=True)
            time.sleep(50)
        print(f"[{state}] {name}...", end=" ", flush=True)
        items, tin, tout = search_suburb(name, state, pc, median, r3, r4)
        total_in += tin
        total_out += tout

        if not items:
            continue

        # Merge (dedupe by address)
        key = f"{name} ({state})"
        existing = listings.get(key, {}).get("items", [])
        existing_addrs = {i["addr"].lower() for i in existing}

        # New items override if same address, else append
        merged = []
        new_addrs = {i["addr"].lower() for i in items}
        # Keep existing that aren't replaced
        for e in existing:
            if e["addr"].lower() not in new_addrs:
                merged.append(e)
        # Add all new
        merged.extend(items)

        inv = sum(1 for i in items if i["verdict"] == "INVESTIGATE")
        print(f"{len(items)} listings ({inv} INVESTIGATE)")

        listings[key] = {
            "suburb": name, "state": state, "items": merged,
            "collected": len(merged),
            "analysedAt": datetime.now().strftime('%d %b %H:%M'),
            "source": "Anthropic API + web_search"
        }
        # Incremental save so we don't lose progress if interrupted
        with open(LISTINGS_FILE, "w") as f:
            json.dump(listings, f, indent=2)

    # Cost estimate
    # Sonnet 4.5: $3/M input, $15/M output
    cost = total_in * 3 / 1_000_000 + total_out * 15 / 1_000_000
    print(f"\n[SCOUT-API] Complete. {total_in:,} in + {total_out:,} out tokens = ${cost:.2f}")

if __name__ == "__main__":
    main()
