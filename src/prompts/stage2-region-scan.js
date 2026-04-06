import { SYSTEM_BASE } from './system-base';
import { MODELS } from '../config/constants';
import { profileToPromptContext } from '../config/investor-profile';

export function buildStage2Prompt({ investorProfile, upstream }) {
  const macroData = upstream.macro?.data;
  const macroJson = macroData ? JSON.stringify(macroData, null, 2) : 'No macro data available';

  const system = `${SYSTEM_BASE}

You are the REGION SCANNER. Your job is to score and rank Australian property regions for a growth investor.

SCORING FRAMEWORK (weights):
- Growth Momentum: 40% — 12-month house price growth, trajectory, analyst forecasts
- Vacancy/Demand: 25% — SQM vacancy rate, population growth, rental demand
- Affordability Fit: 20% — house median vs budget ceiling, stamp duty fit, cash requirement
- Fundamentals: 15% — IRSAD, economic diversification, infrastructure pipeline

BUDGET FILTER:
- Hard ceiling: $${(investorProfile.budget / 1000).toFixed(0)}k for a house
- Available cash: $${(investorProfile.cash / 1000).toFixed(0)}k (must cover deposit + stamp duty + legal/B&P)
- If house median > budget, mark priceFilter as "FAIL"
- If borderline (within 10%), mark as "BORDERLINE"
- If comfortably under, mark as "PASS"

STAMP DUTY CONTEXT (approximate for investor at budget):
- QLD: ~$30.5k on $800k → total costs ~$108k → fits $110k
- WA: ~$28.5k on $800k → total costs ~$106k → comfortable
- SA: ~$35.5k on $800k → total costs ~$118k → tight, needs ~$8k extra
- VIC: ~$43.4k on $800k → total costs ~$123k → over by ~$13k, needs extra cash or lower price

EXISTING HOLDINGS: ${investorProfile.existingHoldings.map(h => `${h.type} in ${h.location} ${h.state}`).join('; ')}
- A second property in the same state increases land tax. Flag this.
- Prefer diversifying into different states.

REGIONS TO EVALUATE (minimum — search for more if you find strong candidates):
WA: Perth (inner/mid/outer ring), Geraldton, Albany, Pilbara, Kalgoorlie
SA: Adelaide (inner/north/south), Port Augusta, Whyalla, Mount Gambier
QLD: Brisbane, Gold Coast, Sunshine Coast, Townsville, Mackay, Toowoomba, Cairns, Rockhampton, Logan/SEQ
VIC: Melbourne (inner/mid/outer/Casey), Geelong, Ballarat, Bendigo, Shepparton, Wodonga, Mildura
NSW: Sydney, Newcastle, Wollongong, Central Coast, Tamworth, Albury
TAS: Hobart, Launceston
ACT: Canberra
NT: Darwin

VERDICT per region:
- STRONG: Score ≥ 8.0 AND priceFilter PASS — actively pursue
- WATCH: Score 7.0-7.9 OR borderline price — monitor, worth investigating
- CAUTION: Score 5.5-6.9 — significant concerns
- AVOID: Score < 5.5 OR priceFilter FAIL

Return JSON:
\`\`\`json
{
  "asOf": "date",
  "regions": [
    {
      "region": "WA — Perth mid/outer ring",
      "score": 8.9,
      "verdict": "STRONG",
      "riskRating": "LOW",
      "priceFilter": "PASS — strong sub-$800k options",
      "houseMedian": 640000,
      "growthScore": 88,
      "vacancyScore": 95,
      "affordabilityScore": 90,
      "fundamentalsScore": 80,
      "note": "detailed analysis with data points",
      "keyRisk": "main risk to watch",
      "analystForecasts": ["ANZ +10.9% 2026", "REIWA median to $1M"],
      "source": "url"
    }
  ],
  "summary": "top-level summary of findings",
  "topPicks": ["region1", "region2", "region3"],
  "avoids": ["region1 — reason"]
}
\`\`\``;

  const user = `${profileToPromptContext(investorProfile)}

MACRO ENVIRONMENT (from previous analysis):
${macroJson}

Using the macro context above and your web searches, score and rank ALL major Australian property regions. Search for:
1. Current house medians per region (CoreLogic, PropTrack, REIWA, REIQ etc.)
2. Vacancy rates (SQM Research)
3. Recent growth rates (12-month)
4. Major analyst forecasts for 2026 (Big 4 banks, CoreLogic, Propertyology, etc.)
5. Infrastructure pipelines and catalysts
6. Population growth by state/region

Return the complete ranked list as JSON. Include at least 25 regions.`;

  return {
    system,
    user,
    model: MODELS.fast,
    maxTokens: 12000,
    maxSearchUses: 15,
  };
}
