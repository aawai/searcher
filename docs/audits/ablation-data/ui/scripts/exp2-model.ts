// E2: omnibox result model (grouping/order/limits/401/no-smart-routing) vs docs oracle, HEAD + ablations.
// deno-lint-ignore-file no-explicit-any
const P = "../base/web/src/features/omnibox/omnibox-model";
const names = ["BASE","M1_no_401_gate","M2_history_limit_6","M3_web_first_order","M4_ai_not_gated","M5_smart_route_bare_command","M6_no_dedupe_web"];
const mods: Record<string, any> = {};
for (const n of names) mods[n] = await import(n === "BASE" ? `${P}.ts` : `${P}.abl_${n}.ts`);
const ORDER = ["ai","mine","apps","web","commands"]; // docs table order
const docs = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `d${i}`, displayTitle: `cat note ${i}`, isHomeFixed: i % 2 === 0 }));
const apps = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, name: `cat app ${i}`, url: `https://x${i}.test/`, groupId: null, iconAssetId: null, iconSource: "default", openMode: "global" }));
const queries = ["", "   ", "c", "cat", "/", "/s", "/settings", "/g", "/g cat", "/ai", "/ai cat", "/zzz", "/g "];
const ctxs = [] as any[];
for (const signedIn of [false, true]) for (const ai of [false, true]) for (const personalAllowed of [true, false]) {
  if (!signedIn && personalAllowed) continue; // guests never have personal access
  ctxs.push({ signedIn, ai, personalAllowed: signedIn && personalAllowed, label: `${signedIn ? "in" : "guest"}|ai=${ai}|p=${signedIn && personalAllowed}` });
}
const dataset = (c: any) => ({
  aiAvailable: c.ai, personalAllowed: c.personalAllowed,
  personal: c.personalAllowed ? { query: "", documents: docs(5), apps: apps(5) } : null,
  folders: [{ id: "f1", name: "cat folder" }], libraryApps: [],
  history: ["cat", "Cat", "cat a", "cat b", "cat c", "cat d"],           // 6 entries incl. case-duplicate "Cat"
  online: ["cat", "cat e", "cat f", "cat g", "cat h", "cat i", "cat j"].map((text) => ({ text })), // 7 online, 'cat' duplicates history
});
const tally: Record<string, Record<string, number>> = {};
const examples: Record<string, string[]> = {};
function viol(v: string, rule: string, ex: string) { (tally[v] ??= {})[rule] = (tally[v][rule] ?? 0) + 1; ((examples[`${v}:${rule}`]) ??= []).length < 2 && examples[`${v}:${rule}`].push(ex); }
let cases = 0;
for (const v of names) {
  const m = mods[v];
  tally[v] = {};
  for (const c of ctxs) for (const q of queries) {
    const ctx = { aiAvailable: c.ai, signedIn: c.signedIn };
    const resolved = m.resolveOmniboxQuery({ raw: q, engine: "google", context: ctx });
    const groups = m.buildOmniboxGroups(resolved, dataset(c));
    const id = `${c.label}|q=${JSON.stringify(q)}`;
    if (v === "BASE") cases++;
    const ids = groups.map((g: any) => g.id);
    // R1 fixed order
    const idx = ids.map((x: string) => ORDER.indexOf(x));
    if (idx.some((x: number, i: number) => i > 0 && x < idx[i - 1])) viol(v, "R1_group_order", id);
    // R2 guests / 401: only web + commands
    if ((!c.signedIn || !c.personalAllowed) && ids.some((x: string) => x === "mine" || x === "apps")) viol(v, "R2_personal_groups_without_session", id);
    // R3 no AI row without model
    if (!c.ai && ids.includes("ai")) viol(v, "R3_ai_row_without_model", id);
    // R4 web <=6 and history <=3 (history items first)
    const web = groups.find((g: any) => g.id === "web");
    if (web) {
      if (web.items.length > 6) viol(v, "R4a_web_over_6", id);
      if (web.items.filter((i: any) => i.kind === "history").length > 3) viol(v, "R4b_history_over_3", id);
      const texts = web.items.map((i: any) => i.text.toLowerCase());
      if (new Set(texts).size !== texts.length) viol(v, "R4c_duplicate_web_text", id);
    }
    // R5 empty groups never shown
    if (groups.some((g: any) => g.items.length === 0)) viol(v, "R5_empty_group_shown", id);
    // R6 no smart routing: bare '/settings' '/g' '/ai' + Enter without selection = literal default-engine search
    const act = m.defaultSubmitAction(q, false, c.ai);
    if (q.trim() && /^\/(settings|g|ai)$/.test(q.trim()) && !(act && act.type === "search" && act.text === q.trim())) viol(v, "R6_bare_command_not_literal_search", id);
    // R7 /ai q without model: literal search
    if (q === "/ai cat" && !c.ai && !(act?.type === "search" && act.text === "/ai cat")) viol(v, "R7_ai_prefix_without_model_not_literal", id);
    // R8 explicit '/g cat' searches 'cat' on bing/google engine prefix
    if (q === "/g cat" && !(act?.type === "search" && act.text === "cat" && act.engine)) viol(v, "R8_engine_prefix_not_applied", id);
  }
}
console.log(JSON.stringify({ scenarios_per_variant: cases, queries, contexts: ctxs.map((c) => c.label), violations_by_rule: tally, example_scenarios: examples }, null, 1));
