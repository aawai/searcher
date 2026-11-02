// E4: home library planning (planHomeLibrary), bottom-clearance (effectiveRows) and 38% anchor (composeBlockTop).
// deno-lint-ignore-file no-explicit-any
const L = "../base/web/src/components/searcher/homeLibraryLayout";
const Cm = "../base/web/src/features/home-layouts/home-grid-cells";
const vs: Record<string, any> = {};
for (const n of ["BASE","P1_no_lone_tile_narrowing","P2_narrow_even_with_large_folder","P3_no_more_cell_reservation","H1_no_bottom_clearance","H2_ignore_plate_padding"])
  vs[n] = await import(n === "BASE" ? `${L}.ts` : `${L}.abl_${n}.ts`);
const comp: Record<string, any> = { BASE: await import(`${Cm}.ts`), C1_no_clearance_cap: await import(`${Cm}.abl_C1_no_clearance_cap.ts`) };

const mkTiles = (n: number, large: number[] = []) => Array.from({ length: n }, (_, i) => large.includes(i)
  ? { type: "folder", id: `t${i}`, group: { id: `g${i}`, name: "f", folderSize: "large" }, apps: [] }
  : { type: "app", id: `t${i}`, app: { id: `a${i}` } });

const out: Record<string, any> = {};
// ---- doc-claimed examples (docs/workspace.md line 15 & VISUAL_LANGUAGE 242)
const colsUsed = (plan: any) => plan.visible.length ? Math.max(...plan.visible.map((v: any) => v.col + v.colSpan)) : 0;
const rowsUsed = (plan: any) => plan.visible.length ? Math.max(...plan.visible.map((v: any) => v.row + v.rowSpan)) : 0;
const lastRowCount = (plan: any) => { const r = rowsUsed(plan) - 1; return plan.visible.filter((v: any) => v.row === r).length; };
for (const [name, m] of Object.entries(vs)) {
  if (!name.startsWith("P") && name !== "BASE") continue;
  const ex: Record<string, any> = {};
  for (const [count, columns, rows] of [[19, 6, 4], [8, 7, 4], [12, 6, 4], [7, 6, 4], [13, 6, 4]]) {
    const p = m.planHomeLibrary({ tiles: mkTiles(count), columns, rows });
    ex[`${count}tiles/${columns}cols/${rows}rows`] = { colsUsed: colsUsed(p), rowsUsed: rowsUsed(p), lastRowTiles: lastRowCount(p), overflow: p.overflow.length, more: p.more };
  }
  // ---- sweep
  let differs = 0, differsLarge = 0; const baseResidual: string[] = [];
  let configs = 0, loneLastRow = 0, itemsLost = 0, moreOverlapsTile = 0, rowsExceeded = 0, rowGrowth = 0, largeFolderConfigs = 0, largeLoneLast = 0;
  for (let count = 1; count <= 40; count++) for (let columns = 2; columns <= 9; columns++) for (let rows = 1; rows <= 4; rows++) for (const large of [[], [0], [1, 5]]) {
    if (large.some((i) => i >= count)) continue;
    configs++;
    const tiles = mkTiles(count, large);
    const p = m.planHomeLibrary({ tiles, columns, rows });
    const bp = vs.BASE.planHomeLibrary({ tiles, columns, rows });
    const sig = (q: any) => JSON.stringify([q.visible.map((v: any) => [v.tile.id, v.col, v.row]), q.overflow.map((t: any) => t.id), q.more]);
    if (sig(p) !== sig(bp)) { differs++; if (large.length) differsLarge++; }
    if (name === "BASE" && !p.more && large.length === 0 && count > 1 && lastRowCount(p) === 1 && rowsUsed(p) > 1) baseResidual.push(`${count}t/${columns}c/${rows}r`);
    if (p.visible.length + p.overflow.length !== count) itemsLost++;
    if (rowsUsed(p) > rows) rowsExceeded++;
    if (p.more && p.visible.some((v: any) => v.col <= p.more.col && p.more.col < v.col + v.colSpan && v.row <= p.more.row && p.more.row < v.row + v.rowSpan)) moreOverlapsTile++;
    if (!p.more && large.length === 0 && count > 1 && lastRowCount(p) === 1 && rowsUsed(p) > 1) loneLastRow++;
    if (large.length) { largeFolderConfigs++; }
    const baseRows = Math.ceil(count / Math.max(2, columns));
    if (!p.more && large.length === 0 && rowsUsed(p) > baseRows) rowGrowth++;
  }
  out[`plan:${name}`] = { examples: ex, sweep: { configs, loneLastRow_noOverflow_noLarge: loneLastRow, itemsLost, rowsExceededCapacity: rowsExceeded, moreCellOverlapsTile: moreOverlapsTile, rowCountGrewBeyondUnnarrowed: rowGrowth, layoutsDifferingFromBase: differs, ofWhich_withLargeFolder: differsLarge, baseResidualLoneLastRow: baseResidual } };
}
// ---- effectiveRows: plate bottom clearance >= 48 (docs: 底板外下缘须保留至少 48px 视口留白; rows reduced, anchor not moved)
// Parameters (ASSUMPTIONS, not measured in a browser): app cell 76 / gap 12 (wide fine pointer), plate padding 16,
// searchHeight 56 (unmeasured), gridTop = blockTop + searchHeight + 20 (gap assumed) + plate padding 16.
const cell = 76, gap = 12, pitch = cell + gap, padding = 16, searchH = 56, gapSearchPlate = 20;
for (const name of ["BASE", "H1_no_bottom_clearance", "H2_ignore_plate_padding"]) {
  const m = vs[name];
  let n = 0, viol = 0, minClear = Infinity, atMin1Row = 0, anchorMoved = 0; const ex: any[] = [];
  for (let vh = 400; vh <= 1400; vh += 4) {
    n++;
    const baseTop = Math.round(vh * 0.38 - searchH / 2);
    const gridTop = baseTop + searchH + gapSearchPlate + padding;
    const rows = m.effectiveRows({ layoutViewportHeight: vh, gridTop, rowPitch: pitch, rowGap: gap, platePadding: padding });
    const plateBottom = gridTop + rows * pitch - gap + padding;
    const clear = vh - plateBottom;
    minClear = Math.min(minClear, clear);
    if (clear < 48) { viol++; if (rows === 1) atMin1Row++; if (ex.length < 3) ex.push({ vh, rows, clearance: clear }); }
    const blockH = searchH + gapSearchPlate + (rows * pitch - gap + 2 * padding);
    const top = comp.BASE.composeBlockTop({ viewportHeight: vh, searchHeight: searchH, blockHeight: blockH });
    if (top !== baseTop) anchorMoved++;
  }
  out[`effectiveRows:${name}`] = { viewportHeights_tested: n, clearanceViolations_lt48px: viol, ofWhich_atFloorOf1Row: atMin1Row, minClearancePx: minClear, anchorMovedViaComposeBlockTop: anchorMoved, firstViolations: ex };
}
// ---- composeBlockTop with the clearance cap ablated, using the tallest block the BASE rows rule permits
for (const [name, c] of Object.entries(comp)) {
  let moved = 0, n = 0, worst = 0;
  for (let vh = 400; vh <= 1400; vh += 4) for (const rowsFixed of [1, 2, 3, 4]) {
    n++;
    const blockH = searchH + gapSearchPlate + (rowsFixed * pitch - gap + 2 * padding);
    const top = c.composeBlockTop({ viewportHeight: vh, searchHeight: searchH, blockHeight: blockH });
    const baseTop = Math.round(vh * 0.38 - searchH / 2);
    if (top !== baseTop) { moved++; worst = Math.max(worst, baseTop - top); }
    // also: does block bottom keep >=48 clearance
  }
  out[`composeBlockTop_unconstrained_rows:${name}`] = { cases: n, anchorMoved: moved, maxUpwardShiftPx: worst, note: "rows forced 1..4 irrespective of effectiveRows; shows what the cap in composeBlockTop does when rows are NOT reduced" };
}
console.log(JSON.stringify(out, null, 1));
