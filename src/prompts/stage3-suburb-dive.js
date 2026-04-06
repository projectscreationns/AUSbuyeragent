import { SYSTEM_BASE } from './system-base';
import { MODELS } from '../config/constants';
import { profileToPromptContext } from '../config/investor-profile';

export function buildStage3Prompt({ investorProfile, upstream }) {
  const macroData = upstream.macro?.data;
  const regionData = upstream.regions?.data;
  const selectedRegions = upstream.regions?.selections || [];

  // Get the selected region details
  const regionDetails = regionData?.regions
    ?.filter(r => selectedRegions.includes(r.region))
    ?.map(r => `${r.region} (score: ${r.score}, median: $${r.houseMedian?.toLocaleString() || '?'})`)
    ?.join('\n  ') || 'No regions selected';

  const system = `${SYSTEM_BASE}

You are the SUBURB DEEP DIVE ANALYST. For each selected region, identify the best suburbs and perform comprehensive quantitative AND qualitative analysis.

FOR EACH SUBURB, RESEARCH:

═══ QUANTITATIVE (DSR-like metrics) ═══
For each metric, provide: value, score (0-100), source URL

1. DOM — Days on Market (median). Lower = stronger demand.
   Scoring: ≤10d=98, ≤15d=90, ≤21d=80, ≤30d=65, ≤45d=50, >45d=30
2. VACANCY — Vacancy rate %. Lower = tighter market.
   Scoring: ≤0.5%=98, ≤1%=90, ≤1.5%=75, ≤2%=60, ≤3%=40, >3%=20
3. YIELD — Gross rental yield %. Higher = better hold cost coverage.
   Scoring: ≥6%=95, ≥5.5%=88, ≥5%=78, ≥4.5%=65, ≥4%=55, ≥3.5%=40, <3.5%=25
4. PRICE GROWTH — 12-month house price growth %. This metric counts DOUBLE in composite.
   Scoring: ≥25%=98, ≥18%=90, ≥12%=80, ≥8%=68, ≥5%=55, <5%=35
5. SUPPLY ON MARKET — Stock on market / total dwellings. Lower = tighter.
   Scoring: ≤0.1%=98, ≤0.3%=88, ≤0.5%=75, ≤1%=60, ≤2%=45, >2%=30
6. VENDOR DISCOUNT — Average vendor discount from asking to sold. More negative = buyer opportunity.
   Scoring: ≤-4%=90, ≤-2%=78, ≤-1%=68, ≤0%=55, >0%=40
7. RENTER % — Percentage of suburb that rents. Moderate (20-30%) is ideal.
   Scoring: 20-30%=85, 15-35%=75, 35-45%=55, >45%=35
8. UNIT TO HOUSE RATIO — % units in suburb. Lower = less supply competition.
   Scoring: ≤5%=95, ≤10%=85, ≤20%=70, ≤35%=55, >35%=40
9. AUCTION CLEARANCE — If applicable. Higher = stronger demand.
   Scoring: ≥80%=95, ≥70%=82, ≥60%=68, ≥50%=52, <50%=35

═══ QUALITATIVE (Maximum Depth) ═══

10. INFRASTRUCTURE PROJECTS — Search for ALL active/planned projects:
    - Type: transport, hospital, education, commercial, road, defence, energy
    - Status: completed, under-construction, approved, proposed, delayed, cancelled
    - Expected completion, delay months, investment value
    - Impact rating on property values

11. CRIME & SAFETY — Search for suburb/LGA crime statistics:
    - Overall rating, trend direction, notable crime types
    - Comparison to state average
    - Source (QLD Police, WA Police, SAPOL, VicPol stats)

12. PUBLIC/SOCIAL HOUSING — Search for:
    - Existing public housing nearby
    - Planned social housing developments
    - Concentration level (none/low/moderate/high)
    - Impact on median prices

13. SCHOOLS — Search for nearby schools:
    - Primary and secondary schools with ratings/ICSEA scores
    - Overall quality assessment

14. HAZARDS — Search for:
    - Flood risk zone/overlay
    - Bushfire risk (BAL rating if WA/VIC/SA)
    - Coastal erosion (if applicable)

15. ZONING — Search council planning:
    - Current zoning (R20, R40, etc.)
    - Densification potential (subdivision/granny flat)
    - Recent rezonings or upcoming changes

16. DEVELOPMENT APPLICATIONS — Search for:
    - Major DAs nearby (apartments, commercial, industrial)
    - Scale and potential impact

17. DEMOGRAPHICS — Search for:
    - Age distribution trends (aging vs young families)
    - Household composition
    - IRSAD score

18. RENTAL DEMAND — Search for:
    - Tenant type breakdown
    - Rental market depth

19. CONNECTIVITY — Search for:
    - NBN technology type and speed
    - Public transport (train station distance, bus routes)

20. NOISE — Check for:
    - Flight path proximity
    - Highway/freeway adjacency
    - Industrial noise sources

═══ 5-YEAR FORWARD OUTLOOK ═══
For each suburb:
- Cycle stage: EARLY, EARLY-MID, MID, MID-LATE, LATE
- Bear case: conservative 5yr total growth %
- Base case: expected 5yr total growth %
- Bull case: optimistic 5yr total growth %
- Structural drivers (what supports long-term growth)
- Key risks (what could go wrong)
- Analyst views on record

Return JSON:
\`\`\`json
{
  "asOf": "date",
  "suburbs": [
    {
      "name": "Armadale",
      "state": "WA",
      "postcode": "6112",
      "lga": "City of Armadale",
      "region": "WA — Perth mid/outer ring",
      "medianHouse": 640000,
      "medianRentWeekly": 620,

      "quant": {
        "dom": { "value": 11, "score": 94, "source": "url" },
        "vacancy": { "value": 0.5, "score": 98, "source": "url" },
        "yield": { "value": 5.1, "score": 80, "source": "url" },
        "priceGrowth": { "value": 13.2, "score": 78, "source": "url" },
        "supplyOnMarket": { "value": 0.3, "score": 90, "source": "url" },
        "vendorDiscount": { "value": -0.8, "score": 90, "source": "url" },
        "renterPercent": { "value": 46, "score": 52, "source": "url" },
        "unitToHouseRatio": { "value": 3, "score": 96, "source": "url" },
        "auctionClearance": { "value": null, "score": null, "source": "N/A — Perth no auction market" }
      },
      "compositeScore": 82,

      "qual": {
        "infrastructure": [
          {
            "name": "Metronet Armadale Line Upgrade",
            "type": "transport",
            "status": "under-construction",
            "expectedCompletion": "2026-Q4",
            "delayMonths": 6,
            "investmentAud": 1200000000,
            "impactRating": "high",
            "source": "url",
            "notes": "Level crossing removals, new stations"
          }
        ],
        "crime": {
          "overallRating": "moderate",
          "trend": "improving",
          "notableTypes": ["property crime above state average but trending down"],
          "comparisonToState": "above-average",
          "source": "url"
        },
        "publicHousing": {
          "existingNearby": true,
          "plannedNearby": false,
          "concentration": "moderate",
          "details": "Some public housing in southern Armadale streets",
          "source": "url"
        },
        "schools": {
          "primary": [{ "name": "Armadale PS", "rating": null, "distance": "1km" }],
          "secondary": [{ "name": "Cecil Andrews College", "rating": null, "distance": "2km" }],
          "overallQuality": "average",
          "source": "url"
        },
        "hazards": {
          "flood": { "risk": "low", "zone": null, "source": "url" },
          "bushfire": { "risk": "medium", "zone": "BAL-12.5 in eastern areas", "source": "url" },
          "coastal": { "risk": "n/a", "source": "" }
        },
        "zoning": {
          "currentZoning": "R20/R40 mix",
          "densificationPotential": "medium",
          "recentRezonings": null,
          "councilPlan": "url",
          "source": "url"
        },
        "developmentApps": [
          { "description": "description", "scale": "small/medium/large", "impact": "positive/neutral/negative", "source": "url" }
        ],
        "demographics": {
          "medianAge": 33,
          "trend": "young families",
          "householdType": "families with children dominant",
          "irsad": 910,
          "source": "url"
        },
        "rentalDemand": {
          "tenantTypes": "FIFO workers, young families, healthcare workers",
          "marketDepth": "deep — 450+ sales/yr",
          "source": "url"
        },
        "connectivity": {
          "nbn": "FTTP",
          "publicTransport": "Train (Armadale line) + bus",
          "cbdDistance": "28km",
          "source": "url"
        },
        "noise": {
          "flightPath": false,
          "highway": false,
          "industrial": false,
          "notes": "Quiet residential"
        }
      },

      "forward": {
        "cycleStage": "MID",
        "bear": 18,
        "base": 35,
        "bull": 55,
        "horizon": "5yr to 2031",
        "drivers": ["driver1", "driver2"],
        "risks": ["risk1", "risk2"],
        "analystViews": ["ANZ: Perth +10.9% 2026", "REIWA: median to $1M"],
        "consensus": "2-3 sentence summary"
      },

      "verdict": "BUY",
      "topSignals": ["signal1", "signal2"],
      "watchPoints": ["watch1", "watch2"],
      "stampDutyNote": "At $640k: stamp ~$28k, total costs ~$96k — fits $110k easily"
    }
  ],
  "summary": "overall findings summary"
}
\`\`\``;

  const user = `${profileToPromptContext(investorProfile)}

MACRO CONTEXT:
${macroData ? JSON.stringify({ rba: macroData.rba, lending: macroData.lending, vacancy: macroData.vacancy }, null, 2) : 'Not available'}

SELECTED REGIONS TO DEEP DIVE:
  ${regionDetails}

For each selected region, identify 2-5 suburbs where house median ≤ $${(investorProfile.budget / 1000).toFixed(0)}k and perform the FULL quantitative + qualitative analysis as specified.

Search thoroughly for each suburb. This is the most critical analysis stage — the investor will use this to decide where to buy. Quality and accuracy matter more than speed.

Return the complete JSON.`;

  return {
    system,
    user,
    model: MODELS.fast,
    maxTokens: 16000,
    maxSearchUses: 20,
  };
}
