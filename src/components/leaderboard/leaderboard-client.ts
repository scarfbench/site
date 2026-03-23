// ── Local type declarations (mirrors data.ts, not imported) ─────────

type MetricValue = number | null;

interface Solution {
  name: string;
  model: string;
  date: string;
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
  compileCount: number;
  runCount: number;
  unitCount: number;
  testsPassed: number;
  testsTotal: number;
}

interface LeaderboardData {
  solutions: Solution[];
  layers: Layer[];
  solutionResults: RawResult[][]; // [solutionIdx][resultIdx]
}

interface RankedRow {
  solutionIdx: number;
  rank: number;
  compile: MetricValue;
  run: MetricValue;
  pass: MetricValue;
  layersCovered: number;
}

type OpenDrillState = Record<string, { rowIdx: number }>;
type OpenAppDrillState = Record<string, Set<number>>;

// ── pass@k aggregation ──────────────────────────────────────────────

function passAtK(repeats: RawRepeat[]): { compile: number; run: number; testsPassed: number; testsTotal: number } {
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

function buildScoreCube(solutionResults: RawResult[][], layers: Layer[], fromFilter: string, toFilter: string): AppScore[][][] {
  return solutionResults.map((results) => {
    const filtered = results.filter((r) => {
      if (fromFilter !== "all" && r.from !== fromFilter) return false;
      if (toFilter !== "all" && r.to !== toFilter) return false;
      return true;
    });
    return layers.map((layer) =>
      layer.apps.map((app) => {
        const matching = filtered.filter((r) => r.layer === layer.id && r.app === app);
        if (matching.length === 0) return { compileCount: 0, runCount: 0, unitCount: 0, testsPassed: 0, testsTotal: 0 };
        const units = matching.map((r) => passAtK(r.repeats));
        return {
          compileCount: units.reduce((s, u) => s + u.compile, 0),
          runCount: units.reduce((s, u) => s + u.run, 0),
          unitCount: units.length,
          testsPassed: units.reduce((s, u) => s + u.testsPassed, 0),
          testsTotal: units.reduce((s, u) => s + u.testsTotal, 0),
        };
      }),
    );
  });
}

// ── Score aggregation (sum/sum, never average-of-averages) ──────────

function aggregateScores(scores: AppScore[]): { compile: MetricValue; run: MetricValue; pass: MetricValue } {
  const totalUnits = scores.reduce((s, a) => s + a.unitCount, 0);
  if (totalUnits === 0) return { compile: null, run: null, pass: null };
  const compile = (scores.reduce((s, a) => s + a.compileCount, 0) / totalUnits) * 100;
  const run = (scores.reduce((s, a) => s + a.runCount, 0) / totalUnits) * 100;
  const totalTests = scores.reduce((s, a) => s + a.testsTotal, 0);
  const pass = totalTests > 0 ? (scores.reduce((s, a) => s + a.testsPassed, 0) / totalTests) * 100 : null;
  return { compile, run, pass };
}

// ── Display helpers ─────────────────────────────────────────────────

function formatMetric(value: MetricValue): string {
  if (value === null) return "NaN";
  return value.toFixed(1);
}

function metricClass(value: MetricValue, metric: 0 | 1 | 2): string {
  if (value === null) return "nan";
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
  const label = value === null ? "NaN" : `${Math.round(width)}%`;
  return `<td class="num metric-cell"><div class="metric-bar-wrap"><div class="metric-bar" style="width:${width}%"></div><span class="metric-label">${label}</span></div></td>`;
}

// ── Ranking ─────────────────────────────────────────────────────────

function rankOverall(scoreCube: AppScore[][][], layers: Layer[]): RankedRow[] {
  return scoreCube
    .map((solutionLayers, solutionIdx) => {
      const allScores = solutionLayers.flat();
      const metrics = aggregateScores(allScores);
      const layersCovered = solutionLayers.filter((layerApps) => {
        const m = aggregateScores(layerApps);
        return m.pass !== null && m.pass > 0.5;
      }).length;
      return { solutionIdx, rank: 0, ...metrics, layersCovered };
    })
    .sort((a, b) => (b.pass ?? 0) - (a.pass ?? 0))
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
}

// ── Table rendering ─────────────────────────────────────────────────

function renderOverallTableRows(rankedRows: RankedRow[], solutions: Solution[]): string {
  return rankedRows
    .map((row, rowIdx) => {
      const solution = solutions[row.solutionIdx];
      return `<tr class="data-row" data-row-clickable="true" data-table-id="overall-body" data-row-idx="${rowIdx}" data-solution-idx="${row.solutionIdx}" data-layer-idx="-1">
      <td class="rank num">#${row.rank}</td>
      <td><strong class="solution-name">${solution.name}</strong><div class="solution-model-line"><em>(${solution.model})</em></div></td>
      <td class="solution-date">${solution.date}</td>
      <td class="num ${metricClass(row.compile, 0)}">${formatMetric(row.compile)}</td>
      <td class="num ${metricClass(row.run, 1)}">${formatMetric(row.run)}</td>
      <td class="num ${metricClass(row.pass, 2)}">${formatMetric(row.pass)}</td>
      <td class="submission-cell"><a class="submission-link" href="#" aria-label="Submission URL"><i class="fa-solid fa-link" aria-hidden="true"></i></a></td>
    </tr>`;
    })
    .join("");
}

// ── Drill panel rendering ───────────────────────────────────────────

function buildDrillContent(data: LeaderboardData, scoreCube: AppScore[][][], solutionIdx: number, layerIdx: number): string {
  const solution = data.solutions[solutionIdx];
  const layerIndexes = layerIdx === -1 ? data.layers.map((_, i) => i) : [layerIdx];
  let rows = "";

  for (const li of layerIndexes) {
    const layer = data.layers[li];
    const layerScores = scoreCube[solutionIdx][li];
    const metrics = aggregateScores(layerScores);

    rows += `<tr class="layer-drill-row" data-layer-drill-clickable="true" data-drill-solution-idx="${solutionIdx}" data-drill-layer-idx="${li}">
      <td><span class="layer-chevron" data-layer-idx="${li}">▸</span> ${layer.name}</td>
      ${renderMetricCell(metrics.compile)}
      ${renderMetricCell(metrics.run)}
      ${renderMetricCell(metrics.pass)}
    </tr>`;
  }

  const title = layerIdx === -1 ? `All Layers \u2014 ${solution.name} (${solution.model})` : `${data.layers[layerIdx].name} \u2014 ${solution.name}`;

  return `<div class="drill-panel"><div class="drill-title">${title}</div><div class="table-wrap"><table><colgroup><col class="layer-col" /><col class="compile-col" /><col class="deploy-col" /><col class="test-col" /></colgroup><thead><tr><th>Layer</th><th class="num">Compile</th><th class="num">Deploy</th><th class="num">Tests</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function renderAppBoolCell(count: number, total: number): string {
  if (total === 0) return `<td class="num app-metric-cell"><span class="app-metric-nan">—</span></td>`;
  if (total === 1) {
    // Single pair: simple ✓ or ✗
    const passed = count > 0;
    const icon = passed ? "✓" : "✗";
    const cls = passed ? "app-metric-pass" : "app-metric-fail";
    return `<td class="num app-metric-cell"><span class="${cls}">${icon}</span></td>`;
  }
  // Multiple pairs (filter=all): show "N/M" with ✓ if all passed
  const allPassed = count === total;
  const cls = allPassed ? "app-metric-pass" : count > 0 ? "app-metric-partial" : "app-metric-fail";
  const icon = allPassed ? "✓" : count > 0 ? "◐" : "✗";
  return `<td class="num app-metric-cell"><span class="${cls}">${icon}</span> <span class="app-metric-frac">${count}/${total}</span></td>`;
}

function renderAppTestsCell(passed: number, total: number): string {
  if (total === 0) return `<td class="num app-metric-cell"><span class="app-metric-nan">—</span></td>`;
  const ratio = passed / total;
  const cls = ratio >= 0.7 ? "app-metric-pass" : ratio >= 0.3 ? "app-metric-partial" : "app-metric-fail";
  return `<td class="num app-metric-cell"><span class="${cls}">${passed}/${total}</span></td>`;
}

function renderAppRows(scoreCube: AppScore[][][], data: LeaderboardData, solutionIdx: number, layerIdx: number): string {
  const layer = data.layers[layerIdx];
  let rows = "";

  for (let appIdx = 0; appIdx < layer.apps.length; appIdx++) {
    const appName = layer.apps[appIdx];
    const s = scoreCube[solutionIdx][layerIdx][appIdx];

    rows += `<tr class="app-detail-row" data-parent-layer="${layerIdx}">
      <td class="app-name-cell">&nbsp;&nbsp;↳ ${appName}</td>
      ${renderAppBoolCell(s.compileCount, s.unitCount)}
      ${renderAppBoolCell(s.runCount, s.unitCount)}
      ${renderAppTestsCell(s.testsPassed, s.testsTotal)}
    </tr>`;
  }
  return rows;
}

// ── Drill state management ──────────────────────────────────────────

function closeDrill(tableId: string, openDrill: OpenDrillState, openAppDrills: OpenAppDrillState): void {
  const previous = openDrill[tableId];
  if (!previous) return;
  const drillId = `drill-${tableId}`;
  const tableBody = document.getElementById(tableId);
  const rows = tableBody?.querySelectorAll<HTMLTableRowElement>("tr.data-row");
  if (rows && rows[previous.rowIdx]) rows[previous.rowIdx].classList.remove("selected");
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
  drillCell.colSpan = 8;
  drillCell.innerHTML = buildDrillContent(data, scoreCube, solutionIdx, layerIdx);
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
  const chevron = layerRow.querySelector<HTMLElement>(`.layer-chevron[data-layer-idx="${layerIdx}"]`);

  if (expandedSet.has(layerIdx)) {
    const tbody = layerRow.closest("tbody");
    if (tbody) {
      const appRows = tbody.querySelectorAll<HTMLTableRowElement>(`tr.app-detail-row[data-parent-layer="${layerIdx}"]`);
      appRows.forEach((row) => row.remove());
    }
    expandedSet.delete(layerIdx);
    layerRow.classList.remove("layer-expanded");
    if (chevron) chevron.textContent = "▸";
  } else {
    const appRowsHtml = renderAppRows(scoreCube, data, solutionIdx, layerIdx);
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
  let currentScoreCube = buildScoreCube(data.solutionResults, data.layers, currentFrom, currentTo);

  // --- From / To dropdown handlers ---
  const filterFrom = document.getElementById("filter-from") as HTMLSelectElement | null;
  const filterTo = document.getElementById("filter-to") as HTMLSelectElement | null;

  function onFilterChange(): void {
    currentFrom = filterFrom?.value ?? "all";
    currentTo = filterTo?.value ?? "all";

    // Close any open drill
    closeDrill("overall-body", openDrill, openAppDrills);

    // Rebuild score cube with new filter
    currentScoreCube = buildScoreCube(data.solutionResults, data.layers, currentFrom, currentTo);

    // Re-rank and re-render
    const rankedRows = rankOverall(currentScoreCube, data.layers);
    const tbody = document.getElementById("overall-body");
    if (tbody) {
      tbody.innerHTML = renderOverallTableRows(rankedRows, data.solutions);
    }
  }

  filterFrom?.addEventListener("change", onFilterChange);
  filterTo?.addEventListener("change", onFilterChange);

  // --- Click handling ---
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;

    // Section toggle
    const header = target.closest<HTMLElement>("[data-section-toggle]");
    if (header) {
      const sectionId = header.dataset.sectionToggle;
      if (sectionId) toggleSection(sectionId);
      return;
    }

    // Second-level drill: layer row → app rows
    const layerRow = target.closest<HTMLTableRowElement>("[data-layer-drill-clickable='true']");
    if (layerRow) {
      const solutionIdx = Number(layerRow.dataset.drillSolutionIdx);
      const layerIdx = Number(layerRow.dataset.drillLayerIdx);
      if (Number.isNaN(solutionIdx) || Number.isNaN(layerIdx)) return;
      const drillRowEl = layerRow.closest<HTMLElement>(".drill-row");
      const drillId = drillRowEl?.id ?? "unknown";
      toggleAppDrill(currentScoreCube, data, layerRow, solutionIdx, layerIdx, openAppDrills, drillId);
      return;
    }

    // First-level drill: solution row → layer rows
    const row = target.closest<HTMLTableRowElement>("[data-row-clickable='true']");
    if (!row) return;
    const tableId = row.dataset.tableId;
    const rowIdx = Number(row.dataset.rowIdx);
    const solutionIdx = Number(row.dataset.solutionIdx);
    const layerIdx = Number(row.dataset.layerIdx);
    if (!tableId || Number.isNaN(rowIdx) || Number.isNaN(solutionIdx) || Number.isNaN(layerIdx)) return;
    toggleDrill(data, currentScoreCube, tableId, rowIdx, solutionIdx, layerIdx, openDrill, openAppDrills);
  });
}
