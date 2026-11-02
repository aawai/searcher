// E3: EscapeLayerStack (HEAD source, class sliced out of escape-layer-stack.tsx) event-snapshot / dedupe /
// priority / IME ablations driven by synthetic KeyboardEvent-like objects.
// deno-lint-ignore-file no-explicit-any
const SRC = await Deno.readTextFile("/home/aawei/ui-study-exp/base/web/src/components/ui/escape-layer-stack.tsx");
const start = SRC.indexOf("export type EscapeLayerKind");
const end = SRC.indexOf("const EscapeLayerContext");
const cls = SRC.slice(start, end);
function mk(patches: [string, string][]) {
  let code = cls;
  for (const [from, to] of patches) {
    if (code.split(from).length !== 2) throw new Error("pattern count != 1: " + from);
    code = code.replace(from, () => to);
  }
  const url = "data:text/typescript;base64," + btoa(unescape(encodeURIComponent(code)));
  return import(url).then((m) => m.EscapeLayerStack as any);
}
const V: Record<string, [string, string][]> = {
  BASE: [],
  // dispatch recomputes the top layer at dispatch time instead of using the capture-phase snapshot
  S1_no_event_snapshot: [
    [`this.eventLayers.set(event, this.topLayer());`, `/* snapshot removed */`],
    [`!this.eventLayers.has(event)`, `false`],
    [`const layer = this.eventLayers.get(event);`, `const layer = this.topLayer();`],
  ],
  S2_no_dispatch_dedupe: [[`this.dispatchedEvents.has(event) ||`, ``]],
  S3_equal_priority_host_overlay: [[`host: 0,\n    overlay: 1,\n    "window-overlay": 1,`, `host: 0,\n    overlay: 0,\n    "window-overlay": 0,`]],
  S4a_ime_check_removed_in_capture_only: [[`if (event.key !== "Escape" || event.isComposing) return;`, `if (event.key !== "Escape") return;`]],
  S4b_ime_check_removed_everywhere: [
    [`if (event.key !== "Escape" || event.isComposing) return;`, `if (event.key !== "Escape") return;`],
    [`event.key !== "Escape" || event.isComposing ||\n            event.defaultPrevented`, `event.key !== "Escape" ||\n            event.defaultPrevented`],
  ],
  S5_dispatch_ignores_defaultPrevented: [[`event.defaultPrevented || `, ``]],
};
const ev = (o: any = {}) => ({ key: "Escape", isComposing: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...o });
type Stack = any;
function press(stack: Stack, e: any, between?: () => void, listeners = 1) {
  stack.capture(e);
  between?.();               // e.g. a Base UI menu closes itself on this same keydown and unregisters
  for (let i = 0; i < listeners; i++) {
    // a second document-level listener (e.g. duplicate provider mount) sees an already-prevented event unless S5
    stack.dispatch(e);
  }
}
const results: Record<string, any> = {};
for (const [name, patches] of Object.entries(V)) {
  const Stack = await mk(patches);
  const r: Record<string, number> = {};
  // Scenario A: host(answer card) + menu overlay; menu unregisters itself during the same Escape keydown
  {
    const s = new Stack(); const closed: string[] = [];
    s.register("host", () => closed.push("host"));
    let un: () => void; un = s.register("overlay", () => { closed.push("menu"); un(); });
    press(s, ev(), () => un());                // overlay already gone when dispatch runs
    r.A_layers_closed_by_one_escape_overlay_selfclose = closed.length;  // want <=1 (the overlay's own close), host must NOT close
    r.A_host_closed_in_same_press = closed.includes("host") ? 1 : 0;
  }
  // Scenario B: three nested layers, 3 presses -> must close exactly 1 per press, in LIFO
  {
    const s = new Stack(); const order: string[] = [];
    const unregs: Record<string, () => void> = {};
    s.register("host", () => order.push("host"));
    unregs.o1 = s.register("overlay", () => { order.push("o1"); unregs.o1(); });
    unregs.o2 = s.register("overlay", () => { order.push("o2"); unregs.o2(); });
    for (let i = 0; i < 3; i++) press(s, ev());
    r.B_order_correct = JSON.stringify(order) === JSON.stringify(["o2", "o1", "host"]) ? 1 : 0;
    r.B_closes_total = order.length;
  }
  // Scenario C: host registered AFTER overlay (e.g. answer card mounts while menu open) – overlay must still win
  {
    const s = new Stack(); const order: string[] = [];
    s.register("overlay", () => order.push("overlay"));
    s.register("host", () => order.push("host"));
    press(s, ev());
    r.C_overlay_wins_over_later_host = order[0] === "overlay" ? 1 : 0;
  }
  // Scenario D: IME composition – no handler may run
  {
    const s = new Stack(); let n = 0; s.register("overlay", () => n++);
    press(s, ev({ isComposing: true }));
    r.D_handlers_run_during_ime = n;
  }
  // Scenario E: same event dispatched twice (two listeners) – handler must run once
  {
    const s = new Stack(); let n = 0; s.register("overlay", () => n++);
    press(s, ev(), undefined, 2);
    r.E_handler_runs_for_double_dispatch = n;
  }
  // Scenario E2: same event dispatched twice and preventDefault is a no-op (non-cancelable event)
  {
    const s = new Stack(); let n = 0; s.register("overlay", () => n++);
    press(s, ev({ preventDefault() {} }), undefined, 2);
    r.E2_handler_runs_for_double_dispatch_noncancelable = n;
  }
  // Scenario F: default already prevented by the omnibox (suggestion list close) – layers must not also close
  {
    const s = new Stack(); let n = 0; s.register("host", () => n++);
    press(s, ev({ defaultPrevented: true }));
    r.F_layer_closed_after_input_handled_escape = n;
  }
  // Scenario G: no layers – Escape must not be consumed
  {
    const s = new Stack(); const e: any = ev(); press(s, e);
    r.G_consumed_with_no_layer = e.defaultPrevented ? 1 : 0;
  }
  results[name] = r;
}
console.log(JSON.stringify(results, null, 1));
