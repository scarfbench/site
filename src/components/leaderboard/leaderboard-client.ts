// ── Local type declarations (mirrors data.ts, not imported) ─────────

type MetricValue = number | null;

const layerEq = (a: string, b: string): boolean =>
  a.replace(/[-_]/g, " ") === b.replace(/[-_]/g, " ");

interface Solution {
  agent: string;
  model: string;
  variant?: string;
  date: string;
  submission?: string;
}
interface Layer {
  id: string;
  name: string;
  apps: string[];
}

interface RawRepeat {
  compile: boolean;
  run: boolean;
  tests_passed: number;
  tests_total: number;
}

interface RawResult {
  from: string;
  to: string;
  layer: string;
  app: string;
  repeats: RawRepeat[];
}

interface AppScore {
  compile1Count: number;
  run1Count: number;
  tests1Passed: number;
  tests1Total: number;
  compile3Count: number;
  run3Count: number;
  tests3Passed: number;
  tests3Total: number;
  unitCount: number;
  canonicalTests1Total: number;
  canonicalTests3Total: number;
}

interface LeaderboardData {
  solutions: Solution[];
  layers: Layer[];
  solutionResults: RawResult[][]; // [solutionIdx][resultIdx]
}

interface RankedRow {
  solutionIdx: number;
  rank: number;
  compile1: MetricValue;
  run1: MetricValue;
  pass1: MetricValue;
  compile3: MetricValue;
  run3: MetricValue;
  pass3: MetricValue;
  layersCovered: number;
}

type SortKey =
  | "agent"
  | "model"
  | "compile1"
  | "run1"
  | "pass1"
  | "compile3"
  | "run3"
  | "pass3";
type SortDirection = "asc" | "desc";
type OpenDrillState = Record<string, { rowIdx: number }>;
type OpenAppDrillState = Record<string, Set<number>>;

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
  if (window.length === 0)
    return { compile: 0, run: 0, testsPassed: 0, testsTotal: 0 };
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

// ── pass@k aggregation ──────────────────────────────────────────────

function passAtK(repeats: RawRepeat[]): {
  k1: { compile: number; run: number; testsPassed: number; testsTotal: number };
  k3: { compile: number; run: number; testsPassed: number; testsTotal: number };
} {
  if (repeats.length === 0)
    return {
      k1: { compile: 0, run: 0, testsPassed: 0, testsTotal: 0 },
      k3: { compile: 0, run: 0, testsPassed: 0, testsTotal: 0 },
    };
  return { k1: summarizeAtK(repeats, 1), k3: summarizeAtK(repeats, 3) };
}

function buildScoreCube(
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
    return layers.map((layer) =>
      layer.apps.map((app) => {
        const matching = filtered.filter(
          (r) => layerEq(r.layer, layer.id) && r.app === app,
        );
        if (matching.length === 0)
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
      }),
    );
  });
}

function computeCanonicalTestsCube(
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
          return layerEq(r.layer, layer.id) && r.app === app;
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

function applyCanonicalTotals(
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

// ── Score aggregation (sum/sum, never average-of-averages) ──────────

function aggregateScores(scores: AppScore[]): {
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

// ── Display helpers ─────────────────────────────────────────────────

function formatMetric(value: MetricValue): string {
  if (value === null) return "0";
  return value.toFixed(1);
}

function metricClass(value: MetricValue, metric: 0 | 1 | 2): string {
  if (value === null) return "val-low";
  const thresholds: [number, number][] = [
    [70, 40], // compile %
    [60, 30], // run %
    [50, 20], // pass %
  ];
  const [high, mid] = thresholds[metric];
  if (value >= high) return "val-high";
  if (value >= mid) return "val-mid";
  return "val-low";
}

function renderMetricCell(value: MetricValue): string {
  const width = value === null ? 0 : Math.max(0, Math.min(100, value));
  const label = value === null ? "0%" : `${Math.round(width)}%`;
  return `<td class="num metric-cell"><div class="metric-bar-wrap"><div class="metric-bar" style="width:${width}%"></div><span class="metric-label">${label}</span></div></td>`;
}

function renderOverallMetricCell(
  value: MetricValue,
  metric: 0 | 1 | 2,
  classes: string[],
): string {
  return `<td class="${["num", ...classes, metricClass(value, metric)].join(" ")}">${formatMetric(value)}</td>`;
}

// ── Ranking ─────────────────────────────────────────────────────────

function rankOverall(scoreCube: AppScore[][][], layers: Layer[]): RankedRow[] {
  return scoreCube
    .map((solutionLayers, solutionIdx) => {
      const allScores = solutionLayers.flat();
      const metrics = aggregateScores(allScores);
      const layersCovered = solutionLayers.filter((layerApps) => {
        const m = aggregateScores(layerApps);
        return m.pass3 !== null && m.pass3 > 0.5;
      }).length;
      return { solutionIdx, rank: 0, ...metrics, layersCovered };
    })
    .sort((a, b) => (b.pass3 ?? 0) - (a.pass3 ?? 0))
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
}

function sortOverallRows(
  rows: RankedRow[],
  solutions: Solution[],
  sortKey: SortKey,
  sortDirection: SortDirection,
): RankedRow[] {
  const metricValue = (value: MetricValue): number => value ?? 0;
  const direction = sortDirection === "asc" ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    if (sortKey === "agent") {
      return (
        solutions[a.solutionIdx].agent.localeCompare(
          solutions[b.solutionIdx].agent,
        ) * direction
      );
    }
    if (sortKey === "model") {
      return (
        solutions[a.solutionIdx].model.localeCompare(
          solutions[b.solutionIdx].model,
        ) * direction
      );
    }
    const diff =
      sortKey === "compile1"
        ? metricValue(a.compile1) - metricValue(b.compile1)
        : sortKey === "run1"
          ? metricValue(a.run1) - metricValue(b.run1)
          : sortKey === "pass1"
            ? metricValue(a.pass1) - metricValue(b.pass1)
            : sortKey === "compile3"
              ? metricValue(a.compile3) - metricValue(b.compile3)
              : sortKey === "run3"
                ? metricValue(a.run3) - metricValue(b.run3)
                : sortKey === "pass3"
                  ? metricValue(a.pass3) - metricValue(b.pass3)
                  : 0;
    if (diff !== 0) return diff * direction;
    return (
      solutions[a.solutionIdx].agent.localeCompare(
        solutions[b.solutionIdx].agent,
      ) * direction
    );
  });
  return sorted.map((row, idx) => ({ ...row, rank: idx + 1 }));
}

// ── Table rendering ─────────────────────────────────────────────────

function renderOverallTableRows(
  rankedRows: RankedRow[],
  solutions: Solution[],
): string {
  return rankedRows
    .map((row, rowIdx) => {
      const solution = solutions[row.solutionIdx];
      const rankInner = solution.submission
        ? `<a href="${solution.submission}" class="rank-link" target="_blank" rel="noopener" onclick="event.stopPropagation()">#${row.rank}<sup class="rank-star">*</sup></a>`
        : `<span>#${row.rank}</span>`;
      return `<tr class="data-row" data-row-clickable="true" data-table-id="overall-body" data-row-idx="${rowIdx}" data-solution-idx="${row.solutionIdx}" data-layer-idx="-1">
      <td class="rank num">${rankInner}</td>
      <td><strong class="solution-name">${solution.agent}</strong></td>
      <td>${solution.model}</td>
      ${renderOverallMetricCell(row.compile1, 0, ["group-pass1"])}
      ${renderOverallMetricCell(row.run1, 1, ["group-pass1"])}
      ${renderOverallMetricCell(row.pass1, 2, ["group-pass1", "metric-pass-col"])}
      ${renderOverallMetricCell(row.compile3, 0, ["group-pass3", "group-divider"])}
      ${renderOverallMetricCell(row.run3, 1, ["group-pass3"])}
      ${renderOverallMetricCell(row.pass3, 2, ["group-pass3", "metric-pass-col"])}
    </tr>`;
    })
    .join("");
}

// ── Drill panel rendering ───────────────────────────────────────────

function buildDrillContent(
  data: LeaderboardData,
  scoreCube: AppScore[][][],
  solutionIdx: number,
  layerIdx: number,
  fromFilter: string,
  toFilter: string,
): string {
  const solution = data.solutions[solutionIdx];
  const layerIndexes =
    layerIdx === -1 ? data.layers.map((_, i) => i) : [layerIdx];
  let pass1Rows = "";
  let pass3Rows = "";

  for (const li of layerIndexes) {
    const layer = data.layers[li];
    const layerScores = scoreCube[solutionIdx][li];
    const metrics = aggregateScores(layerScores);

    pass1Rows += `<tr class="layer-drill-row" data-layer-drill-clickable="true" data-drill-solution-idx="${solutionIdx}" data-drill-layer-idx="${li}" data-pass-k="1">
      <td><span class="layer-chevron" data-layer-idx="${li}">▸</span> ${layer.name}</td>
      ${renderMetricCell(metrics.compile1)}
      ${renderMetricCell(metrics.run1)}
      ${renderMetricCell(metrics.pass1)}
    </tr>`;

    pass3Rows += `<tr class="layer-drill-row" data-layer-drill-clickable="true" data-drill-solution-idx="${solutionIdx}" data-drill-layer-idx="${li}" data-pass-k="3">
      <td><span class="layer-chevron" data-layer-idx="${li}">▸</span> ${layer.name}</td>
      ${renderMetricCell(metrics.compile3)}
      ${renderMetricCell(metrics.run3)}
      ${renderMetricCell(metrics.pass3)}
    </tr>`;
  }

  const submissionHref = solution.submission ?? "#";
  const fromLabel = fromFilter === "all" ? "any" : fromFilter;
  const toLabel = toFilter === "all" ? "any" : toFilter;
  const title = `<span class="drill-title-left">${solution.date}</span><span class="drill-title-center">${fromLabel} \u2192 ${toLabel}</span><span class="drill-title-right"><a class="drill-submission" href="${submissionHref}" target="_blank" rel="noopener">Submission \u2197</a></span>`;

  return `<div class="drill-panel"><div class="drill-title">${title}</div><div class="drill-grid"><div class="drill-section"><div class="drill-section-title">Pass@1</div><div class="table-wrap"><table><colgroup><col class="layer-col" /><col class="compile-col" /><col class="deploy-col" /><col class="test-col" /></colgroup><thead><tr><th>Layer</th><th class="num">Compile</th><th class="num">Deploy</th><th class="num">Tests</th></tr></thead><tbody>${pass1Rows}</tbody></table></div></div><div class="drill-section"><div class="drill-section-title">Pass@3</div><div class="table-wrap"><table><colgroup><col class="layer-col" /><col class="compile-col" /><col class="deploy-col" /><col class="test-col" /></colgroup><thead><tr><th>Layer</th><th class="num">Compile</th><th class="num">Deploy</th><th class="num">Tests</th></tr></thead><tbody>${pass3Rows}</tbody></table></div></div></div></div>`;
}

function renderAppBoolCell(count: number, total: number): string {
  if (total === 0)
    return `<td class="num app-metric-cell"><span class="app-metric-nan">—</span></td>`;
  if (total === 1) {
    // Single pair: simple ✓ or ✗
    const passed = count > 0;
    const icon = passed ? "✓" : "✗";
    const cls = passed ? "app-metric-pass" : "app-metric-fail";
    return `<td class="num app-metric-cell"><span class="${cls}">${icon}</span></td>`;
  }
  // Multiple pairs (filter=all): show "N/M" with ✓ if all passed
  const allPassed = count === total;
  const cls = allPassed
    ? "app-metric-pass"
    : count > 0
      ? "app-metric-partial"
      : "app-metric-fail";
  const icon = allPassed ? "✓" : count > 0 ? "◐" : "✗";
  return `<td class="num app-metric-cell"><span class="${cls}">${icon}</span> <span class="app-metric-frac">${count}/${total}</span></td>`;
}

function renderAppTestsCell(passed: number, total: number): string {
  if (total === 0)
    return `<td class="num app-metric-cell"><span class="app-metric-nan">—</span></td>`;
  const ratio = passed / total;
  const cls =
    ratio >= 0.7
      ? "app-metric-pass"
      : ratio >= 0.3
        ? "app-metric-partial"
        : "app-metric-fail";
  return `<td class="num app-metric-cell"><span class="${cls}">${passed}/${total}</span></td>`;
}

function renderAppRows(
  scoreCube: AppScore[][][],
  data: LeaderboardData,
  solutionIdx: number,
  layerIdx: number,
  passK: 1 | 3,
): string {
  const layer = data.layers[layerIdx];
  let rows = "";

  for (let appIdx = 0; appIdx < layer.apps.length; appIdx++) {
    const appName = layer.apps[appIdx];
    const s = scoreCube[solutionIdx][layerIdx][appIdx];
    const compileCount = passK === 1 ? s.compile1Count : s.compile3Count;
    const runCount = passK === 1 ? s.run1Count : s.run3Count;
    const testsPassed = passK === 1 ? s.tests1Passed : s.tests3Passed;
    const testsTotal = passK === 1 ? s.tests1Total : s.tests3Total;

    rows += `<tr class="app-detail-row" data-parent-layer="${layerIdx}">
      <td class="app-name-cell">&nbsp;&nbsp;↳ ${appName}</td>
      ${renderAppBoolCell(compileCount, s.unitCount)}
      ${renderAppBoolCell(runCount, s.unitCount)}
      ${renderAppTestsCell(testsPassed, testsTotal)}
    </tr>`;
  }
  return rows;
}

// ── Drill state management ──────────────────────────────────────────

function closeDrill(
  tableId: string,
  openDrill: OpenDrillState,
  openAppDrills: OpenAppDrillState,
): void {
  const previous = openDrill[tableId];
  if (!previous) return;
  const drillId = `drill-${tableId}`;
  const tableBody = document.getElementById(tableId);
  const rows = tableBody?.querySelectorAll<HTMLTableRowElement>("tr.data-row");
  if (rows && rows[previous.rowIdx])
    rows[previous.rowIdx].classList.remove("selected");
  document.getElementById(drillId)?.remove();
  delete openAppDrills[drillId];
  delete openDrill[tableId];
}

function toggleDrill(
  data: LeaderboardData,
  scoreCube: AppScore[][][],
  tableId: string,
  rowIdx: number,
  solutionIdx: number,
  layerIdx: number,
  fromFilter: string,
  toFilter: string,
  openDrill: OpenDrillState,
  openAppDrills: OpenAppDrillState,
): void {
  const previous = openDrill[tableId];
  closeDrill(tableId, openDrill, openAppDrills);
  if (previous && previous.rowIdx === rowIdx) return;

  const tableBody = document.getElementById(tableId);
  if (!tableBody) return;
  const rows = tableBody.querySelectorAll<HTMLTableRowElement>("tr.data-row");
  const targetRow = rows[rowIdx];
  if (!targetRow) return;

  targetRow.classList.add("selected");
  const drillRow = document.createElement("tr");
  drillRow.className = "drill-row";
  drillRow.id = `drill-${tableId}`;
  const drillCell = document.createElement("td");
  drillCell.colSpan = 9;
  drillCell.innerHTML = buildDrillContent(
    data,
    scoreCube,
    solutionIdx,
    layerIdx,
    fromFilter,
    toFilter,
  );
  drillRow.appendChild(drillCell);
  targetRow.insertAdjacentElement("afterend", drillRow);
  openDrill[tableId] = { rowIdx };
}

function toggleAppDrill(
  scoreCube: AppScore[][][],
  data: LeaderboardData,
  layerRow: HTMLTableRowElement,
  solutionIdx: number,
  layerIdx: number,
  openAppDrills: OpenAppDrillState,
  drillId: string,
): void {
  if (!openAppDrills[drillId]) openAppDrills[drillId] = new Set();
  const expandedSet = openAppDrills[drillId];
  const chevron = layerRow.querySelector<HTMLElement>(
    `.layer-chevron[data-layer-idx="${layerIdx}"]`,
  );
  const passK = Number(layerRow.dataset.passK) === 1 ? 1 : 3;

  if (expandedSet.has(layerIdx)) {
    const tbody = layerRow.closest("tbody");
    if (tbody) {
      const appRows = tbody.querySelectorAll<HTMLTableRowElement>(
        `tr.app-detail-row[data-parent-layer="${layerIdx}"]`,
      );
      appRows.forEach((row) => row.remove());
    }
    expandedSet.delete(layerIdx);
    layerRow.classList.remove("layer-expanded");
    if (chevron) chevron.textContent = "▸";
  } else {
    const appRowsHtml = renderAppRows(
      scoreCube,
      data,
      solutionIdx,
      layerIdx,
      passK,
    );
    layerRow.insertAdjacentHTML("afterend", appRowsHtml);
    expandedSet.add(layerIdx);
    layerRow.classList.add("layer-expanded");
    if (chevron) chevron.textContent = "▾";
  }
}

function toggleSection(sectionId: string): void {
  const section = document.getElementById(`section-${sectionId}`);
  const chevron = document.getElementById(`chevron-${sectionId}`);
  if (!section || !chevron) return;
  const isOpen = section.style.display !== "none";
  section.style.display = isOpen ? "none" : "";
  chevron.classList.toggle("open", !isOpen);
}

// ── Entry point ─────────────────────────────────────────────────────

export function initLeaderboard(): void {
  const payloadEl = document.getElementById("leaderboard-data");
  if (!payloadEl?.textContent) return;

  const data = JSON.parse(payloadEl.textContent) as LeaderboardData;
  const openDrill: OpenDrillState = {};
  const openAppDrills: OpenAppDrillState = {};

  // Build initial score cube (all/all)
  let currentFrom = "all";
  let currentTo = "all";
  let currentSortKey: SortKey = "pass3";
  let currentSortDirection: SortDirection = "desc";
  let currentScoreCube = buildScoreCube(
    data.solutionResults,
    data.layers,
    currentFrom,
    currentTo,
  );
  applyCanonicalTotals(
    currentScoreCube,
    computeCanonicalTestsCube(data.solutionResults, data.layers, currentFrom, currentTo),
  );

  // --- From / To dropdown handlers ---
  const filterFrom = document.getElementById(
    "filter-from",
  ) as HTMLSelectElement | null;
  const filterTo = document.getElementById(
    "filter-to",
  ) as HTMLSelectElement | null;

  function updateSortButtons(): void {
    const buttons = document.querySelectorAll<HTMLElement>("[data-sort-key]");
    buttons.forEach((button) => {
      const isActive = button.dataset.sortKey === currentSortKey;
      button.classList.toggle("active", isActive);
      button.classList.toggle(
        "asc",
        isActive && currentSortDirection === "asc",
      );
      button.classList.toggle(
        "desc",
        isActive && currentSortDirection === "desc",
      );
    });
  }

  function renderOverall(): void {
    const rankedRows = rankOverall(currentScoreCube, data.layers);
    const sortedRows = sortOverallRows(
      rankedRows,
      data.solutions,
      currentSortKey,
      currentSortDirection,
    );
    const tbody = document.getElementById("overall-body");
    if (tbody) {
      tbody.innerHTML = renderOverallTableRows(sortedRows, data.solutions);
    }
    updateSortButtons();
  }

  function onFilterChange(): void {
    currentFrom = filterFrom?.value ?? "all";
    currentTo = filterTo?.value ?? "all";

    // Close any open drill
    closeDrill("overall-body", openDrill, openAppDrills);

    // Rebuild score cube with new filter
    currentScoreCube = buildScoreCube(
      data.solutionResults,
      data.layers,
      currentFrom,
      currentTo,
    );
    applyCanonicalTotals(
      currentScoreCube,
      computeCanonicalTestsCube(data.solutionResults, data.layers, currentFrom, currentTo),
    );
    renderOverall();
  }

  function onSortChange(): void {
    closeDrill("overall-body", openDrill, openAppDrills);
    renderOverall();
  }

  filterFrom?.addEventListener("change", onFilterChange);
  filterTo?.addEventListener("change", onFilterChange);

  // --- Click handling ---
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    const sortButton = target.closest<HTMLElement>("[data-sort-key]");
    if (sortButton?.dataset.sortKey) {
      const nextKey = sortButton.dataset.sortKey as SortKey;
      if (nextKey === currentSortKey) {
        currentSortDirection = currentSortDirection === "desc" ? "asc" : "desc";
      } else {
        currentSortKey = nextKey;
        currentSortDirection =
          nextKey === "agent" || nextKey === "model" ? "asc" : "desc";
      }
      onSortChange();
      return;
    }

    // Section toggle
    const header = target.closest<HTMLElement>("[data-section-toggle]");
    if (header) {
      const sectionId = header.dataset.sectionToggle;
      if (sectionId) toggleSection(sectionId);
      return;
    }

    // Second-level drill: layer row → app rows
    const layerRow = target.closest<HTMLTableRowElement>(
      "[data-layer-drill-clickable='true']",
    );
    if (layerRow) {
      const solutionIdx = Number(layerRow.dataset.drillSolutionIdx);
      const layerIdx = Number(layerRow.dataset.drillLayerIdx);
      if (Number.isNaN(solutionIdx) || Number.isNaN(layerIdx)) return;
      const drillRowEl = layerRow.closest<HTMLElement>(".drill-row");
      const drillId = drillRowEl?.id ?? "unknown";
      toggleAppDrill(
        currentScoreCube,
        data,
        layerRow,
        solutionIdx,
        layerIdx,
        openAppDrills,
        drillId,
      );
      return;
    }

    // First-level drill: solution row → layer rows
    const row = target.closest<HTMLTableRowElement>(
      "[data-row-clickable='true']",
    );
    if (!row) return;
    const tableId = row.dataset.tableId;
    const rowIdx = Number(row.dataset.rowIdx);
    const solutionIdx = Number(row.dataset.solutionIdx);
    const layerIdx = Number(row.dataset.layerIdx);
    if (
      !tableId ||
      Number.isNaN(rowIdx) ||
      Number.isNaN(solutionIdx) ||
      Number.isNaN(layerIdx)
    )
      return;
    toggleDrill(
      data,
      currentScoreCube,
      tableId,
      rowIdx,
      solutionIdx,
      layerIdx,
      currentFrom,
      currentTo,
      openDrill,
      openAppDrills,
    );
  });
}
