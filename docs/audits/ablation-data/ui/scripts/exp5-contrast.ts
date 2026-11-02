// E5: WCAG contrast of the HEAD colour tokens (parsed from tokens.css) + muted-token ablation sweep.
const css = await Deno.readTextFile("/home/aawei/ui-study-exp/base/web/src/design-system/tokens.css");
function block(startMarker: string): Record<string, string> {
  const i = css.indexOf(startMarker); if (i < 0) throw new Error(startMarker);
  let depth = 0, j = css.indexOf("{", i); const from = j;
  for (; j < css.length; j++) { if (css[j] === "{") depth++; else if (css[j] === "}") { depth--; if (!depth) break; } }
  const out: Record<string, string> = {};
  for (const m of css.slice(from, j).matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) out[m[1]] = m[2].trim();
  return out;
}
const themes = { light: block(":root {"), dark: block('[data-theme="dark"] {') };
const hex = (h: string) => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const lin = (c: number) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const L = (rgb: number[]) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const cr = (a: number[], b: number[]) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const resolve = (t: Record<string, string>, k: string): string => { let v = t[k]; while (v?.startsWith("var(")) v = t[v.slice(4, -1)]; return v; };
const out: Record<string, any> = { tokens_read: {} };
const surfaces = ["--background", "--surface", "--surface-soft"];
for (const [name, t] of Object.entries(themes)) {
  const r: Record<string, number> = {};
  const get = (k: string) => { const v = resolve(t, k) ?? resolve(themes.light, k); if (!v?.startsWith("#")) throw new Error(`${name} ${k}=${v}`); return hex(v); };
  for (const fg of ["--foreground", "--muted", "--danger", "--success", "--warning"])
    for (const bg of surfaces) r[`text ${fg} on ${bg}`] = +cr(get(fg), get(bg)).toFixed(2);
  for (const bg of surfaces) r[`border-control vs ${bg} (need>=3)`] = +cr(get("--border-control"), get(bg)).toFixed(2);
  out.tokens_read[name] = Object.fromEntries(["--background", "--surface", "--surface-soft", "--foreground", "--muted", "--border-control", "--danger", "--success", "--warning"].map((k) => [k, resolve(t, k) ?? "(inherits light)"]));
  out[`contrast_${name}`] = r;
  out[`below_4.5_text_${name}`] = Object.entries(r).filter(([k, v]) => k.startsWith("text") && v < 4.5).map(([k, v]) => `${k}=${v}`);
  out[`below_3_border_${name}`] = Object.entries(r).filter(([k, v]) => k.startsWith("border") && v < 3).map(([k, v]) => `${k}=${v}`);
}
// ablation sweep: neutral-gray --muted level g (R=G=B-ish), worst of the three surfaces; light darkest->lightest, dark lightest->darkest
for (const name of ["light", "dark"] as const) {
  const t = themes[name]; const bgs = surfaces.map((k) => hex(resolve(t, k) ?? resolve(themes.light, k)));
  const rows: any[] = []; let threshold: number | null = null;
  const range = name === "light" ? Array.from({ length: 22 }, (_, i) => 0x50 + i * 8) : Array.from({ length: 22 }, (_, i) => 0xC8 - i * 8);
  for (const g of range) {
    const worst = Math.min(...bgs.map((b) => cr([g, g, g + 5], b)));
    rows.push({ muted_gray: "#" + [g, g, g + 5].map((x) => x.toString(16).padStart(2, "0")).join(""), worstContrast: +worst.toFixed(2), pass4_5: worst >= 4.5 });
    if (threshold === null && worst < 4.5) threshold = g;
  }
  out[`muted_sweep_${name}`] = { firstFailingGray: threshold, current: resolve(t, "--muted"), rows };
}
// Candidate "plausible regressions" from the same palette
const lightBgs = surfaces.map((k) => hex(resolve(themes.light, k)));
out.regression_candidates_light = Object.fromEntries(["#86868B", "#8E8E93", "#757575", "#6E6E73"].map((c) => [c, +Math.min(...lightBgs.map((b) => cr(hex(c), b))).toFixed(2)]));
// semantic.css .status-banner: fg tone on color-mix(in srgb, tone P%, --surface) (error 10%, warning --warning-soft 12%, success 10%)
const mix = (a: number[], b: number[], p: number) => a.map((x, i) => x * p + b[i] * (1 - p));
out.status_banner_contrast = {};
for (const [name, t] of Object.entries(themes)) {
  const surf = hex(resolve(t, "--surface") ?? resolve(themes.light, "--surface"));
  for (const [tone, p] of [["--danger", 0.10], ["--warning", 0.12], ["--success", 0.10]] as const) {
    const fg = hex(resolve(t, tone) ?? resolve(themes.light, tone));
    out.status_banner_contrast[`${name} ${tone} on ${p * 100}% mix over --surface`] = +cr(fg, mix(fg, surf, p)).toFixed(2);
  }
  // apps.css .app-dialog-url-status.success text directly on --surface (no fill) and error on --surface-soft
  out.status_banner_contrast[`${name} app-dialog-url-status.success --success on --surface`] = +cr(hex(resolve(t, "--success") ?? resolve(themes.light, "--success")), surf).toFixed(2);
}
console.log(JSON.stringify(out, null, 1));
