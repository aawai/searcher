import { assertEquals } from "@std/assert";
import {
    deskNeighbour,
    layoutDesk,
    mockDeskObjects,
    pinchIntent,
    wheelIntent,
} from "./desk-lab-model.ts";

const idle = { total: 0, at: 0 };
const flat = { calm: false, overviewAtTop: true };

Deno.test("wheel claims only the direction that changes the stage", () => {
    // Zooming in at 静 and out at 览 stay the browser's page zoom.
    assertEquals(
        wheelIntent("calm", { delta: -30, ctrlKey: true, at: 1 }, idle, flat)
            .claim,
        false,
    );
    assertEquals(
        wheelIntent("overview", { delta: 30, ctrlKey: true, at: 1 }, idle, flat)
            .claim,
        false,
    );
    assertEquals(
        wheelIntent("calm", { delta: 30, ctrlKey: true, at: 1 }, idle, flat)
            .intent,
        "out",
    );
    assertEquals(
        wheelIntent(
            "overview",
            { delta: -30, ctrlKey: true, at: 1 },
            idle,
            flat,
        )
            .intent,
        "in",
    );
});

Deno.test("plain wheel never steals a scroll", () => {
    const calmScrolls = { calm: true, overviewAtTop: true };
    assertEquals(
        wheelIntent(
            "calm",
            { delta: 200, ctrlKey: false, at: 1 },
            idle,
            calmScrolls,
        ),
        { intent: null, claim: false, burst: idle },
    );
    const overviewScrolled = { calm: false, overviewAtTop: false };
    assertEquals(
        wheelIntent(
            "overview",
            { delta: -200, ctrlKey: false, at: 1 },
            idle,
            overviewScrolled,
        ).claim,
        false,
    );
});

Deno.test("wheel bursts accumulate until a pause or reversal", () => {
    const first = wheelIntent(
        "calm",
        { delta: 50, ctrlKey: false, at: 100 },
        idle,
        flat,
    );
    assertEquals(first.intent, null);
    assertEquals(first.claim, true);
    assertEquals(
        wheelIntent(
            "calm",
            { delta: 50, ctrlKey: false, at: 200 },
            first.burst,
            flat,
        )
            .intent,
        "out",
    );
    // A pause longer than the burst gap starts over.
    assertEquals(
        wheelIntent(
            "calm",
            { delta: 50, ctrlKey: false, at: 400 },
            first.burst,
            flat,
        )
            .intent,
        null,
    );
});

Deno.test("pinch maps closing to 览 and opening to 静 only at page scale", () => {
    assertEquals(pinchIntent("calm", 200, 150, 1), "out");
    assertEquals(pinchIntent("calm", 200, 260, 1), null);
    assertEquals(pinchIntent("overview", 200, 260, 1), "in");
    // A zoomed page keeps the browser's own pinch.
    assertEquals(pinchIntent("calm", 200, 100, 1.5), null);
});

Deno.test("arrow keys move to the spatial neighbour on the desk grid", () => {
    const cells = layoutDesk(mockDeskObjects(7), 4);
    // notes 2×2 at (0,0); conversations 2×1 at (2,0); apps 2×1 at (2,1).
    assertEquals(deskNeighbour(cells, "notes", "ArrowRight"), "conversations");
    assertEquals(deskNeighbour(cells, "conversations", "ArrowDown"), "apps");
    assertEquals(deskNeighbour(cells, "apps", "ArrowLeft"), "notes");
    assertEquals(deskNeighbour(cells, "notes", "ArrowLeft"), null);
});
