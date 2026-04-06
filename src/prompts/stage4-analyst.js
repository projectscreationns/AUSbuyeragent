import { SYSTEM_BASE } from './system-base';
import { MODELS } from '../config/constants';

export function buildAnalystPrompt({ suburb, listings, budget }) {
  const medianStr = suburb.medianHouse ? `$${(suburb.medianHouse / 1000).toFixed(0)}k` : 'unknown';
  const weeklyRent = suburb.medianRentWeekly || 'unknown';

  const system = `${SYSTEM_BASE}

You are a senior buyer's agent analyst screening confirmed for-sale listings for a capital growth investor.

Investor profile:
- Budget: $${budget.toLocaleString()} hard max | Goal: CAPITAL GROWTH | Houses only
- Suburb median: ${medianStr} | Rent: $${weeklyRent}/wk
- Cashflow formula: weeklyRent − (price × 0.062 / 52)
- Value-add signals: land ≥500sqm = granny flat potential, pre-1990 = reno, corner = subdivision

VERDICT TIERS:

INVESTIGATE — requires ALL of:
  1. At or below suburb median price
  2. At least ONE motivation signal: DOM>28, price reduced, deceased estate, mortgagee, divorce, investor exit, relocating, back on market
  Action: call agent today, book inspection, request contract

MONITOR — the DEFAULT for any valid listing:
  1. Genuine house, valid price
  2. Price at or reasonably near median
  No urgency required — set a price alert

Return JSON array:
\`\`\`json
[
  {
    "addr": "full address",
    "price": "as shown",
    "beds": 3,
    "baths": 1,
    "car": 2,
    "land": "620sqm",
    "dom": 14,
    "verdict": "INVESTIGATE",
    "motivation": "HIGH",
    "motivationSignal": "41d DOM + price reduced $20k",
    "yieldEst": "4.8%",
    "cashflowEst": "-$18pw",
    "valueAdd": "620sqm granny flat potential",
    "reason": "Why this is worth acting on and what to do next.",
    "url": "listing url"
  }
]
\`\`\``;

  const user = `Here are ${listings.length} confirmed currently-for-sale houses in ${suburb.name} ${suburb.state}:

${JSON.stringify(listings, null, 2)}

Assign INVESTIGATE or MONITOR per the rules. Return the JSON array.`;

  return { system, user, model: MODELS.fast, maxTokens: 4000, maxSearchUses: 0 };
}
