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
  compile1Count: number;
  run1Count: number;
  tests1Passed: number;
  tests1Total: number;
  compile3Count: number;
  run3Count: number;
  tests3Passed: number;
  tests3Total: number;
  unitCount: number; // total number of units for this app
  canonicalTests1Total: number; // max tests1Total across all solutions for this app (set by applyCanonicalTotals)
  canonicalTests3Total: number; // max tests3Total across all solutions for this app (set by applyCanonicalTotals)
}

export interface RankedRow {
  solutionIdx: number;
  rank: number;
  compile1: MetricValue;
  run1: MetricValue;
  pass1: MetricValue;
  compile3: MetricValue;
  run3: MetricValue;
  pass3: MetricValue;
  layersCovered?: number;
}

// --- pass@k aggregation ---

function summarizeAtK(
  repeats: RawRepeat[],
  k: number,
): {
  compile: number;
  run: number;
  testsPassed: number;
  testsTotal: number;
} {
  const window = repeats.slice(0, k);
  if (window.length === 0) {
    return { compile: 0, run: 0, testsPassed: 0, testsTotal: 0 };
  }
  const compile = window.some((r) => r.compile) ? 1 : 0;
  const run = window.some((r) => r.run) ? 1 : 0;
  let bestPassed = 0;
  let testsTotal = 0;
  for (const r of window) {
    if (
      r.tests_passed > bestPassed ||
      (r.tests_passed === bestPassed && r.tests_total > testsTotal)
    ) {
      bestPassed = r.tests_passed;
      testsTotal = r.tests_total;
    }
  }
  return { compile, run, testsPassed: bestPassed, testsTotal };
}

/** Collapse repeats into pass@1 and pass@3 summaries for one conversion pair */
export function passAtK(repeats: RawRepeat[]): {
  k1: { compile: number; run: number; testsPassed: number; testsTotal: number };
  k3: { compile: number; run: number; testsPassed: number; testsTotal: number };
} {
  if (repeats.length === 0)
    return {
      k1: { compile: 0, run: 0, testsPassed: 0, testsTotal: 0 },
      k3: { compile: 0, run: 0, testsPassed: 0, testsTotal: 0 },
    };
  return {
    k1: summarizeAtK(repeats, 1),
    k3: summarizeAtK(repeats, 3),
  };
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
export function buildScoreCube(
  solutionResults: RawResult[][],
  layers: Layer[],
  fromFilter: string,
  toFilter: string,
): AppScore[][][] {
  return solutionResults.map((results) => {
    const filtered = results.filter((r) => {
      if (fromFilter !== "all" && r.from !== fromFilter) return false;
      if (toFilter !== "all" && r.to !== toFilter) return false;
      return true;
    });

    return layers.map((layer) => {
      return layer.apps.map((app) => {
        const matching = filtered.filter(
          (r) => r.layer === layer.id && r.app === app,
        );

        if (matching.length === 0) {
          return {
            compile1Count: 0,
            run1Count: 0,
            tests1Passed: 0,
            tests1Total: 0,
            compile3Count: 0,
            run3Count: 0,
            tests3Passed: 0,
            tests3Total: 0,
            unitCount: 0,
            canonicalTests1Total: 0,
            canonicalTests3Total: 0,
          };
        }

        // Each matching result is one conversion pair → one pass@k unit
        const units = matching.map((r) => passAtK(r.repeats));

        return {
          compile1Count: units.reduce((s, u) => s + u.k1.compile, 0),
          run1Count: units.reduce((s, u) => s + u.k1.run, 0),
          tests1Passed: units.reduce((s, u) => s + u.k1.testsPassed, 0),
          tests1Total: units.reduce((s, u) => s + u.k1.testsTotal, 0),
          compile3Count: units.reduce((s, u) => s + u.k3.compile, 0),
          run3Count: units.reduce((s, u) => s + u.k3.run, 0),
          tests3Passed: units.reduce((s, u) => s + u.k3.testsPassed, 0),
          tests3Total: units.reduce((s, u) => s + u.k3.testsTotal, 0),
          unitCount: units.length,
          canonicalTests1Total: 0,
          canonicalTests3Total: 0,
        };
      });
    });
  });
}

/**
 * Compute the canonical tests total for each (layer, app): the sum of
 * max(tests_total) per (from, to) pair across all solutions. This gives the
 * true total test count for each app across all evaluated conversion pairs,
 * so every model shares the same denominator.
 */
export function computeCanonicalTestsCube(
  solutionResults: RawResult[][],
  layers: Layer[],
  fromFilter: string,
  toFilter: string,
): { k1: number; k3: number }[][] {
  return layers.map((layer) =>
    layer.apps.map((app) => {
      // Test count is a property of (app, to) — collect max per target framework
      const pairMax1 = new Map<string, number>();
      const pairMax3 = new Map<string, number>();

      for (const results of solutionResults) {
        const matching = results.filter((r) => {
          if (fromFilter !== "all" && r.from !== fromFilter) return false;
          if (toFilter !== "all" && r.to !== toFilter) return false;
          return r.layer === layer.id && r.app === app;
        });
        for (const r of matching) {
          const { k1, k3 } = passAtK(r.repeats);
          pairMax1.set(r.to, Math.max(pairMax1.get(r.to) ?? 0, k1.testsTotal));
          pairMax3.set(r.to, Math.max(pairMax3.get(r.to) ?? 0, k3.testsTotal));
        }
      }

      const k1 = [...pairMax1.values()].reduce((s, v) => s + v, 0);
      const k3 = [...pairMax3.values()].reduce((s, v) => s + v, 0);
      return { k1, k3 };
    }),
  );
}

/**
 * Apply a precomputed canonical tests cube to a score cube so all solutions
 * share the same denominator when aggregated.
 */
export function applyCanonicalTotals(
  scoreCube: AppScore[][][],
  canonicalCube: { k1: number; k3: number }[][],
): void {
  for (const solutionLayers of scoreCube) {
    for (let li = 0; li < solutionLayers.length; li++) {
      for (let ai = 0; ai < solutionLayers[li].length; ai++) {
        solutionLayers[li][ai].canonicalTests1Total = canonicalCube[li][ai].k1;
        solutionLayers[li][ai].canonicalTests3Total = canonicalCube[li][ai].k3;
      }
    }
  }
}

// --- Aggregation helpers (always sum/sum, never average-of-averages) ---

/** Aggregate a list of AppScores into display percentages */
export function aggregateScores(scores: AppScore[]): {
  compile1: MetricValue;
  run1: MetricValue;
  pass1: MetricValue;
  compile3: MetricValue;
  run3: MetricValue;
  pass3: MetricValue;
} {
  const totalUnits = scores.reduce((s, a) => s + a.unitCount, 0);
  if (totalUnits === 0) {
    return {
      compile1: null,
      run1: null,
      pass1: null,
      compile3: null,
      run3: null,
      pass3: null,
    };
  }

  const compile1 =
    (scores.reduce((s, a) => s + a.compile1Count, 0) / totalUnits) * 100;
  const run1 = (scores.reduce((s, a) => s + a.run1Count, 0) / totalUnits) * 100;
  const canon1Total = scores.reduce((s, a) => s + a.canonicalTests1Total, 0);
  const pass1 =
    canon1Total > 0
      ? (scores.reduce((s, a) => s + a.tests1Passed, 0) / canon1Total) * 100
      : null;
  const compile3 =
    (scores.reduce((s, a) => s + a.compile3Count, 0) / totalUnits) * 100;
  const run3 = (scores.reduce((s, a) => s + a.run3Count, 0) / totalUnits) * 100;
  const canon3Total = scores.reduce((s, a) => s + a.canonicalTests3Total, 0);
  const pass3 =
    canon3Total > 0
      ? (scores.reduce((s, a) => s + a.tests3Passed, 0) / canon3Total) * 100
      : null;

  return { compile1, run1, pass1, compile3, run3, pass3 };
}

// --- Ranking ---

export function rankOverallRows(
  scoreCube: AppScore[][][],
  layers: Layer[],
): RankedRow[] {
  return scoreCube
    .map((solutionLayers, solutionIdx) => {
      // Flatten all app scores across all layers
      const allScores = solutionLayers.flat();
      const metrics = aggregateScores(allScores);

      // Count layers where pass > 0.5%
      const layersCovered = solutionLayers.filter((layerApps) => {
        const m = aggregateScores(layerApps);
        return m.pass3 !== null && m.pass3 > 0.5;
      }).length;

      return { solutionIdx, rank: 0, ...metrics, layersCovered };
    })
    .sort((a, b) => (b.pass3 ?? 0) - (a.pass3 ?? 0))
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
}

// --- Display helpers ---

export function formatMetric(value: MetricValue): string {
  if (value === null) return "0";
  return value.toFixed(1);
}

export function metricClass(value: MetricValue, metric: 0 | 1 | 2): string {
  if (value === null) return "val-low";
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
