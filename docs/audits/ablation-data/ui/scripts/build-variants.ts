// Builds ablated copies of HEAD source files NEXT TO the originals inside the
// snapshot tree (/home/aawei/ui-study-exp/base, a `git archive HEAD` extract),
// so relative imports keep working. Each replacement must match exactly once.
const ROOT = "/home/aawei/ui-study-exp/base/web/src";
type Patch = { file: string; name: string; from: string; to: string };
const patches: Patch[] = [
  // ---- omnibox-keys ----
  { file: "features/omnibox/omnibox-keys.ts", name: "K1_no_ime_guard",
    from: `    if (key === "Enter" && input.composing) return { type: "swallow" };\n    if (input.composing || key === "Tab") return IGNORE;`,
    to: `    if (key === "Tab") return IGNORE;` },
  { file: "features/omnibox/omnibox-keys.ts", name: "K2_ime_enter_ignore_not_swallow",
    from: `    if (key === "Enter" && input.composing) return { type: "swallow" };\n`, to: `` },
  { file: "features/omnibox/omnibox-keys.ts", name: "K3_escape_ignores_open",
    from: `if (key === "Escape") return input.open ? { type: "close" } : IGNORE;`,
    to: `if (key === "Escape") return { type: "close" };` },
  { file: "features/omnibox/omnibox-keys.ts", name: "K4_arrow_modifiers_allowed",
    from: `        if (mod || shiftKey || altKey) return IGNORE;\n        if (!input.open`,
    to: `        if (!input.open` },
  { file: "features/omnibox/omnibox-keys.ts", name: "K5_ai_not_gated_by_model",
    from: `return input.aiAvailable && input.hasText ? { type: "ask-ai" } : IGNORE;`,
    to: `return input.hasText ? { type: "ask-ai" } : IGNORE;` },
  { file: "features/omnibox/omnibox-keys.ts", name: "K6_capture_not_gated_by_login",
    from: `return input.canCapture && input.hasText ? { type: "capture" } : IGNORE;`,
    to: `return input.hasText ? { type: "capture" } : IGNORE;` },
  { file: "features/omnibox/omnibox-keys.ts", name: "K7_alt_enter_combo_allowed",
    from: `        if (mod || shiftKey) return IGNORE;\n        return input.aiAvailable`,
    to: `        return input.aiAvailable` },
  // ---- omnibox-model ----
  { file: "features/omnibox/omnibox-model.ts", name: "M1_no_401_gate",
    from: `if (data.personalAllowed) {`, to: `if (true) {` },
  { file: "features/omnibox/omnibox-model.ts", name: "M2_history_limit_6",
    from: `export const WEB_HISTORY_LIMIT = 3;`, to: `export const WEB_HISTORY_LIMIT = 6;` },
  { file: "features/omnibox/omnibox-model.ts", name: "M3_web_first_order",
    from: `    "ai",\n    "mine",\n    "apps",\n    "web",\n    "commands",\n];\nexport const OMNIBOX_GROUP_LABELS`,
    to: `    "web",\n    "ai",\n    "mine",\n    "apps",\n    "commands",\n];\nexport const OMNIBOX_GROUP_LABELS` },
  { file: "features/omnibox/omnibox-model.ts", name: "M4_ai_not_gated",
    from: `if (data.aiAvailable) {`, to: `if (true) {` },
  { file: "features/omnibox/omnibox-model.ts", name: "M5_smart_route_bare_command",
    // ablate "no smart routing": bare '/settings'-style input is turned into the command search
    from: `    const text = raw.trim();\n    if (!text) return null;\n    const prefix = parseCommandPrefix(raw);`,
    to: `    const text = raw.trim();\n    if (!text) return null;\n    const prefix = parseCommandPrefix(raw);\n    if (prefix && !prefix.hasSpace) return { type: "fill", text: prefix.prefix + " " };` },
  { file: "features/omnibox/omnibox-model.ts", name: "M6_no_dedupe_web",
    from: `        if (!key.includes(needle) || seen.has(key)) continue;`,
    to: `        if (!key.includes(needle)) continue;` },
  // ---- home library plan ----
  { file: "components/searcher/homeLibraryLayout.ts", name: "P1_no_lone_tile_narrowing",
    from: `        count > 1 && originalLastRow === 1`, to: `        false && count > 1 && originalLastRow === 1` },
  { file: "components/searcher/homeLibraryLayout.ts", name: "P2_narrow_even_with_large_folder",
    from: `        !tiles.some((tile) =>\n            tile.type === "folder" && tile.group.folderSize === "large"\n        )\n    ) {`,
    to: `        true\n    ) {` },
  { file: "components/searcher/homeLibraryLayout.ts", name: "P3_no_more_cell_reservation",
    from: `const placed = calculateDesktopLayout(items, cols, [moreCell]);`,
    to: `const placed = calculateDesktopLayout(items, cols, []);` },
  { file: "components/searcher/homeLibraryLayout.ts", name: "H1_no_bottom_clearance",
    from: `const clearance = Math.max(bottomClearance, dockBottom + rowGap);`,
    to: `const clearance = 0;` },
  { file: "components/searcher/homeLibraryLayout.ts", name: "H2_ignore_plate_padding",
    from: `layoutViewportHeight - gridTop - clearance - platePadding + rowGap`,
    to: `layoutViewportHeight - gridTop - clearance + rowGap` },
  // ---- composition anchor ----
  { file: "features/home-layouts/home-grid-cells.ts", name: "C1_no_clearance_cap",
    from: `const maximum = options.viewportHeight - clearance - options.blockHeight;`,
    to: `const maximum = Infinity;` },
];
let n = 0;
for (const p of patches) {
  const path = `${ROOT}/${p.file}`;
  const src = await Deno.readTextFile(path);
  const count = src.split(p.from).length - 1;
  if (count !== 1) throw new Error(`${p.name}: pattern matched ${count} times`);
  const out = path.replace(/\.ts$/, `.abl_${p.name}.ts`);
  await Deno.writeTextFile(out, src.replace(p.from, () => p.to));
  n++;
}
console.log(`built ${n} variants`);
