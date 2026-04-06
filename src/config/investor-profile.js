export const DEFAULT_PROFILE = {
  budget: 800000,
  cash: 110000,
  depositPercent: 10,
  lmi: true,
  strategy: 'capital-growth',
  horizon: '5yr',
  propertyType: 'house',
  existingHoldings: [
    { type: 'townhouse', location: 'Murrumba Downs', state: 'QLD', status: 'held' },
  ],
  preferredStates: ['WA', 'SA'],
  avoidStates: [],
  notes: 'Second QLD property = higher land tax. Prefer WA or SA for diversification.',
};

export function profileToPromptContext(profile) {
  const holdings = profile.existingHoldings
    .map(h => `${h.type} in ${h.location} ${h.state} (${h.status})`)
    .join('; ');

  return `INVESTOR PROFILE:
- Budget: $${(profile.budget / 1000).toFixed(0)}k hard ceiling
- Available cash: $${(profile.cash / 1000).toFixed(0)}k (for deposit + stamp duty + legal/B&P)
- Strategy: ${profile.depositPercent}% deposit + LMI at 90% LVR
- Goal: ${profile.strategy}, ${profile.horizon} buy-and-hold
- Property type: ${profile.propertyType} only
- Existing holdings: ${holdings}
- State preference: Prefer ${profile.preferredStates.join(', ')} for diversification
- Key constraint: ${profile.notes}`;
}
