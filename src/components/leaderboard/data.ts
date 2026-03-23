export type MetricValue = number | null;

// --- Shared types ---

export interface Solution {
  name: string;
  model: string;
  date: string;
}

export interface Layer {
  id: string;
  name: string;
  apps: string[];
}

// --- Raw JSON types (per-solution file) ---

export interface RawRepeat {
  compile: boolean;
  run: boolean;
  tests_passed: number;
  tests_total: number;
}

export interface RawResult {
  from: string;
  to: string;
  layer: string;
  app: string;
  repeats: RawRepeat[];
}

export interface SolutionFile {
  solution: Solution;
  results: RawResult[];
}

export interface LeaderboardIndex {
  layers: Layer[];
  solutions: string[];
}

// --- Score cube types ---
// Stores raw counts so aggregation is always sum/sum (no percentage-of-percentage)

export interface AppScore {
  compileCount: number; // how many units (pass@k pairs) compiled
  runCount: number; // how many units ran
  unitCount: number; // total number of units for this app
  testsPassed: number; // sum of best tests_passed per unit
  testsTotal: number; // sum of tests_total per unit
}

export interface RankedRow {
  solutionIdx: number;
  rank: number;
  compile: MetricValue; // percentage 0-100
  run: MetricValue; // percentage 0-100
  pass: MetricValue; // percentage 0-100
  layersCovered?: number;
}

// --- pass@k aggregation ---

/** Collapse k repeats into one unit using pass@k semantics */
export function passAtK(repeats: RawRepeat[]): {
  compile: number; // 0 or 1 (any repeat compiled)
  run: number; // 0 or 1 (any repeat ran)
  testsPassed: number; // best tests_passed across repeats
  testsTotal: number; // tests_total (same across repeats)
} {
  if (repeats.length === 0) return { compile: 0, run: 0, testsPassed: 0, testsTotal: 0 };

  const compile = repeats.some((r) => r.compile) ? 1 : 0;
  const run = repeats.some((r) => r.run) ? 1 : 0;
  const testsTotal = repeats[0].tests_total;

  let bestPassed = 0;
  for (const r of repeats) {
    if (r.tests_passed > bestPassed) bestPassed = r.tests_passed;
  }

  return { compile, run, testsPassed: bestPassed, testsTotal };
}

// --- Score cube construction ---

/**
 * Build score cube from raw results filtered by from/to.
 * Returns scoreCube[solutionIdx][layerIdx][appIdx] = AppScore
 *
 * When from/to is "all", an app may have multiple matching conversion pairs.
 * Each pair's repeats are collapsed via pass@k independently, producing one "unit" per pair.
 * The AppScore stores the aggregate counts across all matching units.
 */
export function buildScoreCube(solutionResults: RawResult[][], layers: Layer[], fromFilter: string, toFilter: string): AppScore[][][] {
  return solutionResults.map((results) => {
    const filtered = results.filter((r) => {
      if (fromFilter !== "all" && r.from !== fromFilter) return false;
      if (toFilter !== "all" && r.to !== toFilter) return false;
      return true;
    });

    return layers.map((layer) => {
      return layer.apps.map((app) => {
        const matching = filtered.filter((r) => r.layer === layer.id && r.app === app);

        if (matching.length === 0) {
          return { compileCount: 0, runCount: 0, unitCount: 0, testsPassed: 0, testsTotal: 0 };
        }

        // Each matching result is one conversion pair → one pass@k unit
        const units = matching.map((r) => passAtK(r.repeats));

        return {
          compileCount: units.reduce((s, u) => s + u.compile, 0),
          runCount: units.reduce((s, u) => s + u.run, 0),
          unitCount: units.length,
          testsPassed: units.reduce((s, u) => s + u.testsPassed, 0),
          testsTotal: units.reduce((s, u) => s + u.testsTotal, 0),
        };
      });
    });
  });
}

// --- Aggregation helpers (always sum/sum, never average-of-averages) ---

/** Aggregate a list of AppScores into display percentages */
export function aggregateScores(scores: AppScore[]): { compile: MetricValue; run: MetricValue; pass: MetricValue } {
  const totalUnits = scores.reduce((s, a) => s + a.unitCount, 0);
  if (totalUnits === 0) return { compile: null, run: null, pass: null };

  const compile = (scores.reduce((s, a) => s + a.compileCount, 0) / totalUnits) * 100;
  const run = (scores.reduce((s, a) => s + a.runCount, 0) / totalUnits) * 100;

  const totalTests = scores.reduce((s, a) => s + a.testsTotal, 0);
  const pass = totalTests > 0 ? (scores.reduce((s, a) => s + a.testsPassed, 0) / totalTests) * 100 : null;

  return { compile, run, pass };
}

// --- Ranking ---

export function rankOverallRows(scoreCube: AppScore[][][], layers: Layer[]): RankedRow[] {
  return scoreCube
    .map((solutionLayers, solutionIdx) => {
      // Flatten all app scores across all layers
      const allScores = solutionLayers.flat();
      const metrics = aggregateScores(allScores);

      // Count layers where pass > 0.5%
      const layersCovered = solutionLayers.filter((layerApps) => {
        const m = aggregateScores(layerApps);
        return m.pass !== null && m.pass > 0.5;
      }).length;

      return { solutionIdx, rank: 0, ...metrics, layersCovered };
    })
    .sort((a, b) => (b.pass ?? 0) - (a.pass ?? 0))
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
}

// --- Display helpers ---

export function formatMetric(value: MetricValue): string {
  if (value === null) return "NaN";
  return value.toFixed(1);
}

export function metricClass(value: MetricValue, metric: 0 | 1 | 2): string {
  if (value === null) return "nan";
  // All values are now 0-100 percentages
  const thresholds: [number, number][] = [
    [70, 40], // compile: high >= 70%, mid >= 40%
    [60, 30], // run: high >= 60%, mid >= 30%
    [50, 20], // pass: high >= 50%, mid >= 20%
  ];
  const [high, mid] = thresholds[metric];
  if (value >= high) return "val-high";
  if (value >= mid) return "val-mid";
  return "val-low";
}
