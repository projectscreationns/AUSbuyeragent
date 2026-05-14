/**
 * AUS Buyer Agent — Playwright Listing Scout
 *
 * Runs a REAL browser to scrape realestate.com.au + domain.com.au.
 * Must run from a residential IP (your home PC) — datacenter IPs are blocked.
 *
 * Usage: node scripts/scout_playwright.js
 *        node scripts/scout_playwright.js --suburb Kirwan
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LISTINGS_FILE = path.join(__dirname, '..', 'public', 'data', 'listings.json');
const SUBURBS_FILE = path.join(__dirname, '..', 'public', 'data', 'suburbs.json');
const BUDGET = 800000;

const SUBURBS = [
  { name: 'Kirwan', state: 'QLD', postcode: '4817', median: 550000, r3: 500, r4: 580 },
  { name: 'Condon', state: 'QLD', postcode: '4815', median: 599000, r3: 500, r4: 580 },
  { name: 'Aitkenvale', state: 'QLD', postcode: '4814', median: 681000, r3: 520, r4: 600 },
  { name: 'Kelso', state: 'QLD', postcode: '4815', median: 580000, r3: 490, r4: 570 },
  { name: 'Mount Louisa', state: 'QLD', postcode: '4814', median: 620000, r3: 510, r4: 590 },
  { name: 'Para Hills', state: 'SA', postcode: '5096', median: 520000, r3: 480, r4: 560 },
  { name: 'Salisbury North', state: 'SA', postcode: '5108', median: 615000, r3: 510, r4: 590 },
  { name: 'Ingle Farm', state: 'SA', postcode: '5098', median: 700000, r3: 520, r4: 600 },
  { name: 'Parafield Gardens', state: 'SA', postcode: '5107', median: 650000, r3: 500, r4: 580 },
  { name: 'Gawler East', state: 'SA', postcode: '5118', median: 720000, r3: 520, r4: 600 },
  { name: 'Hampton Park', state: 'VIC', postcode: '3976', median: 680000, r3: 540, r4: 610 },
  { name: 'Cranbourne West', state: 'VIC', postcode: '3977', median: 695000, r3: 550, r4: 620 },
  { name: 'Narre Warren', state: 'VIC', postcode: '3805', median: 720000, r3: 560, r4: 630 },
  { name: 'Baldivis', state: 'WA', postcode: '6171', median: 750000, r3: 620, r4: 700 },
  { name: 'Wellard', state: 'WA', postcode: '6170', median: 710000, r3: 580, r4: 670 },
  { name: 'Mandurah', state: 'WA', postcode: '6210', median: 575000, r3: 520, r4: 600 },
  { name: 'Thornlie', state: 'WA', postcode: '6108', median: 680000, r3: 560, r4: 650 },
];

const RED_FLAGS = ['mould', 'mold', 'asbestos', 'termite', 'white ant', 'sold as is',
  'as is where is', 'structural damage', 'subsidence', 'fire damage', 'flood damage'];
const VALUE_KWS = ['r40', 'r30', 'r60', 'subdivision', 'granny flat', 'corner block',
  'development potential', 'dual occupancy', 'subdivide', 'duplex potential'];
const STALE_KWS = ['under offer', 'under contract', 'sold', 'withdrawn', 'off market',
  'settlement', 'exchanged', 'auction results'];
const STREET_TYPES = /(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Close|Cl|Crescent|Cres|Place|Pl|Way|Lane|Ln|Parade|Pde|Terrace|Tce|Circuit|Cct|Boulevard|Blvd|Grove|Rise|View|Loop|Turn|Mews|Row)/i;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function scrapeREA(page, suburb) {
  const { name, state, postcode } = suburb;
  const slug = `${name.toLowerCase().replace(/\s+/g, '-')},+${state.toLowerCase()}+${postcode}`;
  const listings = [];
  const seenAddrs = new Set();

  for (let pageNum = 1; pageNum <= 5; pageNum++) {
    const url = `https://www.realestate.com.au/buy/property-house-in-${slug}/list-${pageNum}`;
    console.log(`    Page ${pageNum}: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000 + Math.random() * 2000);
    } catch (e) {
      console.log(`    Failed to load page ${pageNum}: ${e.message.slice(0, 80)}`);
      break;
    }

    const content = await page.content();
    if (content.includes('Access Denied') || content.includes('blocked')) {
      console.log('    Blocked by REA — try from a different IP');
      break;
    }

    // Extract listing cards using data attributes or class patterns
    const cards = await page.$$('article[data-testid], [class*="residential-card"], [class*="card-container"]');

    if (cards.length === 0) {
      // Fallback: regex parse the HTML
      const addrMatches = content.matchAll(/(\d+[A-Za-z]?\s+[\w\s']+?(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Close|Cl|Crescent|Cres|Place|Pl|Way|Lane|Ln|Parade|Pde|Terrace|Tce|Circuit|Cct|Boulevard|Blvd|Grove|Rise|View|Loop|Turn|Mews|Row)\w*)/gi);

      for (const m of addrMatches) {
        const addr = m[1].trim();
        const addrKey = addr.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seenAddrs.has(addrKey)) continue;
        if (addr.length < 10) continue;

        seenAddrs.add(addrKey);
        listings.push({
          addr: `${addr}, ${name}, ${state} ${postcode}`,
          price: 'Contact Agent',
          priceNumeric: null,
          beds: null, baths: null, car: null,
          land: null, url: url,
        });
      }
    } else {
      for (const card of cards) {
        try {
          const text = await card.textContent();
          const html = await card.innerHTML();

          // Address
          const addrEl = await card.$('[class*="address"], [data-testid*="address"], h2, h3');
          let addr = addrEl ? (await addrEl.textContent()).trim() : null;
          if (!addr || !STREET_TYPES.test(addr)) continue;
          if (!/^\d/.test(addr)) continue;

          const addrKey = addr.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (seenAddrs.has(addrKey)) continue;
          seenAddrs.add(addrKey);

          // Skip stale
          const textLower = text.toLowerCase();
          if (STALE_KWS.some(kw => textLower.includes(kw))) continue;

          // Price
          let priceNum = null;
          let priceText = 'Contact Agent';
          const priceMatch = text.match(/\$([\d,]+)/);
          if (priceMatch) {
            const v = parseInt(priceMatch[1].replace(/,/g, ''));
            if (v >= 100000 && v <= BUDGET) {
              priceNum = v;
              priceText = `$${priceMatch[1]}`;
            } else if (v > BUDGET) {
              continue; // over budget
            }
          }

          // Beds/baths/car
          const bedsMatch = text.match(/(\d)\s*(?:bed|Bed)/);
          const bathsMatch = text.match(/(\d)\s*(?:bath|Bath)/);
          const carMatch = text.match(/(\d)\s*(?:car|Car|garage|parking)/i);
          const beds = bedsMatch ? parseInt(bedsMatch[1]) : null;
          const baths = bathsMatch ? parseInt(bathsMatch[1]) : null;
          const car = carMatch ? parseInt(carMatch[1]) : null;

          if (beds !== null && beds < 3) continue;

          // Land
          let landSqm = null;
          const landMatch = text.match(/(\d{2,5})\s*(?:m²|m2|sqm)/i);
          if (landMatch) {
            const v = parseInt(landMatch[1]);
            if (v >= 100 && v <= 5000) landSqm = v;
          }

          // Listing URL
          const linkEl = await card.$('a[href*="/property-"]');
          const listingUrl = linkEl ? `https://www.realestate.com.au${await linkEl.getAttribute('href')}` : url;

          const fullAddr = addr.includes(state) ? addr : `${addr}, ${name}, ${state} ${postcode}`;

          listings.push({
            addr: fullAddr,
            price: priceText,
            priceNumeric: priceNum,
            beds, baths, car,
            land: landSqm ? `${landSqm}sqm` : null,
            landSqm,
            url: listingUrl,
            snippet: text.slice(0, 200),
          });
        } catch (e) {
          // Skip unparseable cards
        }
      }
    }

    console.log(`    ${listings.length} listings so far`);

    // Check if there's a next page
    const nextBtn = await page.$('[class*="next"], [aria-label*="next"], a[rel="next"]');
    if (!nextBtn) break;

    await sleep(2000 + Math.random() * 3000);
  }

  return listings;
}

async function scrapeDomain(page, suburb) {
  const { name, state, postcode } = suburb;
  const slug = `${name.toLowerCase().replace(/\s+/g, '-')}-${state.toLowerCase()}-${postcode}`;
  const listings = [];
  const seenAddrs = new Set();

  for (let pageNum = 1; pageNum <= 3; pageNum++) {
    const url = `https://www.domain.com.au/sale/${slug}/?ptype=house&price=0-${BUDGET}&page=${pageNum}`;
    console.log(`    Domain page ${pageNum}`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(3000 + Math.random() * 2000);
    } catch (e) {
      console.log(`    Failed: ${e.message.slice(0, 80)}`);
      break;
    }

    const content = await page.content();
    if (content.includes('Access Denied') || content.length < 5000) break;

    // Parse addresses from HTML
    const addrMatches = content.matchAll(/(\d+[A-Za-z]?\s+[\w\s']+?(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Close|Cl|Crescent|Cres|Place|Pl|Way|Lane|Ln|Parade|Pde|Terrace|Tce|Circuit|Cct|Boulevard|Blvd|Grove|Rise|View|Loop|Turn|Mews|Row)\w*)/gi);

    for (const m of addrMatches) {
      const addr = m[1].trim();
      const addrKey = addr.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seenAddrs.has(addrKey) || addr.length < 10) continue;
      seenAddrs.add(addrKey);

      listings.push({
        addr: `${addr}, ${name}, ${state} ${postcode}`,
        price: 'Contact Agent',
        priceNumeric: null,
        beds: null, baths: null, car: null,
        land: null, url,
      });
    }

    console.log(`    ${listings.length} listings so far`);
    await sleep(2000 + Math.random() * 2000);
  }

  return listings;
}

function enrichListing(item, suburb, suburbRisk) {
  const { median, r3, r4 } = suburb;
  let price = item.priceNumeric;
  let estimated = false;

  if (!price) {
    price = median;
    estimated = true;
  }

  const beds = item.beds;
  const landSqm = item.landSqm || 0;
  let rent = (beds && beds >= 4) ? r4 : r3;
  if (landSqm >= 700) rent += 30;

  const y = Math.round(rent * 52 / price * 1000) / 10;
  const cf = Math.round(rent - price * 0.062 / 52);

  const combined = `${item.addr} ${item.snippet || ''} ${item.price}`.toLowerCase();
  const red = RED_FLAGS.filter(kw => combined.includes(kw));
  const values = VALUE_KWS.filter(kw => combined.includes(kw));

  const supplyRisk = suburbRisk?.supplyRisk?.rating || 'MEDIUM';
  const overallRisk = suburbRisk?.overallRisk || 'MEDIUM';

  let verdict, reason;
  if (red.length > 0) {
    verdict = 'AVOID';
    reason = `AVOID — Red flags: ${red.join(', ')}.`;
  } else {
    const invReasons = [];
    if (landSqm >= 800) invReasons.push(`${landSqm}sqm mega-block`);
    else if (landSqm >= 650) invReasons.push(`${landSqm}sqm large block`);
    if (values.length) invReasons.push(`Value-add: ${values.join(', ')}`);
    if (price && !estimated && price < median * 0.97) invReasons.push('Below suburb median');
    if (y >= 5.0) invReasons.push(`Yield ${y}%`);

    if (invReasons.length >= 1) {
      if (supplyRisk === 'HIGH' || overallRisk === 'HIGH') {
        verdict = 'WATCH';
        reason = `WATCH — Supply risk ${supplyRisk}. ${invReasons.join('. ')}`;
      } else {
        verdict = 'INVESTIGATE';
        reason = `INVESTIGATE — ${invReasons.slice(0, 3).join('. ')}. ACTION: Call agent, request contract, book B&P.`;
        if (supplyRisk === 'MEDIUM') reason = `⚠ SUPPLY RISK MEDIUM. ${reason}`;
      }
    } else {
      verdict = 'MONITOR';
      reason = 'MONITOR — Standard listing. Set price alert.';
    }
  }

  const va = [];
  if (landSqm >= 700) va.push(`${landSqm}sqm — granny flat/subdivision potential`);
  values.forEach(v => va.push(v));

  return {
    addr: item.addr,
    price: estimated ? `Contact Agent (est ~$${price.toLocaleString()})` : (item.price || 'Contact Agent'),
    priceNumeric: price,
    priceEstimated: estimated,
    beds: item.beds, baths: item.baths, car: item.car,
    land: item.land, dom: null,
    verdict,
    motivation: verdict === 'INVESTIGATE' ? 'HIGH' : (verdict === 'WATCH' ? 'MEDIUM' : 'LOW'),
    motivationSignal: values.length ? values.join(', ') : 'None',
    yieldEst: `${y}%`,
    cashflowEst: `$${cf}pw`,
    valueAdd: va.length ? va.join(' · ') : 'Hold for growth',
    reason,
    url: item.url,
    redFlags: red,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const suburbFilter = args.includes('--suburb') ? args[args.indexOf('--suburb') + 1] : null;

  let targets = SUBURBS;
  if (suburbFilter) {
    targets = SUBURBS.filter(s => s.name.toLowerCase() === suburbFilter.toLowerCase());
    if (!targets.length) {
      console.log(`Suburb '${suburbFilter}' not found. Available:`);
      SUBURBS.forEach(s => console.log(`  ${s.name} (${s.state})`));
      process.exit(1);
    }
  }

  // Load suburb risks
  const suburbRisks = {};
  if (fs.existsSync(SUBURBS_FILE)) {
    const sd = JSON.parse(fs.readFileSync(SUBURBS_FILE, 'utf8'));
    for (const s of (sd.suburbs || [])) {
      suburbRisks[s.name.toLowerCase()] = s.riskFilter || {};
    }
  }

  // Load existing listings
  let existing = {};
  if (fs.existsSync(LISTINGS_FILE)) {
    existing = JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8'));
  }

  console.log(`\n[SCOUT-PLAYWRIGHT] Starting — ${targets.length} suburbs`);
  console.log(`[SCOUT-PLAYWRIGHT] Using real Chromium browser\n`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  });

  const page = await ctx.newPage();
  let totalListings = 0;
  let totalInvestigate = 0;

  for (const suburb of targets) {
    const key = `${suburb.name} (${suburb.state})`;
    console.log(`[${suburb.state}] ${suburb.name} (${suburb.postcode})`);

    // Try REA first
    let rawListings = await scrapeREA(page, suburb);

    // If REA blocked, try Domain
    if (rawListings.length === 0) {
      console.log('  REA blocked, trying Domain...');
      rawListings = await scrapeDomain(page, suburb);
    }

    if (rawListings.length === 0) {
      console.log('  No listings found from any source');
      continue;
    }

    // Dedupe by address
    const seen = new Set();
    const unique = rawListings.filter(item => {
      const k = item.addr.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen.has(k)) return false;
      seen.add(k);
      return STREET_TYPES.test(item.addr);
    });

    // Enrich
    const risk = suburbRisks[suburb.name.toLowerCase()] || {};
    const enriched = unique.map(item => enrichListing(item, suburb, risk));

    enriched.sort((a, b) => {
      if (a.verdict !== b.verdict) {
        const order = { INVESTIGATE: 0, WATCH: 1, MONITOR: 2, AVOID: 3 };
        return (order[a.verdict] || 99) - (order[b.verdict] || 99);
      }
      return (b.priceNumeric || 0) - (a.priceNumeric || 0);
    });

    const inv = enriched.filter(i => i.verdict === 'INVESTIGATE').length;
    totalListings += enriched.length;
    totalInvestigate += inv;

    console.log(`  ✓ ${enriched.length} listings (${inv} INVESTIGATE)\n`);

    existing[key] = {
      suburb: suburb.name,
      state: suburb.state,
      items: enriched,
      collected: enriched.length,
      analysedAt: new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      source: 'Playwright browser scrape',
    };

    // Save after each suburb
    fs.writeFileSync(LISTINGS_FILE, JSON.stringify(existing, null, 2));

    await sleep(5000 + Math.random() * 5000);
  }

  await browser.close();

  console.log('='.repeat(60));
  console.log('[SCOUT-PLAYWRIGHT] COMPLETE');
  console.log(`  Listings: ${totalListings}`);
  console.log(`  INVESTIGATE: ${totalInvestigate}`);
  console.log(`  Written to: ${LISTINGS_FILE}`);
  console.log('='.repeat(60));
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
