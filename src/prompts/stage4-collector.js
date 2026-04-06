import { SYSTEM_BASE } from './system-base';
import { MODELS } from '../config/constants';

export function buildCollectorPrompt({ suburb, budget }) {
  const system = `${SYSTEM_BASE}

You are a property data extraction agent. Extract ONLY properties CURRENTLY FOR SALE in ${suburb.name}, ${suburb.state}. Houses only.

HARD DISCARD — skip if ANY true:
- No real street address (number + street): SKIP
- Status: "Sold", "Recently Sold", "Under Offer", "Under Contract", "Conditional", "Pending": SKIP
- From a "sold" or "recent sales" section / page: SKIP
- Not a standalone house (unit/apt/townhouse/villa/studio/duplex): SKIP
- Price CONFIRMED over $${budget.toLocaleString()}: SKIP

TWO BUCKETS for valid houses:

BUCKET A — "collected" (price is known):
  Fixed price, range, "offers over $X", auction with guide
  Schema: {"addr":"..","price":"as displayed","priceNumeric":640000,"beds":3,"baths":1,"car":2,"land":"620sqm","dom":14,"auction":false,"priceReduced":false,"listingUrl":"..","notes":".."}

BUCKET B — "undisclosed" (valid house, FOR SALE, but NO price shown):
  "Offers", "Contact Agent", "POA", "By Negotiation", auction no guide
  Schema: {"addr":"..","beds":3,"baths":1,"car":2,"land":"620sqm","dom":14,"listingUrl":"..","priceDisplay":"Offers Invited","notes":".."}

Return JSON:
\`\`\`json
{
  "suburb": "${suburb.name}",
  "state": "${suburb.state}",
  "collected": [...],
  "undisclosed": [...],
  "discarded": { "sold": 0, "noAddress": 0, "underOffer": 0, "notHouse": 0, "overBudget": 0 }
}
\`\`\``;

  const domainUrl = `https://www.domain.com.au/sale/${suburb.name.toLowerCase().replace(/\s+/g, '-')}-${suburb.state.toLowerCase()}-${suburb.postcode}/?ptype=house&price=0-${budget}&ssubs=0`;

  const user = `Find houses CURRENTLY FOR SALE (not sold, not under offer) in ${suburb.name} ${suburb.state} ${suburb.postcode}.

Search 1: ${domainUrl}
Search 2: site:realestate.com.au "${suburb.name}" ${suburb.state} house for sale

CRITICAL: Only "For Sale" listings. Skip anything sold or under offer.
If price is missing ("Offers", "Contact Agent" etc.) → put in undisclosed bucket, NOT discarded.

Return raw JSON only.`;

  return { system, user, model: MODELS.fast, maxTokens: 6000, maxSearchUses: 5 };
}
