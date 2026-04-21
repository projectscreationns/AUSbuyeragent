# Multi-Agent Hierarchy — How /run-full works

When user says `/run-full`, Claude Code orchestrates 7 agents using the Agent tool.
Each agent runs on Max subscription (no API credits). Agents pass data via JSON files.

## The Hierarchy

```
ORCHESTRATOR (main Claude Code session)
│
├── Agent 1: MACRO SCANNER (background)
│   └── WebSearches RBA, ABS, SQM, CoreLogic
│   └── Writes public/data/macro.json
│
├── Agent 2: REGION RANKER (after Agent 1)
│   └── Reads macro.json
│   └── WebSearches 30+ regions across all states
│   └── Writes public/data/regions.json
│
├── Agent 3: SUBURB ANALYSTS (parallel, one per region)
│   ├── Agent 3a: WA suburbs
│   ├── Agent 3b: QLD suburbs
│   ├── Agent 3c: SA suburbs
│   └── Agent 3d: VIC suburbs
│   └── Each writes suburbs to a temp file, orchestrator merges
│
├── Agent 4: RISK AUDITOR (after Agent 3)
│   └── Reads suburbs.json
│   └── WebSearches supply risk, greenfield, market cycle
│   └── CORRECTS Agent 3's verdicts (downgrades where needed)
│   └── Updates suburbs.json with riskFilter field
│
├── Agent 5: LISTING SCOUTS (parallel, one per state)
│   ├── Agent 5a: WA via REIWA curl
│   ├── Agent 5b: QLD via Ray White curl
│   ├── Agent 5c: SA via Ray White curl
│   └── Agent 5d: VIC via Ray White curl
│   └── Each writes to temp file, orchestrator merges
│
├── Agent 6: QUALITY INSPECTOR (after Agent 5)
│   └── Reads ALL listing descriptions
│   └── Flags mould/asbestos/termites/sold-as-is/flood
│   └── REJECTS bad listings, downgrades to AVOID
│   └── Updates listings.json
│
└── Agent 7: LEARNING MODULE (after all stages)
    └── Reads feedback.json (past mistakes/successes)
    └── Compares current recommendations to past patterns
    └── Writes updated feedback.json with lessons learned
    └── Adjusts scoring weights if patterns emerge
```

## How agents teach each other

1. Risk Auditor (Agent 4) CORRECTS Suburb Analyst (Agent 3)
   - If Agent 3 says "BUY" but Agent 4 finds 43,800 new homes nearby → downgrade to WATCH
   - This correction is stored in feedback.json

2. Quality Inspector (Agent 6) REJECTS Listing Scout (Agent 5)
   - If Agent 5 says "INVESTIGATE" but Agent 6 finds mould in description → AVOID
   - This rejection is stored in feedback.json

3. Learning Module (Agent 7) IMPROVES future runs
   - Reads feedback.json: "Last run recommended Gawler but supply risk was HIGH"
   - Next run: Suburb Analyst is told "Previously flagged suburbs with supply risk: [list]"
   - Over time, the system gets better at avoiding known traps

## Feedback file: public/data/feedback.json
```json
{
  "version": 1,
  "runHistory": [
    {
      "date": "2026-04-21",
      "corrections": [
        { "agent": "Risk Auditor", "corrected": "Suburb Analyst",
          "suburb": "Gawler", "from": "BUY", "to": "WATCH",
          "reason": "43,800 new homes within 5km" }
      ],
      "rejections": [
        { "agent": "Quality Inspector", "rejected": "Listing Scout",
          "address": "7 Selkirk Road Armadale", "reason": "Mould in listing" }
      ],
      "topPicks": ["22 Sheperd Cct Kirwan QLD", "514 Sturt St Townsville QLD"],
      "lessonsLearned": [
        "Outer Adelaide fringe (Gawler/Two Wells) has massive supply pipeline — avoid for growth",
        "REIWA WA works via curl but rate limits after ~5 suburbs — stagger requests",
        "Ray White agent sites are the backdoor for QLD/SA/VIC listings"
      ]
    }
  ],
  "knownTraps": [
    { "suburb": "Two Wells SA", "reason": "43,800 new homes planned", "flaggedDate": "2026-04-21" },
    { "suburb": "Gawler SA", "reason": "Active greenfield estates + oversupply corridor", "flaggedDate": "2026-04-21" },
    { "suburb": "Smithfield SA", "reason": "BA Ratio 4.15% oversupply + high crime", "flaggedDate": "2026-04-21" },
    { "suburb": "Melton VIC", "reason": "Massive greenfield LGA + rail not funded", "flaggedDate": "2026-04-21" }
  ],
  "scoringAdjustments": [
    { "rule": "If suburb has >2000 new dwellings within 5km, cap growth forecast at 5%/yr", "addedDate": "2026-04-21" },
    { "rule": "If listing mentions 'sold as is', auto-AVOID regardless of other signals", "addedDate": "2026-04-21" },
    { "rule": "Corner blocks in R40 zones score +20 bonus in value-add ranking", "addedDate": "2026-04-21" }
  ]
}
```

## Execution flow for /run-full

1. Orchestrator reads CLAUDE.md + AGENTS.md + feedback.json
2. Spawns Agent 1 (macro) → waits for completion
3. Spawns Agent 2 (regions) with macro context → waits
4. Spawns Agents 3a-3d (suburbs) IN PARALLEL → waits for all
5. Merges suburb results into suburbs.json
6. Spawns Agent 4 (risk auditor) → corrects suburbs.json
7. Spawns Agents 5a-5d (listing scouts) IN PARALLEL → waits for all
8. Merges listing results into listings.json
9. Spawns Agent 6 (quality inspector) → corrects listings.json
10. Spawns Agent 7 (learning) → updates feedback.json
11. Commits all files, pushes, tells user to git pull + reload
