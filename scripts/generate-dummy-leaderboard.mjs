#!/usr/bin/env node

import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ---------------------------------------------------------------------------
// Seeded PRNG – mulberry32
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let t = (seed >>> 0) + 0x6d2b79f5;
  return function () {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Global seeded random – seed chosen for nice-looking results
const rand = mulberry32(123456789);

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

// Approximate gaussian via Box-Muller (uses our seeded rand)
function gaussianRand(mean, stddev) {
  const u1 = rand();
  const u2 = rand();
  const z = Math.sqrt(-2.0 * Math.log(u1 || 1e-10)) * Math.cos(2.0 * Math.PI * u2);
  return mean + z * stddev;
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

const solutionStrength = {
  "Claude Code": 0.27,
  "Gemini-cli": 0.22,
  Codex: 0.17,
  "Qwen-cli": 0.12,
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
    apps: ["billpayment", "decorators", "encoder", "guessnumber", "producerfields", "producermethods", "simplegreeting"],
  },
  {
    id: "persistence",
    name: "Persistence",
    apps: ["address-book", "order", "roster"],
  },
  {
    id: "presentation",
    name: "Presentation",
    apps: ["dukeetf", "dukeetf2", "fileupload", "hello-servlet", "jaxrs-customer", "jaxrs-hello", "jaxrs-rsvp", "mood", "websocketbot"],
  },
  {
    id: "infrastructure",
    name: "Infrastructure",
    apps: ["concurrency-jobs", "concurrency-taskcreator", "ejb-async", "ejb-interceptor", "ejb-timersession"],
  },
  {
    id: "whole applications",
    name: "Whole Applications",
    apps: ["cargotracker", "coffee-shop", "daytrader", "petclinic", "realworld"],
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

for (const solution of solutions) {
  const strength = solutionStrength[solution.name];
  resultsBySolution[solution.name] = [];

  for (const pair of conversionPairs) {
    const pairKey = `${pair.from}->${pair.to}`;
    const pairMod = pairDifficulty[pairKey];

    for (const layer of layers) {
      const layerMod = layerDifficulty[layer.id];

      for (const app of layer.apps) {
        const total = testsTotal[app];
        const repeats = [];

        for (let r = 0; r < REPEATS; r++) {
          const compileProb = strength * layerMod * pairMod;
          const compiled = rand() < compileProb;

          if (!compiled) {
            repeats.push({
              compile: false,
              run: false,
              tests_passed: 0,
              tests_total: total,
            });
            continue;
          }

          const runGivenCompile = 0.5 * layerMod * pairMod;
          const ran = rand() < runGivenCompile;

          if (!ran) {
            repeats.push({
              compile: true,
              run: false,
              tests_passed: 0,
              tests_total: total,
            });
            continue;
          }

          // tests_passed: gaussian-ish around a centre value
          const centre = strength * layerMod * pairMod * 0.3;
          const stddev = 0.08;
          const ratio = Math.max(0, Math.min(1, gaussianRand(centre, stddev)));
          const passed = Math.min(total, Math.max(0, Math.floor(total * ratio)));

          repeats.push({
            compile: true,
            run: true,
            tests_passed: passed,
            tests_total: total,
          });
        }

        resultsBySolution[solution.name].push({
          from: pair.from,
          to: pair.to,
          layer: layer.id,
          app,
          repeats,
        });
      }
    }
  }
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
  console.log(`✅  Wrote ${outPath} (${resultsBySolution[solution.name].length} results)`);
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
