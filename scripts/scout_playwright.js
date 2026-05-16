/**
 * AUS Buyer Agent — Playwright Listing Scout (Adelaide Metro Focus)
 *
 * Runs a REAL Chromium browser to scrape realestate.com.au + domain.com.au.
 * Must run from a residential IP (your home PC) — datacenter IPs are blocked.
 *
 * Usage:
 *   node scripts/scout_playwright.js                          # scan all default suburbs
 *   node scripts/scout_playwright.js --suburbs "Para Hills,Ingle Farm"  # specific suburbs
 *   node scripts/scout_playwright.js --headed                 # show browser window (debug)
 *   node scripts/scout_playwright.js --screenshot             # save screenshots on error
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LISTINGS_FILE = path.join(__dirname, '..', 'public', 'data', 'listings.json');
const SUBURBS_FILE = path.join(__dirname, '..', 'public', 'data', 'suburbs.json');
const SCREENSHOT_DIR = path.join(__dirname, '..', 'debug');
const BUDGET = 800000;

// Adelaide metro suburbs — established, low-medium crime, within 30min Osborne
const DEFAULT_SUBURBS = [
  { name: 'Para Hills',        postcode: '5096', median: 750000, r3: 555, r4: 610 },
  { name: 'Para Hills West',   postcode: '5096', median: 720000, r3: 545, r4: 600 },
  { name: 'Ingle Farm',        postcode: '5098', median: 780000, r3: 570, r4: 630 },
  { name: 'Salisbury',         postcode: '5108', median: 722000, r3: 545, r4: 600 },
  { name: 'Salisbury East',    postcode: '5109', median: 700000, r3: 540, r4: 595 },
  { name: 'Parafield Gardens', postcode: '5107', median: 780000, r3: 570, r4: 630 },
  { name: 'Gepps Cross',       postcode: '5094', median: 680000, r3: 530, r4: 590 },
  { name: 'Pooraka',           postcode: '5095', median: 720000, r3: 550, r4: 610 },
  { name: 'Greenacres',        postcode: '5086', median: 760000, r3: 560, r4: 620 },
  { name: 'Clearview',         postcode: '5085', median: 740000, r3: 555, r4: 615 },
  { name: 'Enfield',           postcode: '5085', median: 770000, r3: 565, r4: 625 },
  { name: 'Modbury',           postcode: '5092', median: 720000, r3: 540, r4: 600 },
  { name: 'Modbury North',     postcode: '5092', median: 690000, r3: 530, r4: 590 },
  { name: 'Prospect',          postcode: '5082', median: 850000, r3: 580, r4: 640 },
  { name: 'Valley View',       postcode: '5093', median: 700000, r3: 540, r4: 600 },
  { name: 'Walkley Heights',   postcode: '5098', median: 740000, r3: 550, r4: 610 },
];

const STATE = 'SA';

const RED_FLAGS = ['mould', 'mold', 'asbestos', 'termite', 'white ant', 'sold as is',
  'as is where is', 'structural damage', 'subsidence', 'fire damage', 'flood damage'];
const VALUE_KWS = ['r40', 'r30', 'r60', 'subdivision', 'granny flat', 'corner block',
  'development potential', 'dual occupancy', 'subdivide', 'duplex potential'];
const STALE_KWS = ['under offer', 'under contract', 'sold', 'withdrawn', 'off market',
  'settlement', 'exchanged', 'auction results'];
const STREET_RE = /(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Close|Cl|Crescent|Cres|Place|Pl|Way|Lane|Ln|Parade|Pde|Terrace|Tce|Circuit|Cct|Boulevard|Blvd|Grove|Rise|View|Loop|Turn|Mews|Row)/i;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function scrapeREA(page, suburb, opts = {}) {
  const { name, postcode } = suburb;
  const slug = `${name.toLowerCase().replace(/\s+/g, '-')},+sa+${postcode}`;
  const listings = [];
  const seenAddrs = new Set();

  for (let pageNum = 1; pageNum <= 8; pageNum++) {
    const url = `https://www.realestate.com.au/buy/property-house+between-0-${BUDGET}-in-${slug}/list-${pageNum}`;
    console.log(`    REA page ${pageNum}...`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000 + Math.random() * 3000);
    } catch (e) {
      console.log(`    Failed to load: ${e.message.slice(0, 60)}`);
      if (opts.screenshot) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `error-rea-${name}-p${pageNum}.png`) }).catch(() => {});
      }
      break;
    }

    const content = await page.content();

    if (content.includes('Access Denied') || content.includes('Just a moment')) {
      console.log('    ✗ BLOCKED by REA (Access Denied / Cloudflare)');
      if (opts.screenshot) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `blocked-rea-${name}.png`) }).catch(() => {});
      }
      break;
    }

    if (content.length < 10000) {
      console.log(`    ✗ Page too small (${content.length} bytes) — likely empty results`);
      break;
    }

    // Try structured card selectors first
    const cards = await page.$$('[data-testid*="listing-card"], [class*="residential-card"], [class*="listing-result"], article[class*="card"]');

    if (cards.length > 0) {
      for (const card of cards) {
        try {
          const text = await card.textContent();
          const textLower = text.toLowerCase();
          if (STALE_KWS.some(kw => textLower.includes(kw))) continue;

          // Address from heading or address element
          let addr = null;
          for (const sel of ['h2', 'h3', '[class*="address"]', '[data-testid*="address"]', 'a[class*="details"]']) {
            const el = await card.$(sel);
            if (el) {
              const t = (await el.textContent()).trim();
              if (/^\d/.test(t) && STREET_RE.test(t)) { addr = t; break; }
            }
          }
          if (!addr) continue;

          const addrKey = addr.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (seenAddrs.has(addrKey)) continue;
          seenAddrs.add(addrKey);

          // Price
          let priceNum = null, priceText = 'Contact Agent';
          const pm = text.match(/\$\s*([\d,]+)/);
          if (pm) {
            const v = parseInt(pm[1].replace(/,/g, ''));
            if (v >= 100000 && v <= BUDGET) { priceNum = v; priceText = `$${pm[1]}`; }
            else if (v > BUDGET) continue;
          }

          // Specs
          const beds = (text.match(/(\d)\s*[Bb]ed/) || [])[1];
          const baths = (text.match(/(\d)\s*[Bb]ath/) || [])[1];
          const car = (text.match(/(\d)\s*(?:[Cc]ar|[Gg]arage|[Pp]arking)/) || [])[1];
          if (beds && parseInt(beds) < 3) continue;

          let landSqm = null;
          const lm = text.match(/(\d{2,5})\s*(?:m²|m2|sqm)/i);
          if (lm) { const v = parseInt(lm[1]); if (v >= 100 && v <= 5000) landSqm = v; }

          // Listing URL
          let listingUrl = url;
          const linkEl = await card.$('a[href*="/property-"]');
          if (linkEl) {
            const href = await linkEl.getAttribute('href');
            listingUrl = href.startsWith('http') ? href : `https://www.realestate.com.au${href}`;
          }

          const fullAddr = addr.includes(STATE) ? addr : `${addr}, ${name}, ${STATE} ${postcode}`;

          listings.push({
            addr: fullAddr, price: priceText, priceNumeric: priceNum,
            beds: beds ? parseInt(beds) : null, baths: baths ? parseInt(baths) : null,
            car: car ? parseInt(car) : null,
            land: landSqm ? `${landSqm}sqm` : null, landSqm,
            url: listingUrl, snippet: text.slice(0, 200),
          });
        } catch (e) { /* skip unparseable card */ }
      }
    } else {
      // Fallback: regex the full HTML
      for (const m of content.matchAll(/(\d+[A-Za-z]?\s+[\w\s']+?(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Close|Cl|Crescent|Cres|Place|Pl|Way|Lane|Ln|Parade|Pde|Terrace|Tce|Circuit|Cct|Boulevard|Blvd|Grove|Rise|View|Loop|Turn|Mews|Row)\w*)/gi)) {
        const addr = m[1].trim();
        if (addr.length < 10) continue;
        const addrKey = addr.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (seenAddrs.has(addrKey)) continue;
        seenAddrs.add(addrKey);
        listings.push({
          addr: `${addr}, ${name}, ${STATE} ${postcode}`,
          price: 'Contact Agent', priceNumeric: null,
          beds: null, baths: null, car: null, land: null, landSqm: null,
          url, snippet: '',
        });
      }
    }

    console.log(`    ${listings.length} listings extracted`);

    // Check for next page
    const hasNext = await page.$('a[rel="next"], [aria-label="Next page"], button:has-text("Next")');
    if (!hasNext || listings.length > 80) break;

    await sleep(2000 + Math.random() * 3000);
  }

  return listings;
}

async function scrapeDomain(page, suburb, opts = {}) {
  const { name, postcode } = suburb;
  const slug = `${name.toLowerCase().replace(/\s+/g, '-')}-sa-${postcode}`;
  const listings = [];
  const seenAddrs = new Set();

  for (let pageNum = 1; pageNum <= 5; pageNum++) {
    const url = `https://www.domain.com.au/sale/${slug}/?ptype=house&price=0-${BUDGET}&page=${pageNum}`;
    console.log(`    Domain page ${pageNum}...`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000 + Math.random() * 3000);
    } catch (e) {
      console.log(`    Failed: ${e.message.slice(0, 60)}`);
      break;
    }

    const content = await page.content();
    if (content.includes('Access Denied') || content.includes('Just a moment') || content.length < 5000) {
      console.log('    ✗ Blocked or empty');
      if (opts.screenshot) {
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, `blocked-domain-${name}.png`) }).catch(() => {});
      }
      break;
    }

    for (const m of content.matchAll(/(\d+[A-Za-z]?\s+[\w\s']+?(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Close|Cl|Crescent|Cres|Place|Pl|Way|Lane|Ln|Parade|Pde|Terrace|Tce|Circuit|Cct|Boulevard|Blvd|Grove|Rise|View|Loop|Turn|Mews|Row)\w*)/gi)) {
      const addr = m[1].trim();
      if (addr.length < 10) continue;
      const addrKey = addr.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seenAddrs.has(addrKey)) continue;
      seenAddrs.add(addrKey);

      // Try to extract price near the address
      const nearbyText = content.slice(Math.max(0, m.index - 200), m.index + 500);
      let priceNum = null, priceText = 'Contact Agent';
      const pm = nearbyText.match(/\$\s*([\d,]+)/);
      if (pm) {
        const v = parseInt(pm[1].replace(/,/g, ''));
        if (v >= 100000 && v <= BUDGET) { priceNum = v; priceText = `$${pm[1]}`; }
        else if (v > BUDGET) continue;
      }

      const beds = (nearbyText.match(/(\d)\s*[Bb]ed/) || [])[1];
      const baths = (nearbyText.match(/(\d)\s*[Bb]ath/) || [])[1];

      listings.push({
        addr: `${addr}, ${name}, ${STATE} ${postcode}`,
        price: priceText, priceNumeric: priceNum,
        beds: beds ? parseInt(beds) : null, baths: baths ? parseInt(baths) : null,
        car: null, land: null, landSqm: null, url, snippet: '',
      });
    }

    console.log(`    ${listings.length} listings`);
    const hasNext = await page.$('a[rel="next"], [aria-label*="next"]');
    if (!hasNext) break;
    await sleep(2000 + Math.random() * 2000);
  }

  return listings;
}

function enrichListing(item, suburb, suburbRisk) {
  const { median, r3, r4 } = suburb;
  let price = item.priceNumeric;
  let estimated = false;
  if (!price) { price = median; estimated = true; }

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
    reason = `AVOID — ${red.join(', ')}.`;
  } else {
    const inv = [];
    if (landSqm >= 800) inv.push(`${landSqm}sqm mega-block`);
    else if (landSqm >= 650) inv.push(`${landSqm}sqm large block`);
    if (values.length) inv.push(`Value-add: ${values.join(', ')}`);
    if (price && !estimated && price < median * 0.97) inv.push('Below median');
    if (y >= 5.0) inv.push(`Yield ${y}%`);

    if (inv.length >= 1) {
      if (supplyRisk === 'HIGH' || overallRisk === 'HIGH') {
        verdict = 'WATCH';
        reason = `WATCH — Supply risk. ${inv.join('. ')}`;
      } else {
        verdict = 'INVESTIGATE';
        reason = `INVESTIGATE — ${inv.slice(0, 3).join('. ')}. ACTION: Call agent, request contract, book B&P.`;
      }
    } else {
      verdict = 'MONITOR';
      reason = 'MONITOR — Standard listing.';
    }
  }

  const va = [];
  if (landSqm >= 700) va.push(`${landSqm}sqm — subdivision potential`);
  values.forEach(v => va.push(v));

  return {
    addr: item.addr,
    price: estimated ? `Contact Agent (est ~$${price.toLocaleString()})` : (item.price || 'Contact Agent'),
    priceNumeric: price, priceEstimated: estimated,
    beds: item.beds, baths: item.baths, car: item.car,
    land: item.land, dom: null, verdict,
    motivation: verdict === 'INVESTIGATE' ? 'HIGH' : 'LOW',
    motivationSignal: values.length ? values.join(', ') : 'None',
    yieldEst: `${y}%`, cashflowEst: `$${cf}pw`,
    valueAdd: va.length ? va.join(' · ') : 'Hold for growth',
    reason, url: item.url, redFlags: red,
  };
}

// ─── Main ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const headed = args.includes('--headed');
  const screenshot = args.includes('--screenshot');
  const suburbsArg = args.find((a, i) => args[i - 1] === '--suburbs');

  let targets = DEFAULT_SUBURBS;
  if (suburbsArg) {
    const names = suburbsArg.split(',').map(s => s.trim().toLowerCase());
    targets = DEFAULT_SUBURBS.filter(s => names.includes(s.name.toLowerCase()));
    if (!targets.length) {
      // Accept unknown suburbs with estimated medians
      targets = names.map(n => ({
        name: n.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
        postcode: '5000', median: 720000, r3: 550, r4: 610,
      }));
    }
  }

  // Filter over-budget suburbs
  targets = targets.filter(s => s.median <= BUDGET + 50000);

  if (screenshot) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const suburbRisks = {};
  if (fs.existsSync(SUBURBS_FILE)) {
    const sd = JSON.parse(fs.readFileSync(SUBURBS_FILE, 'utf8'));
    for (const s of (sd.suburbs || [])) suburbRisks[s.name.toLowerCase()] = s.riskFilter || {};
  }

  let existing = {};
  if (fs.existsSync(LISTINGS_FILE)) existing = JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8'));

  console.log(`\n[SCOUT] Adelaide Metro — ${targets.length} suburbs`);
  console.log(`[SCOUT] Mode: ${headed ? 'HEADED (visible browser)' : 'headless'}`);
  console.log(`[SCOUT] Screenshots: ${screenshot ? 'ON' : 'OFF'}\n`);

  const browser = await chromium.launch({
    headless: !headed,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  });

  const page = await ctx.newPage();
  let totalListings = 0, totalInvestigate = 0;
  const suburbResults = {};

  for (const suburb of targets) {
    const key = `${suburb.name} (${STATE})`;
    console.log(`[SA] ${suburb.name} (${suburb.postcode})`);

    let raw = await scrapeREA(page, suburb, { screenshot });

    if (raw.length === 0) {
      console.log('  REA returned 0, trying Domain...');
      raw = await scrapeDomain(page, suburb, { screenshot });
    }

    if (raw.length === 0) {
      console.log('  ✗ No listings from any source\n');
      suburbResults[suburb.name] = { count: 0, investigate: 0 };
      continue;
    }

    // Dedupe + require street type
    const seen = new Set();
    const unique = raw.filter(item => {
      const k = item.addr.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (seen.has(k)) return false;
      seen.add(k);
      return STREET_RE.test(item.addr);
    });

    const risk = suburbRisks[suburb.name.toLowerCase()] || {};
    const enriched = unique.map(item => enrichListing(item, suburb, risk));
    enriched.sort((a, b) => (a.verdict !== 'INVESTIGATE') - (b.verdict !== 'INVESTIGATE') || (b.priceNumeric || 0) - (a.priceNumeric || 0));

    const inv = enriched.filter(i => i.verdict === 'INVESTIGATE').length;
    totalListings += enriched.length;
    totalInvestigate += inv;
    suburbResults[suburb.name] = { count: enriched.length, investigate: inv };

    console.log(`  ✓ ${enriched.length} listings (${inv} INVESTIGATE)\n`);

    existing[key] = {
      suburb: suburb.name, state: STATE, items: enriched,
      collected: enriched.length,
      analysedAt: new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
      source: 'Playwright browser scrape (Adelaide metro)',
    };

    fs.writeFileSync(LISTINGS_FILE, JSON.stringify(existing, null, 2));
    await sleep(3000 + Math.random() * 4000);
  }

  await browser.close();

  console.log('═'.repeat(60));
  console.log('[SCOUT] COMPLETE');
  console.log(`  Suburbs: ${targets.length}`);
  console.log(`  Listings: ${totalListings}`);
  console.log(`  INVESTIGATE: ${totalInvestigate}`);
  console.log(`  Written to: ${LISTINGS_FILE}`);
  console.log('═'.repeat(60));

  // Write results summary for orchestrator to read
  const summary = { timestamp: new Date().toISOString(), suburbs: suburbResults, totalListings, totalInvestigate };
  fs.writeFileSync(path.join(__dirname, '..', 'debug', 'last-run.json'), JSON.stringify(summary, null, 2));

  return summary;
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});

module.exports = { DEFAULT_SUBURBS, main };
