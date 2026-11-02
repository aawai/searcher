// E6: window geometry (clamp/project/resize/initialRect sliced from HEAD WindowFrame.tsx; the functions are not exported)
// Seeded randomized property test + ablations. deno-lint-ignore-file no-explicit-any
const SRC = await Deno.readTextFile("/home/aawei/ui-study-exp/base/web/src/features/windowing/WindowFrame.tsx");
const a = SRC.indexOf("type Rect ="), b = SRC.indexOf("const TAB_STOP");
const body = SRC.slice(a, b).replace(/^type Operation[\s\S]*?\n};\n/m, "");
async function mk(patches: [string, string][]) {
  let code = body;
  for (const [f, t] of patches) { if (code.split(f).length !== 2) throw new Error("pattern: " + f); code = code.replace(f, () => t); }
  code += "\nexport { clamp, project, resize, initialRect };";
  return await import("data:text/typescript;base64," + btoa(unescape(encodeURIComponent(code))));
}
const V: Record<string, [string, string][]> = {
  BASE: [],
  W1_project_no_size_clamp: [[`const width = Math.min(rect.width, area.width);\n    const height = Math.min(rect.height, area.height);`, `const width = rect.width;\n    const height = rect.height;`]],
  W2_project_no_position_clamp: [[`x: clamp(rect.x, area.x, area.x + area.width - width),\n        y: clamp(rect.y, area.y, area.y + area.height - height),`, `x: rect.x,\n        y: rect.y,`]],
  W3_resize_no_min_size: [[`const minW = Math.min(g.minWidth, a.width),\n        minH = Math.min(g.minHeight, a.height);`, `const minW = 0, minH = 0;`]],
  W4_resize_no_area_bounds: [[`if (direction.includes("w")) left = clamp(left + dx, a.x, right - minW);`, `if (direction.includes("w")) left = clamp(left + dx, -1e9, right - minW);`]],
  W5_clamp_min_wins_removed: [[`Math.max(min, Math.min(value, Math.max(min, max)))`, `Math.max(min, Math.min(value, max))`]],
};
// mulberry32
function rng(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const SEED = 20261102, N = 20000;
const inside = (r: any, a: any) => r.x >= a.x - 1e-9 && r.y >= a.y - 1e-9 && r.x + r.width <= a.x + a.width + 1e-9 && r.y + r.height <= a.y + a.height + 1e-9;
const out: Record<string, any> = { seed: SEED, trials: N };
for (const [name, patches] of Object.entries(V)) {
  const m = await mk(patches); const rnd = rng(SEED);
  let projOutside = 0, projTooBig = 0, resizeBelowMin = 0, resizeOutside = 0, initialOutside = 0, initialOutsideAfterProject = 0, nanOrNeg = 0;
  const dirs = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  for (let i = 0; i < N; i++) {
    const area = { x: Math.round(rnd() * 100), y: Math.round(rnd() * 100), width: 300 + Math.round(rnd() * 1700), height: 250 + Math.round(rnd() * 900) };
    const g: any = { area, wide: true, step: 16, fine: 4, minWidth: 320, minHeight: 240, defaultWidth: 960, defaultHeight: 720, anchor: null };
    if (rnd() < 0.6) {
      const edge = ["bottom", "top", "left", "right"][Math.floor(rnd() * 4)];
      g.anchor = { edge, rect: { x: area.x + Math.round(rnd() * area.width), y: area.y + Math.round(rnd() * area.height), width: 44, height: 44 } };
    }
    const rect = { x: Math.round(rnd() * 2400 - 200), y: Math.round(rnd() * 1400 - 200), width: 100 + Math.round(rnd() * 1500), height: 100 + Math.round(rnd() * 900) };
    const p = m.project(rect, area);
    if (!inside(p, area)) projOutside++;
    if (p.width > area.width || p.height > area.height) projTooBig++;
    const start = m.project({ x: area.x + rnd() * 200, y: area.y + rnd() * 100, width: Math.min(area.width, 500 + rnd() * 400), height: Math.min(area.height, 300 + rnd() * 300) }, area);
    const d = dirs[Math.floor(rnd() * 8)];
    const r = m.resize(start, d, Math.round(rnd() * 3000 - 1500), Math.round(rnd() * 2000 - 1000), g);
    if (r.width < Math.min(g.minWidth, area.width) - 1e-9 || r.height < Math.min(g.minHeight, area.height) - 1e-9) resizeBelowMin++;
    if (!inside(r, area)) resizeOutside++;
    if ([r.x, r.y, r.width, r.height, p.x, p.y].some((v: number) => !Number.isFinite(v) || v < -1e8)) nanOrNeg++;
    const ir = m.initialRect(g, area);
    if (!inside(ir, area)) { initialOutside++; if (!inside(m.project(ir, area), area)) initialOutsideAfterProject++; }
  }
  out[name] = { project_resultOutsideArea: projOutside, project_widerOrTallerThanArea: projTooBig, resize_belowMinSize: resizeBelowMin, resize_resultOutsideArea: resizeOutside, initialRect_outsideArea_beforeProject: initialOutside, initialRect_outsideArea_afterProject: initialOutsideAfterProject, nonFinite_or_far_offscreen: nanOrNeg };
}
console.log(JSON.stringify(out, null, 1));
