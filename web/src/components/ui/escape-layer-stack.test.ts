import { assert, assertEquals } from "@std/assert";
import { Window } from "happy-dom";
import { EscapeLayerStack } from "./escape-layer-stack.tsx";

const testWindow = new Window();

function escapeEvent(): KeyboardEvent {
    return new testWindow.KeyboardEvent("keydown", {
        key: "Escape",
        cancelable: true,
    }) as unknown as KeyboardEvent;
}

Deno.test("Escape dispatch uses the newest layer at the highest priority", () => {
    const stack = new EscapeLayerStack();
    const handled: string[] = [];
    stack.register("host", () => handled.push("host"));
    stack.register("overlay", () => handled.push("menu"));
    stack.register("overlay", () => {
        handled.push("dialog");
    });

    const event = escapeEvent();
    stack.capture(event);
    stack.dispatch(event);

    assertEquals(handled, ["dialog"]);
    assert(event.defaultPrevented);
});

Deno.test("an overlay snapshot prevents Escape falling through after it closes", () => {
    const stack = new EscapeLayerStack();
    const handled: string[] = [];
    stack.register("host", () => handled.push("host"));
    const unregisterMenu = stack.register("overlay", () => {
        handled.push("menu");
    });

    const event = escapeEvent();
    stack.capture(event);
    unregisterMenu();
    stack.dispatch(event);

    assertEquals(handled, ["menu"]);
    assertEquals(stack.hasLayer("overlay"), false);
});

Deno.test("each Escape snapshot dispatches at most one layer and respects prevention", () => {
    const stack = new EscapeLayerStack();
    let topCount = 0;
    let hostCount = 0;
    stack.register("host", () => hostCount++);
    stack.register("overlay", () => topCount++);

    const prevented = escapeEvent();
    stack.capture(prevented);
    prevented.preventDefault();
    assertEquals(stack.dispatch(prevented), false);

    const event = escapeEvent();
    stack.capture(event);
    assertEquals(stack.dispatch(event), true);
    assertEquals(stack.dispatch(event), false);
    assertEquals(topCount, 1);
    assertEquals(hostCount, 0);
});

Deno.test("Escape layer subscriptions observe active overlay changes", () => {
    const stack = new EscapeLayerStack();
    const snapshots: boolean[] = [];
    const unsubscribe = stack.subscribe(() =>
        snapshots.push(stack.hasLayer("overlay"))
    );
    const unregister = stack.register("overlay");

    unregister();
    unregister();
    assertEquals(snapshots, [true, false]);
    unsubscribe();
});

Deno.test("tooltip Escape layer takes top priority without activating modal overlay state", () => {
    const stack = new EscapeLayerStack();
    const handled: string[] = [];
    stack.register("host", () => handled.push("host"));
    stack.register("overlay", () => handled.push("dialog"));
    const unregisterTooltip = stack.register("tooltip");

    assertEquals(stack.hasLayer("tooltip"), true);
    assertEquals(stack.hasLayer("overlay"), true);

    const eventOverDialog = escapeEvent();
    stack.capture(eventOverDialog);
    assertEquals(stack.dispatch(eventOverDialog), true);
    assert(eventOverDialog.defaultPrevented);
    assertEquals(handled, []);

    unregisterTooltip();
    assertEquals(stack.hasLayer("tooltip"), false);

    // Only a tooltip over host must not count as an active modal "overlay".
    const dockStack = new EscapeLayerStack();
    dockStack.register("host", () => handled.push("host"));
    const unregisterDockTooltip = dockStack.register("tooltip");

    assertEquals(dockStack.hasLayer("tooltip"), true);
    assertEquals(dockStack.hasLayer("overlay"), false);

    const eventOverHost = escapeEvent();
    dockStack.capture(eventOverHost);
    assertEquals(dockStack.dispatch(eventOverHost), true);
    assert(eventOverHost.defaultPrevented);
    assertEquals(handled, []);

    unregisterDockTooltip();
    assertEquals(dockStack.hasLayer("overlay"), false);
});
