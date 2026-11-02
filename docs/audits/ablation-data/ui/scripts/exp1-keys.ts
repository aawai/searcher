// E1: omnibox keyboard decision table, exhaustive state grid, spec oracle vs HEAD + ablations.
import { decideOmniboxKey as base, type OmniboxKeyInput } from "../base/web/src/features/omnibox/omnibox-keys.ts";
const D = "../base/web/src/features/omnibox/omnibox-keys.abl_";
const variants: Record<string, (i: OmniboxKeyInput) => { type: string; newTab?: boolean }> = { BASE: base };
for (const n of ["K1_no_ime_guard","K2_ime_enter_ignore_not_swallow","K3_escape_ignores_open","K4_arrow_modifiers_allowed","K5_ai_not_gated_by_model","K6_capture_not_gated_by_login","K7_alt_enter_combo_allowed"]) {
  variants[n] = (await import(`${D}${n}.ts`)).decideOmniboxKey;
}
// Independent oracle written from docs/workspace.md "键盘" table (effects only; swallow == no effect
// because SearcherSearchInput.handleKeyDown calls preventDefault on every Enter anyway).
// `documented`=false marks cells the docs do not specify (Ctrl+Meta, Mod+Shift, Mod+Alt, Alt+Shift combos).
function oracle(i: OmniboxKeyInput): { effect: string; documented: boolean } {
  const mod = i.ctrlKey || i.metaKey;
  if (i.composing) return { effect: "none", documented: true };      // "输入法合成中 以上按键一律不响应"
  if (i.key === "Tab") return { effect: "none", documented: true };  // Tab: browser default
  if (i.key === "Escape") return { effect: i.open ? "close" : "none", documented: true };
  if (i.key === "ArrowUp" || i.key === "ArrowDown") {
    const plain = !mod && !i.shiftKey && !i.altKey;
    return { effect: plain && i.open && i.optionCount > 0 ? "move" : "none", documented: plain }; // modified arrows undocumented
  }
  if (i.key !== "Enter") return { effect: "none", documented: true };
  if (i.ctrlKey && i.metaKey) return { effect: "none", documented: false };
  const only = (a: boolean, s: boolean, m: boolean) => i.altKey === a && i.shiftKey === s && mod === m;
  if (only(false, false, false)) return { effect: "submit:cur", documented: true };
  if (only(false, false, true)) return { effect: "submit:new", documented: true };
  if (only(true, false, false)) return { effect: i.aiAvailable && i.hasText ? "ask-ai" : "none", documented: true };
  if (only(false, true, false)) return { effect: i.canCapture && i.hasText ? "capture" : "none", documented: true };
  return { effect: "none", documented: false };
}
const effect = (a: { type: string; newTab?: boolean }) =>
  a.type === "submit" ? (a.newTab ? "submit:new" : "submit:cur") : (a.type === "ignore" || a.type === "swallow") ? "none" : a.type;

const bools = [false, true];
const states: OmniboxKeyInput[] = [];
for (const key of ["Enter","Escape","ArrowDown","ArrowUp","Tab","a"])
 for (const ctrlKey of bools) for (const metaKey of bools) for (const shiftKey of bools) for (const altKey of bools)
  for (const composing of bools) for (const open of bools) for (const optionCount of [0, 3])
   for (const aiAvailable of bools) for (const canCapture of bools) for (const hasText of bools)
    states.push({ key, ctrlKey, metaKey, shiftKey, altKey, composing, open, optionCount, aiAvailable, canCapture, hasText });

const out: Record<string, unknown> = { total_states: states.length };
for (const [name, fn] of Object.entries(variants)) {
  let changedVsBase = 0, specViolDocumented = 0, specViolUndocumented = 0, fireWhileComposing = 0, escapeConsumedWhenClosed = 0, guestAi = 0, guestCapture = 0, rawActionDiffers = 0;
  const byKey: Record<string, number> = {};
  for (const s of states) {
    const a = fn(s), b = base(s), o = oracle(s);
    const e = effect(a);
    if (e !== effect(b)) { changedVsBase++; byKey[s.key] = (byKey[s.key] ?? 0) + 1; }
    if (a.type !== b.type) rawActionDiffers++;
    if (e !== o.effect) o.documented ? specViolDocumented++ : specViolUndocumented++;
    if (s.composing && e !== "none") fireWhileComposing++;
    if (s.key === "Escape" && !s.open && e === "close") escapeConsumedWhenClosed++;
    if (e === "ask-ai" && !s.aiAvailable) guestAi++;
    if (e === "capture" && !s.canCapture) guestCapture++;
  }
  out[name] = { changedVsBase_effect: changedVsBase, rawActionTypeDiffersVsBase: rawActionDiffers, specViolations_documentedCells: specViolDocumented, specViolations_undocumentedCells: specViolUndocumented, effectsWhileComposing: fireWhileComposing, escapeConsumedWhileListClosed: escapeConsumedWhenClosed, askAiWithoutModel: guestAi, captureWithoutLogin: guestCapture, changedByKey: byKey };
}
console.log(JSON.stringify(out, null, 1));
