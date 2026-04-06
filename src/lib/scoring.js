/**
 * Score a single DSR metric value on a 0-100 scale.
 * Higher is better for investment.
 */
export function scoreMetric(metric, value) {
  if (value === null || value === undefined) return null;

  switch (metric) {
    case 'dom': // Days on market — lower is better
      if (value <= 10) return 98;
      if (value <= 15) return 90;
      if (value <= 21) return 80;
      if (value <= 30) return 65;
      if (value <= 45) return 50;
      return 30;

    case 'vacancy': // % — lower is better
      if (value <= 0.5) return 98;
      if (value <= 1.0) return 90;
      if (value <= 1.5) return 75;
      if (value <= 2.0) return 60;
      if (value <= 3.0) return 40;
      return 20;

    case 'yield': // % — higher is better for hold cost
      if (value >= 6.0) return 95;
      if (value >= 5.5) return 88;
      if (value >= 5.0) return 78;
      if (value >= 4.5) return 65;
      if (value >= 4.0) return 55;
      if (value >= 3.5) return 40;
      return 25;

    case 'priceGrowth': // % annual — higher is better (growth weighted 2x)
      if (value >= 25) return 98;
      if (value >= 18) return 90;
      if (value >= 12) return 80;
      if (value >= 8) return 68;
      if (value >= 5) return 55;
      return 35;

    case 'supplyOnMarket': // % or months — lower is better
      if (value <= 0.1) return 98;
      if (value <= 0.3) return 88;
      if (value <= 0.5) return 75;
      if (value <= 1.0) return 60;
      if (value <= 2.0) return 45;
      return 30;

    case 'vendorDiscount': // % (negative = sellers discounting = buyer opportunity)
      if (value <= -4) return 90;
      if (value <= -2) return 78;
      if (value <= -1) return 68;
      if (value <= 0) return 55;
      return 40;

    case 'renterPercent': // % — moderate is best (too high = investor-led risk)
      if (value >= 20 && value <= 30) return 85;
      if (value >= 15 && value <= 35) return 75;
      if (value >= 35 && value <= 45) return 55;
      if (value > 45) return 35;
      return 60;

    case 'unitToHouseRatio': // % units — lower = more houses = less supply competition
      if (value <= 5) return 95;
      if (value <= 10) return 85;
      if (value <= 20) return 70;
      if (value <= 35) return 55;
      return 40;

    case 'auctionClearance': // % — higher indicates demand
      if (value >= 80) return 95;
      if (value >= 70) return 82;
      if (value >= 60) return 68;
      if (value >= 50) return 52;
      return 35;

    default:
      return null;
  }
}

/**
 * Compute growth-weighted composite score.
 * priceGrowth counts 2x in the average.
 */
export function compositeScore(metrics) {
  let total = 0;
  let count = 0;

  for (const [key, value] of Object.entries(metrics)) {
    const score = scoreMetric(key, value);
    if (score === null) continue;
    const weight = key === 'priceGrowth' ? 2 : 1;
    total += score * weight;
    count += weight;
  }

  return count > 0 ? Math.round(total / count) : null;
}

export function scoreColor(score) {
  if (score === null) return '#64748b';
  if (score >= 70) return '#22c55e';
  if (score >= 55) return '#f59e0b';
  return '#ef4444';
}
