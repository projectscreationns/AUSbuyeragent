export const STAGE_DEFS = [
  { id: 0, key: 'agents', label: 'Agent Activity', icon: '🧠', description: 'Live view of the 7-agent multi-agent system' },
  { id: 1, key: 'macro', label: 'Macro Environment', icon: '1', description: 'RBA, ABS, SQM — national property market conditions' },
  { id: 2, key: 'regions', label: 'Region Scan', icon: '2', description: 'Score and rank 30+ Australian regions within budget' },
  { id: 3, key: 'suburbs', label: 'Suburb Deep Dive', icon: '3', description: 'DSR metrics + qualitative analysis per suburb' },
  { id: 4, key: 'listings', label: 'Listing Scout', icon: '4', description: 'Live listings from Domain/REA with verdicts' },
  { id: 5, key: 'dd', label: 'Due Diligence', icon: '5', description: 'Risk analysis from property documents' },
];

export const SCORING_WEIGHTS = {
  growthMomentum: 0.40,
  vacancyDemand: 0.25,
  affordabilityFit: 0.20,
  fundamentals: 0.15,
};

export const DSR_METRICS = [
  'dom', 'vacancy', 'yield', 'priceGrowth', 'supplyOnMarket',
  'vendorDiscount', 'renterPercent', 'unitToHouseRatio', 'auctionClearance',
];

export const VERDICT_COLORS = {
  'STRONG BUY': '#22c55e',
  'STRONG': '#22c55e',
  'BUY': '#3b82f6',
  'INVESTIGATE': '#22c55e',
  'WATCH': '#f59e0b',
  'MONITOR': '#f59e0b',
  'CAUTION': '#f97316',
  'AVOID': '#ef4444',
  'PASS': '#64748b',
};

export const SIGNAL_COLORS = {
  GREEN: '#22c55e',
  AMBER: '#f59e0b',
  RED: '#ef4444',
};
