/**
 * AUS Buyer Agent — Agentic Orchestrator
 *
 * Runs the full pipeline in a loop:
 *   Pass 1: Scan all target suburbs
 *   Pass 2: Analyze results, expand to adjacent suburbs where results are strong
 *   Pass 3: Rescan expanded list, merge, rank
 *
 * Usage: node scripts/orchestrator.js
 *        node scripts/orchestrator.js --passes 3    # run 3 passes instead of 2
 *        node scripts/orchestrator.js --headed       # show browser (debug)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LISTINGS_FILE = path.join(__dirname, '..', 'public', 'data', 'listings.json');
const SUMMARY_FILE = path.join(__dirname, '..', 'debug', 'last-run.json');
const DEBUG_DIR = path.join(__dirname, '..', 'debug');

const ADJACENT = {
  'Para Hills':        ['Para Hills West', 'Para Vista', 'Valley View'],
  'Para Hills West':   ['Para Hills', 'Para Vista'],
  'Ingle Farm':        ['Walkley Heights', 'Pooraka', 'Valley View'],
  'Salisbury':         ['Salisbury East', 'Salisbury Heights', 'Brahma Lodge'],
  'Salisbury East':    ['Salisbury', 'Salisbury Heights'],
  'Parafield Gardens': ['Paralowie', 'Green Fields', 'Mawson Lakes'],
  'Gepps Cross':       ['Enfield', 'Clearview', 'Northgate', 'Pooraka'],
  'Pooraka':           ['Gepps Cross', 'Ingle Farm', 'Mawson Lakes'],
  'Greenacres':        ['Enfield', 'Clearview', 'Hampstead Gardens'],
  'Clearview':         ['Enfield', 'Greenacres', 'Gepps Cross'],
  'Enfield':           ['Clearview', 'Greenacres', 'Gepps Cross'],
  'Modbury':           ['Modbury North', 'Modbury Heights', 'Hope Valley'],
  'Modbury North':     ['Modbury', 'Modbury Heights'],
  'Valley View':       ['Para Hills', 'Para Vista', 'Ingle Farm'],
  'Walkley Heights':   ['Ingle Farm', 'Valley View'],
};

// Crime areas to NEVER scan
const BLACKLIST = [
  'Davoren Park', 'Elizabeth Vale', 'Bolivar', 'Edinburgh',
  'Salisbury Downs', 'Smithfield',
];

function runScout(suburbs, extraArgs = '') {
  const suburbList = suburbs.join(',');
  const cmd = `node "${path.join(__dirname, 'scout_playwright.js')}" --suburbs "${suburbList}" ${extraArgs}`;
  console.log(`\n[ORCHESTRATOR] Running scout for: ${suburbs.join(', ')}`);
  console.log(`[ORCHESTRATOR] Command: ${cmd}\n`);

  try {
    execSync(cmd, { stdio: 'inherit', timeout: 600000 });
  } catch (e) {
    console.log(`[ORCHESTRATOR] Scout exited with error: ${e.message.slice(0, 100)}`);
  }
}

function readSummary() {
  if (!fs.existsSync(SUMMARY_FILE)) return null;
  return JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8'));
}

function analyzeResults(summary) {
  if (!summary?.suburbs) return { strong: [], weak: [], dead: [] };

  const strong = [];
  const weak = [];
  const dead = [];

  for (const [name, data] of Object.entries(summary.suburbs)) {
    if (data.investigate >= 3) strong.push(name);
    else if (data.count >= 1) weak.push(name);
    else dead.push(name);
  }

  return { strong, weak, dead };
}

function getExpansionSuburbs(strongSuburbs, alreadyScanned) {
  const expansion = new Set();
  for (const name of strongSuburbs) {
    const adjacent = ADJACENT[name] || [];
    for (const adj of adjacent) {
      if (!alreadyScanned.has(adj) && !BLACKLIST.includes(adj)) {
        expansion.add(adj);
      }
    }
  }
  return [...expansion];
}

function printRanking() {
  if (!fs.existsSync(LISTINGS_FILE)) return;
  const listings = JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf8'));

  const allInvestigate = [];
  for (const [key, data] of Object.entries(listings)) {
    if (!data.state || data.state !== 'SA') continue;
    for (const item of (data.items || [])) {
      if (item.verdict === 'INVESTIGATE') {
        allInvestigate.push({ suburb: key, ...item });
      }
    }
  }

  allInvestigate.sort((a, b) => (a.priceNumeric || 999999) - (b.priceNumeric || 999999));

  console.log('\n' + '═'.repeat(60));
  console.log('TOP INVESTIGATE LISTINGS — Adelaide Metro');
  console.log('═'.repeat(60));

  for (let i = 0; i < Math.min(15, allInvestigate.length); i++) {
    const l = allInvestigate[i];
    const est = l.priceEstimated ? ' (est)' : '';
    console.log(`  ${i + 1}. ${l.addr}`);
    console.log(`     ${l.price}${est} | ${l.beds || '?'}bd/${l.baths || '?'}ba | ${l.land || '?'} | ${l.yieldEst}`);
    console.log(`     ${l.reason.slice(0, 80)}`);
  }

  const totalSA = Object.entries(listings)
    .filter(([, d]) => d.state === 'SA')
    .reduce((s, [, d]) => s + (d.items?.length || 0), 0);
  const totalInv = allInvestigate.length;

  console.log(`\nTotal SA listings: ${totalSA} | INVESTIGATE: ${totalInv}`);
}

async function main() {
  const args = process.argv.slice(2);
  const passes = parseInt((args.find((a, i) => args[i - 1] === '--passes') || '2'));
  const headed = args.includes('--headed') ? '--headed' : '';
  const screenshot = args.includes('--screenshot') ? '--screenshot' : '';
  const extraArgs = [headed, screenshot].filter(Boolean).join(' ');

  fs.mkdirSync(DEBUG_DIR, { recursive: true });

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  AUS BUYER AGENT — AGENTIC ORCHESTRATOR               ║');
  console.log('║  Adelaide Metro — AUKUS Catchment Analysis             ║');
  console.log(`║  Passes: ${passes} | Mode: ${headed ? 'HEADED' : 'headless'}                         ║`);
  console.log('╚════════════════════════════════════════════════════════╝');

  const allScanned = new Set();

  for (let pass = 1; pass <= passes; pass++) {
    console.log(`\n${'━'.repeat(60)}`);
    console.log(`PASS ${pass} of ${passes}`);
    console.log('━'.repeat(60));

    if (pass === 1) {
      // First pass: scan all default suburbs
      const { DEFAULT_SUBURBS } = require('./scout_playwright.js');
      const names = DEFAULT_SUBURBS
        .filter(s => s.median <= 800000 + 50000)
        .map(s => s.name);
      names.forEach(n => allScanned.add(n));
      runScout(names, extraArgs);
    } else {
      // Subsequent passes: analyze previous results and expand
      const summary = readSummary();
      const { strong, weak, dead } = analyzeResults(summary);

      console.log(`[ORCHESTRATOR] Pass ${pass - 1} results:`);
      console.log(`  Strong (3+ INVESTIGATE): ${strong.join(', ') || 'none'}`);
      console.log(`  Weak (some listings):    ${weak.join(', ') || 'none'}`);
      console.log(`  Dead (0 listings):       ${dead.join(', ') || 'none'}`);

      const expansion = getExpansionSuburbs(strong, allScanned);

      if (expansion.length === 0) {
        console.log(`[ORCHESTRATOR] No new suburbs to expand to. Stopping.`);
        break;
      }

      console.log(`[ORCHESTRATOR] Expanding to adjacent suburbs: ${expansion.join(', ')}`);
      expansion.forEach(n => allScanned.add(n));
      runScout(expansion, extraArgs);
    }
  }

  // Final ranking
  printRanking();

  console.log(`\n[ORCHESTRATOR] Total suburbs scanned: ${allScanned.size}`);
  console.log(`[ORCHESTRATOR] Scanned: ${[...allScanned].join(', ')}`);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(1);
});
