#!/usr/bin/env node

import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Deterministic seed from a string (simple djb2 hash)
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

// Convert a solution name to kebab-case for filenames
function toKebabCase(str) {
  return str.toLowerCase().replace(/\s+/g, "-");
}

function normalizedHash(str) {
  return hashString(str) / 0xffffffff;
}

// ---------------------------------------------------------------------------
// Data dimensions
// ---------------------------------------------------------------------------
const solutions = [
  { name: "Claude Code", model: "claude-sonnet-4.5", date: "2025-07-17" },
  { name: "Gemini-cli", model: "gemini-2.5-pro", date: "2025-07-17" },
  { name: "Codex", model: "gpt-5.3-codex", date: "2025-07-17" },
  { name: "Qwen-cli", model: "qwen3-coder-480b", date: "2025-07-17" },
];

const solutionTargets = {
  "Claude Code": { compileUnits: 135, runUnits: 70, layerPassBudget: 480 },
  "Gemini-cli": { compileUnits: 121, runUnits: 61, layerPassBudget: 285 },
  Codex: { compileUnits: 123, runUnits: 58, layerPassBudget: 240 },
  "Qwen-cli": { compileUnits: 55, runUnits: 22, layerPassBudget: 0 },
};

const conversionPairs = [
  { from: "spring", to: "quarkus" },
  { from: "spring", to: "liberty" },
  { from: "quarkus", to: "spring" },
  { from: "quarkus", to: "liberty" },
  { from: "liberty", to: "spring" },
  { from: "liberty", to: "quarkus" },
];

const pairDifficulty = {
  "spring->quarkus": 0.95,
  "quarkus->spring": 0.95,
  "spring->liberty": 0.85,
  "liberty->spring": 0.85,
  "quarkus->liberty": 0.8,
  "liberty->quarkus": 0.8,
};

const layers = [
  {
    id: "business domain",
    name: "Business Domain",
    apps: ["cart", "converter", "counter", "helloservice", "standalone"],
  },
  {
    id: "dependency injection",
    name: "Dependency Injection",
    apps: [
      "billpayment",
      "decorators",
      "encoder",
      "guessnumber",
      "producerfields",
      "producermethods",
      "simplegreeting",
    ],
  },
  {
    id: "persistence",
    name: "Persistence",
    apps: ["address-book", "order", "roster"],
  },
  {
    id: "presentation",
    name: "Presentation",
    apps: [
      "dukeetf",
      "dukeetf2",
      "fileupload",
      "hello-servlet",
      "jaxrs-customer",
      "jaxrs-hello",
      "jaxrs-rsvp",
      "mood",
      "websocketbot",
    ],
  },
  {
    id: "infrastructure",
    name: "Infrastructure",
    apps: [
      "concurrency-jobs",
      "concurrency-taskcreator",
      "ejb-async",
      "ejb-interceptor",
      "ejb-timersession",
    ],
  },
  {
    id: "whole applications",
    name: "Whole Applications",
    apps: [
      "cargotracker",
      "coffee-shop",
      "daytrader",
      "petclinic",
      "realworld",
    ],
  },
];

const layerDifficulty = {
  "business domain": 1.0,
  "dependency injection": 0.95,
  persistence: 0.9,
  presentation: 0.85,
  infrastructure: 0.8,
  "whole applications": 0.65,
};

// ---------------------------------------------------------------------------
// Deterministic tests_total per app (5..40)
// ---------------------------------------------------------------------------
const testsTotal = {};
for (const layer of layers) {
  for (const app of layer.apps) {
    const h = hashString(app);
    testsTotal[app] = 5 + (h % 36); // 5..40
  }
}

// ---------------------------------------------------------------------------
// Generate results
// ---------------------------------------------------------------------------
const REPEATS = 3;
const resultsBySolution = {};

const units = [];
for (const pair of conversionPairs) {
  const pairKey = `${pair.from}->${pair.to}`;
  for (const layer of layers) {
    for (const app of layer.apps) {
      units.push({
        from: pair.from,
        to: pair.to,
        pairKey,
        pairMod: pairDifficulty[pairKey],
        layer: layer.id,
        layerMod: layerDifficulty[layer.id],
        app,
        testsTotal: testsTotal[app],
      });
    }
  }
}

function selectTopUnits(solutionName, count, scoreFn, allowedSet = null) {
  return new Set(
    units
      .map((unit, idx) => ({ idx, score: scoreFn(solutionName, unit, idx) }))
      .filter(({ idx }) => allowedSet === null || allowedSet.has(idx))
      .sort((a, b) => b.score - a.score || a.idx - b.idx)
      .slice(0, count)
      .map(({ idx }) => idx),
  );
}

function compileScore(solutionName, unit, idx) {
  const noise = normalizedHash(`${solutionName}:compile:${idx}:${unit.app}`);
  const wholePenalty = unit.layer === "whole applications" ? -0.12 : 0;
  return (
    unit.layerMod * 0.55 + unit.pairMod * 0.25 + noise * 0.2 + wholePenalty
  );
}

function runScore(solutionName, unit, idx) {
  const noise = normalizedHash(`${solutionName}:run:${idx}:${unit.app}`);
  const wholePenalty = unit.layer === "whole applications" ? -0.25 : 0;
  return (
    unit.layerMod * 0.45 + unit.pairMod * 0.25 + noise * 0.3 + wholePenalty
  );
}

function passScore(solutionName, unit, idx) {
  const noise = normalizedHash(`${solutionName}:pass:${idx}:${unit.app}`);
  return unit.layerMod * 0.45 + unit.pairMod * 0.15 + noise * 0.4;
}

function allocatePassedTests(solutionName, runSet, budget) {
  const allocations = new Map();
  if (budget <= 0) return allocations;

  const eligible = units
    .map((unit, idx) => ({ unit, idx }))
    .filter(
      ({ unit, idx }) => runSet.has(idx) && unit.layer !== "whole applications",
    );

  if (eligible.length === 0) return allocations;

  const weights = eligible.map(({ unit, idx }) => ({
    idx,
    total: unit.testsTotal,
    weight: passScore(solutionName, unit, idx),
  }));

  const weightSum = weights.reduce((sum, item) => sum + item.weight, 0);
  let used = 0;

  for (const item of weights) {
    const share =
      weightSum > 0 ? Math.floor((budget * item.weight) / weightSum) : 0;
    const passed = Math.min(item.total, share);
    allocations.set(item.idx, passed);
    used += passed;
  }

  let remaining = budget - used;
  const refillOrder = [...weights].sort(
    (a, b) => b.weight - a.weight || a.idx - b.idx,
  );
  while (remaining > 0) {
    let changed = false;
    for (const item of refillOrder) {
      const current = allocations.get(item.idx) ?? 0;
      if (current >= item.total) continue;
      allocations.set(item.idx, current + 1);
      remaining -= 1;
      changed = true;
      if (remaining === 0) break;
    }
    if (!changed) break;
  }

  return allocations;
}

for (const solution of solutions) {
  const target = solutionTargets[solution.name];
  const compileSet = selectTopUnits(
    solution.name,
    target.compileUnits,
    compileScore,
  );
  const runSet = selectTopUnits(
    solution.name,
    target.runUnits,
    runScore,
    compileSet,
  );
  const passAllocations = allocatePassedTests(
    solution.name,
    runSet,
    target.layerPassBudget,
  );

  resultsBySolution[solution.name] = units.map((unit, idx) => {
    const compiled = compileSet.has(idx);
    const ran = runSet.has(idx);
    const passed =
      ran && unit.layer !== "whole applications"
        ? (passAllocations.get(idx) ?? 0)
        : 0;

    const repeats = Array.from({ length: REPEATS }, (_, repeatIdx) => {
      if (repeatIdx > 0) {
        return {
          compile: false,
          run: false,
          tests_passed: 0,
          tests_total: unit.testsTotal,
        };
      }

      return {
        compile: compiled,
        run: ran,
        tests_passed: passed,
        tests_total: unit.testsTotal,
      };
    });

    return {
      from: unit.from,
      to: unit.to,
      layer: unit.layer,
      app: unit.app,
      repeats,
    };
  });
}

// ---------------------------------------------------------------------------
// Write per-solution JSON files
// ---------------------------------------------------------------------------
const publicDir = resolve(__dirname, "..", "public");
const resultsDir = resolve(publicDir, "results");
mkdirSync(resultsDir, { recursive: true });

const solutionFiles = [];
let totalEntries = 0;

for (const solution of solutions) {
  const filename = `${toKebabCase(solution.name)}.json`;
  solutionFiles.push(filename);

  const solutionData = {
    solution: {
      name: solution.name,
      model: solution.model,
      date: solution.date,
    },
    results: resultsBySolution[solution.name],
  };

  const outPath = resolve(resultsDir, filename);
  writeFileSync(outPath, JSON.stringify(solutionData, null, 2) + "\n");
  totalEntries += resultsBySolution[solution.name].length;
  console.log(
    `✅  Wrote ${outPath} (${resultsBySolution[solution.name].length} results)`,
  );
}

// ---------------------------------------------------------------------------
// Write leaderboard index
// ---------------------------------------------------------------------------
const leaderboard = {
  layers: layers.map((l) => ({ id: l.id, name: l.name, apps: l.apps })),
  solutions: solutionFiles,
};

const indexPath = resolve(publicDir, "leaderboard.json");
writeFileSync(indexPath, JSON.stringify(leaderboard, null, 2) + "\n");

const totalRepeats = totalEntries * REPEATS;
console.log(`✅  Wrote ${indexPath}`);
console.log(
  `    ${solutions.length} solutions × ${conversionPairs.length} pairs × ${layers.reduce((s, l) => s + l.apps.length, 0)} apps = ${totalEntries} result entries (${totalRepeats} repeats)`,
);
