# AUS Buyer Agent — Multi-Agent Orchestrator

## Project
Vite + React property investment dashboard. Data flows: Claude Code writes JSON → `public/data/*.json` → React loads and displays. User views at `localhost:5173`.

## Investor Profile
- **Budget:** $800k hard ceiling
- **Cash:** $110k (deposit + stamp duty + legal/B&P)
- **Strategy:** 10% deposit + LMI at 90% LVR, capital growth, 5yr buy-and-hold
- **Property:** House only
- **Existing:** Townhouse in Murrumba Downs QLD (held)
- **Preference:** WA, SA for diversification. QLD viable if growth justifies ~$1,500/yr extra land tax
- **Stamp duty ref:** WA ~$22k@$700k, SA ~$24k@$637k, QLD ~$17k@$550k, VIC ~$43k+surcharge@$800k

## Commands
| Command | Action |
|---------|--------|
| `/run-full` | Run stages 1→4 sequentially, print progress between stages |
| `/run-macro` | Stage 1: Macro environment scan |
| `/run-regions` | Stage 2: Region ranking (reads macro.json) |
| `/run-suburbs` | Stage 3: Suburb deep dive (reads regions.json, picks STRONG+WATCH) |
| `/run-listings` | Stage 4: Listing scout + quality check (reads suburbs.json) |
| `/run-dd [address]` | Stage 5: Due diligence (user provides documents) |
| `/refresh-listings [suburb]` | Re-scrape one suburb's listings |
| `/quality-check` | Re-scan all INVESTIGATE listings for red flags |

## Orchestration Rules
1. Each stage reads upstream JSON from disk before starting
2. Each stage writes COMPLETE valid JSON to its output file (never partial)
3. Stage 3: process ONE REGION at a time, append results
4. Stage 4: process ONE SUBURB at a time, merge into existing file
5. Between stages, print summary (e.g. "Macro complete. 6 GREEN, 3 AMBER, 4 RED.")
6. After completion: commit, push, tell user to `git pull` + reload dashboard
7. Cover ALL states (WA, SA, QLD, VIC minimum) — never default to WA only

## Quality Standards
- Never fabricate data. Set to null if not found.
- Every data point must cite a source URL.
- Red flag quality check is MANDATORY before any INVESTIGATE verdict.
- Print "[AGENT X] Starting..." and "[AGENT X] Complete." markers.

---

## Agent 1: Macro Scanner
**Trigger:** `/run-macro`
**Output:** `public/data/macro.json`

### Process
Run 10-15 WebSearches for:
1. RBA cash rate + last decision + next meeting + Big 4 forecasts
2. ABS unemployment (latest month, trend)
3. ABS CPI inflation (headline + trimmed mean)
4. ABS WPI wages (latest quarter)
5. ABS NOM migration + population growth + state breakdown
6. ABS building approvals (monthly, houses vs apts, vs 240k/yr target)
7. SQM vacancy rates (national + by capital city)
8. CoreLogic/PropTrack capital city house medians
9. Domain/CoreLogic auction clearance rates by city
10. Lending rates (owner-occ, investor variable) + APRA buffer + DTI cap

Assign traffic light per category: GREEN (favourable), AMBER (neutral), RED (headwind).

### Output Schema
```json
{
  "asOf": "DD/MM/YYYY",
  "rba": {
    "cashRate": "4.10%",
    "lastDecision": { "date": "DD/MM/YYYY", "change": "+25bp", "voteSplit": "5-4", "source": "url" },
    "nextMeeting": "DD/MM/YYYY",
    "forecasts": [{ "bank": "ANZ", "nextMove": "description", "source": "url" }],
    "signal": "RED", "note": "explanation"
  },
  "employment": {
    "unemployment": { "value": "X%", "month": "Mon YYYY", "trend": "rising/falling/stable", "source": "url" },
    "signal": "AMBER", "note": "explanation"
  },
  "inflation": {
    "headline": { "value": "X%", "period": "12mo to Mon YYYY", "source": "url" },
    "trimmedMean": { "value": "X%", "source": "url" },
    "signal": "RED", "note": "explanation"
  },
  "wages": { "wpiAnnual": { "value": "X%", "quarter": "Mon Q YYYY", "source": "url" }, "signal": "AMBER", "note": "" },
  "migration": {
    "nom": { "value": "XXX,XXX", "period": "yr to Mon YYYY", "source": "url" },
    "annualPopGrowth": { "value": "+X%", "source": "url" },
    "fastestStates": [{ "state": "WA", "growth": "+X%" }],
    "signal": "GREEN", "note": ""
  },
  "approvals": { "monthly": { "value": "XX,XXX", "month": "Mon YYYY", "source": "url" }, "housesTrend": "+X%", "vsTarget": "X% below 240k target", "signal": "GREEN", "note": "" },
  "vacancy": { "national": { "value": "X%", "source": "url" }, "byCity": [{ "city": "Perth", "value": "0.6%" }], "signal": "GREEN", "note": "" },
  "medians": { "cities": [{ "city": "Sydney", "median": 1750000 }], "national": { "value": XXXXXX, "source": "url" }, "signal": "AMBER", "note": "" },
  "clearanceRates": { "cities": [{ "city": "Sydney", "rate": "70%", "trend": "steady" }], "signal": "AMBER", "note": "" },
  "lending": { "ownerOccVariable": { "value": "X%", "source": "url" }, "investorVariable": { "value": "X%", "source": "url" }, "assessmentRate": { "value": "~X%", "source": "url" }, "apraChanges": "description", "signal": "RED", "note": "" },
  "risks": [{ "risk": "description", "probability": "HIGH|MEDIUM|LOW", "impact": "description", "signal": "RED" }],
  "summary": "2-3 sentence assessment",
  "warnings": ["key warnings"]
}
```

---

## Agent 2: Region Ranker
**Trigger:** `/run-regions`
**Dependencies:** Read `public/data/macro.json` first
**Output:** `public/data/regions.json`

### Process
1. Read macro.json for context
2. Run 15+ WebSearches to score regions across ALL states
3. Score each region on: growth momentum (40%), vacancy/demand (25%), affordability fit (20%), fundamentals (15%)
4. Budget filter: PASS (median ≤$800k), BORDERLINE (within 10%), FAIL (over)
5. Flag QLD regions with land tax note (2nd QLD property)
6. Flag VIC regions with stamp duty surcharge warning

### Regions to evaluate (minimum)
WA: Perth inner/mid/outer, Geraldton, Albany, Bunbury, Mandurah
SA: Adelaide inner/north/south, Gawler, Mt Barker, Mt Gambier
QLD: Townsville, Mackay, Rockhampton, Toowoomba, Logan/Ipswich, Gold Coast, Cairns
VIC: Melbourne outer (Melton/Wyndham/Casey), Geelong, Ballarat, Bendigo
NSW: Newcastle, Central Coast, Tamworth
TAS: Hobart, Launceston
NT: Darwin
ACT: Canberra

### Verdicts
- STRONG: score ≥8.0 AND budget PASS
- WATCH: score 7.0-7.9 OR borderline
- CAUTION: score 5.5-6.9
- AVOID: score <5.5 OR budget FAIL

### Output Schema
```json
{
  "asOf": "date",
  "regions": [{
    "region": "WA — Perth mid/outer ring",
    "score": 9.2, "verdict": "STRONG", "riskRating": "LOW",
    "priceFilter": "PASS — description",
    "houseMedian": 690000,
    "growthScore": 92, "vacancyScore": 96, "affordabilityScore": 88, "fundamentalsScore": 85,
    "note": "detailed analysis", "keyRisk": "main risk",
    "analystForecasts": ["ANZ: +10% 2026"], "source": "url"
  }],
  "summary": "top-level findings",
  "topPicks": ["region1", "region2"],
  "avoids": ["region — reason"]
}
```

---

## Agent 3: Suburb Analyst
**Trigger:** `/run-suburbs`
**Dependencies:** Read `public/data/regions.json`, auto-select STRONG + WATCH regions
**Output:** `public/data/suburbs.json`
**Context management:** Process ONE REGION at a time. Build suburbs array incrementally.

### Process per region
1. Identify 2-5 suburbs with house median ≤$800k
2. For each suburb, run WebSearches for ALL metrics below

### Quantitative Metrics (9 total, each scored 0-100)
| Metric | Scoring | Weight |
|--------|---------|--------|
| DOM | ≤10d=98, ≤15d=90, ≤21d=80, ≤30d=65, ≤45d=50 | 1x |
| Vacancy | ≤0.5%=98, ≤1%=90, ≤1.5%=75, ≤2%=60 | 1x |
| Yield | ≥6%=95, ≥5.5%=88, ≥5%=78, ≥4.5%=65, ≥4%=55 | 1x |
| Price Growth | ≥25%=98, ≥18%=90, ≥12%=80, ≥8%=68, ≥5%=55 | **2x** |
| Supply on Market | ≤0.1%=98, ≤0.3%=88, ≤0.5%=75 | 1x |
| Vendor Discount | ≤-4%=90, ≤-2%=78, ≤-1%=68 | 1x |
| Renter % | 20-30%=85, 15-35%=75, 35-45%=55 | 1x |
| Unit:House Ratio | ≤5%=95, ≤10%=85, ≤20%=70 | 1x |
| Auction Clearance | ≥80%=95, ≥70%=82, ≥60%=68 | 1x |

### Qualitative Categories (11 total, maximum depth)
1. **Infrastructure** — `[{ name, type, status (completed/under-construction/approved/proposed/delayed/cancelled), expectedCompletion, delayMonths, investmentAud, impactRating, source, notes }]`
2. **Crime** — `{ overallRating (low/moderate/high), trend, notableTypes[], comparisonToState, source }`
3. **Public Housing** — `{ existingNearby, plannedNearby, concentration (none/low/moderate/high), details, source }`
4. **Schools** — `{ primary[{name,rating,distance}], secondary[{name,rating,distance}], overallQuality, source }`
5. **Hazards** — `{ flood:{risk,zone,source}, bushfire:{risk,zone,source}, coastal:{risk,source} }`
6. **Zoning** — `{ currentZoning, densificationPotential, recentRezonings, councilPlan, source }`
7. **Development Apps** — `[{ description, scale, impact, source }]`
8. **Demographics** — `{ medianAge, trend, householdType, irsad, source }`
9. **Rental Demand** — `{ tenantTypes, marketDepth, source }`
10. **Connectivity** — `{ nbn, publicTransport, cbdDistance, source }`
11. **Noise** — `{ flightPath, highway, industrial, notes }`

### 5yr Forward Outlook
```json
{ "cycleStage": "EARLY|EARLY-MID|MID|MID-LATE|LATE",
  "bear": 10, "base": 25, "bull": 45, "horizon": "5yr to 2031",
  "drivers": ["..."], "risks": ["..."],
  "analystViews": ["ANZ: +10% 2026"], "consensus": "2-3 sentences" }
```

### Output Schema
```json
{
  "asOf": "date",
  "suburbs": [{
    "name": "Kirwan", "state": "QLD", "postcode": "4817", "lga": "Townsville City",
    "region": "QLD — Townsville", "medianHouse": 550000, "medianRentWeekly": 530,
    "quant": { "dom": {"value":11,"score":94,"source":"url"}, ... },
    "compositeScore": 88,
    "qual": { "infrastructure": [...], "crime": {...}, "publicHousing": {...}, ... },
    "forward": { "cycleStage": "MID", "bear": 15, "base": 35, "bull": 55, ... },
    "verdict": "STRONG BUY|BUY|WATCH|CAUTION|AVOID",
    "topSignals": ["..."], "watchPoints": ["..."], "stampDutyNote": "..."
  }],
  "summary": "overall findings"
}
```

---

## Agent 4: Listing Scout + Quality Checker
**Trigger:** `/run-listings`
**Dependencies:** Read `public/data/suburbs.json`
**Output:** `public/data/listings.json`
**Context management:** Process ONE SUBURB at a time. Merge into existing file.

### Cross-State Listing Strategy

**WA suburbs:** Use bash curl with browser User-Agent on REIWA.com.au:
```bash
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
curl -s -L -A "$UA" "https://reiwa.com.au/for-sale/{suburb}/houses/" -o /tmp/{suburb}.html
```
Parse HTML for listing URLs (pattern: `https://reiwa.com.au/{address}-{id}/`). Fetch each listing page. Extract: address, price, beds, baths, car, land, description. Parse description for red flags.

**SA/QLD/VIC suburbs:** Use WebSearch since Domain/REA block curl:
```
WebSearch: site:realestate.com.au "{suburb} {state}" house for sale
WebSearch: site:domain.com.au "{suburb}" house for sale under $800000
WebSearch: "{suburb} {state}" house sale {beds} bedroom address price 2026
```
Google snippets contain listing data (address, price, specs) even from blocked sites. Extract what's available.

For EACH listing found, do a SECONDARY WebSearch for the specific address:
```
WebSearch: "{street address}" {suburb} {state}
```
Read the snippet/description to check for red flags.

### Red Flag Quality Check (MANDATORY)
Before assigning INVESTIGATE, search for the property address and check for:

**AVOID (kill deal):**
- Mould / damp / moisture damage
- Asbestos / fibro
- Termites / white ants / pest damage
- Flood zone / flood damage / inundation
- "Sold as is" / "as is where is"
- Structural damage / subsidence / underpinning
- Fire damage

**Yellow warning (proceed with caution):**
- Deceased estate (motivation signal BUT may have deferred maintenance)
- Renovator / original condition (budget the reno cost)
- Easement on property (check impact on subdivision)
- Near power lines / substation
- Busy road / main road frontage

### Verdict Logic
- **INVESTIGATE:** (price < median AND motivation signal present) OR (subdivision zoning R30/R40/R60) OR (land ≥800sqm) — **AND passes red flag check**. Action: call agent today, request contract, book B&P inspection.
- **MONITOR:** Standard listing, no strong signals. Action: set price alert, revisit if DOM >30d or price drops 3%+.
- **AVOID:** Red flag found in description. Do not pursue.

### Yield & Cashflow Calculation
```
Gross yield = (weekly_rent × 52) / purchase_price × 100
Weekly cashflow = weekly_rent − (purchase_price × 0.062 / 52)
```
Use suburb median rent adjusted for bed count (4bed = +$80-100pw vs 3bed).

### Output Schema
```json
{
  "SuburbName": {
    "suburb": "Kirwan", "state": "QLD",
    "items": [{
      "addr": "12 Smith St, Kirwan, QLD 4817",
      "price": "$550,000", "priceNumeric": 550000,
      "beds": 4, "baths": 2, "car": 2, "land": "700sqm",
      "dom": 28,
      "verdict": "INVESTIGATE", "motivation": "HIGH",
      "motivationSignal": "28d DOM + price reduced $15k",
      "yieldEst": "5.0%", "cashflowEst": "-$42pw",
      "valueAdd": "700sqm — granny flat potential",
      "reason": "INVESTIGATE — Below median, 28d DOM, price reduced. Large block for granny flat. ACTION: call agent, request contract, book B&P.",
      "url": "https://..."
    }],
    "collected": 10,
    "discarded": { "overBudget": 3, "strata": 2, "lowBeds": 1 },
    "analysedAt": "DD Mon HH:MM",
    "source": "REIWA/WebSearch"
  }
}
```

### Delivering the Top 10
After scanning ALL suburbs, compile a **TOP 10 PROPERTIES** summary at the end:
- Ranked by investment quality (growth potential × affordability × quality check pass)
- Mix of states (not all WA)
- Each with: address, price, suburb, state, yield, growth context, value-add angle, why it's in the top 10
- Include the specific action to take for each (which agent to call, what to request)

---

## Agent 5: Due Diligence
**Trigger:** `/run-dd [address] [price]`
**Dependencies:** User provides documents (contract, building report, pest report, strata)
**Output:** `public/data/dd.json`

### Process
1. Read uploaded documents
2. Analyze for red flags, yellow flags, kill-deal items
3. Identify negotiation leverage
4. Estimate hold costs
5. Generate before-exchange checklist

### Output Schema
```json
{
  "address": "full address",
  "killDeal": false, "killDealReason": null,
  "overallRisk": "LOW|MEDIUM|HIGH",
  "summary": "2-3 sentences",
  "redFlags": [{ "issue": "what", "impact": "severity", "action": "what to do" }],
  "yellowFlags": [{ "issue": "...", "impact": "...", "action": "..." }],
  "negotiationLeverage": [{ "item": "...", "estimatedValue": "$X", "howToUse": "..." }],
  "holdCostEstimate": { "councilRates": "$X/yr", "insurance": "$X/yr", "management": "$X/yr", "totalWeekly": "$X/wk" },
  "beforeExchangeChecklist": ["Get building and pest inspection", "Check flood overlay with council"],
  "seekSolicitorAdvice": ["Specific clause to flag with solicitor"]
}
```

---

## QLD Land Tax Reference
Second QLD property: land values aggregated. Individual threshold $600k.
- Existing Murrumba Downs townhouse land value: ~$300-400k
- New QLD investment (e.g. Kirwan $550k house) land value: ~$150-250k
- Combined: ~$450-650k → at or near threshold
- Estimated extra cost: **$0-1,500/yr** (~$30/wk worst case)
- At 28% growth on $550k = $154k gain over 5yr. Land tax = ~$7,500 total = 5% of gain. **Growth justifies the tax.**
