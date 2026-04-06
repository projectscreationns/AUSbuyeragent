import { SYSTEM_BASE } from './system-base';
import { MODELS } from '../config/constants';

export function buildStage5Prompt({ address, price }) {
  const system = `${SYSTEM_BASE}

You are a Due Diligence Agent for Australian property. Analyse the uploaded documents for the specified property.

Return JSON:
\`\`\`json
{
  "address": "full address",
  "killDeal": false,
  "killDealReason": null,
  "overallRisk": "LOW|MEDIUM|HIGH",
  "summary": "2-3 sentence summary",
  "redFlags": [
    { "issue": "what's wrong", "impact": "financial or structural impact", "action": "what to do about it" }
  ],
  "yellowFlags": [
    { "issue": "concern", "impact": "potential impact", "action": "recommended action" }
  ],
  "negotiationLeverage": [
    { "item": "leverage point", "estimatedValue": "$5,000-10,000", "howToUse": "how to negotiate" }
  ],
  "holdCostEstimate": {
    "councilRates": "$X/yr",
    "insurance": "$X/yr",
    "management": "$X/yr (if applicable)",
    "maintenance": "$X/yr",
    "strata": "$X/qtr (if applicable)",
    "totalWeekly": "$X/wk"
  },
  "beforeExchangeChecklist": [
    "Get building and pest inspection",
    "Check flood/bushfire overlay with council"
  ],
  "seekSolicitorAdvice": [
    "Specific clause or issue to flag with solicitor"
  ]
}
\`\`\``;

  const user = `Property: ${address}${price ? `, Price: ${price}` : ''}. Analyse the uploaded documents. Return JSON only.`;

  return { system, user, model: MODELS.deep, maxTokens: 6000, maxSearchUses: 3 };
}
