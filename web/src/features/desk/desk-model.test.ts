import { assertEquals } from "@std/assert";
import { launcherTiles } from "../../components/searcher/launcherTiles.ts";
import {
    buildDeskObjects,
    deskNeighbour,
    IDLE_WHEEL_BURST,
    layoutDesk,
    pinchIntent,
    wheelIntent,
} from "./desk-model.ts";

const flat = { scrollable: false, atTop: true };
const app = (id: string, sortOrder: number, groupId?: string) => ({
    id,
    name: id,
    url: `https://${id}.example`,
    sortOrder,
    groupId,
});

Deno.test("desk objects follow the canonical order and hide what is absent", () => {
    const tiles = launcherTiles(
        [app("mail", 2), app("lin", 0, "work"), app("cal", 4)],
        [
            { id: "work", name: "工作", sortOrder: 1, folderSize: "large" },
            { id: "read", name: "阅读", sortOrder: 3 },
        ],
    );
    const objects = buildDeskObjects({
        recentNotes: [{ displayTitle: "读书笔记" }, { displayTitle: "周会" }],
        conversations: [{ title: "旅行计划" }],
        tiles,
        papers: [{ id: "p1", displayTitle: "灵感", color: "amber" }],
    });
    assertEquals(objects.map((object) => object.id), [
        "notes",
        "conversations",
        "apps",
        "folder:work",
        "folder:read",
        "paper:p1",
    ]);
    // Loose apps keep the mixed root order; folder members stay in folders.
    assertEquals(objects[2].apps?.map((item) => item.id), ["mail", "cal"]);
    assertEquals(objects[3].large, true);
    assertEquals(objects[0].detail, "最近：读书笔记");

    const bare = buildDeskObjects({
        recentNotes: [],
        conversations: null,
        tiles: [],
        papers: [],
    });
    assertEquals(bare.map((object) => object.id), ["notes"]);
    assertEquals(bare[0].detail, "还没有笔记");
});

Deno.test("wheel claims only the direction that changes the stage", () => {
    // Zooming in at 静 and out at 览 stay the browser's page zoom.
    assertEquals(
        wheelIntent(
            false,
            { delta: -30, ctrlKey: true, at: 1 },
            IDLE_WHEEL_BURST,
            flat,
        )
            .claim,
        false,
    );
    assertEquals(
        wheelIntent(
            true,
            { delta: 30, ctrlKey: true, at: 1 },
            IDLE_WHEEL_BURST,
            flat,
        )
            .claim,
        false,
    );
    assertEquals(
        wheelIntent(
            false,
            { delta: 30, ctrlKey: true, at: 1 },
            IDLE_WHEEL_BURST,
            flat,
        )
            .intent,
        "out",
    );
    assertEquals(
        wheelIntent(
            true,
            { delta: -30, ctrlKey: true, at: 1 },
            IDLE_WHEEL_BURST,
            flat,
        )
            .intent,
        "in",
    );
});

Deno.test("plain wheel never steals a scroll", () => {
    assertEquals(
        wheelIntent(
            false,
            { delta: 200, ctrlKey: false, at: 1 },
            IDLE_WHEEL_BURST,
            { scrollable: true, atTop: true },
        ),
        { intent: null, claim: false, burst: IDLE_WHEEL_BURST },
    );
    assertEquals(
        wheelIntent(
            true,
            { delta: -200, ctrlKey: false, at: 1 },
            IDLE_WHEEL_BURST,
            { scrollable: true, atTop: false },
        ).claim,
        false,
    );
    // Pinch is never a scroll.
    assertEquals(
        wheelIntent(
            false,
            { delta: 30, ctrlKey: true, at: 1 },
            IDLE_WHEEL_BURST,
            { scrollable: true, atTop: true },
        ).intent,
        "out",
    );
});

Deno.test("wheel bursts accumulate until a pause or reversal", () => {
    const first = wheelIntent(
        false,
        { delta: 50, ctrlKey: false, at: 100 },
        IDLE_WHEEL_BURST,
        flat,
    );
    assertEquals(first.intent, null);
    assertEquals(first.claim, true);
    assertEquals(
        wheelIntent(
            false,
            { delta: 50, ctrlKey: false, at: 200 },
            first.burst,
            flat,
        )
            .intent,
        "out",
    );
    assertEquals(
        wheelIntent(
            false,
            { delta: 50, ctrlKey: false, at: 400 },
            first.burst,
            flat,
        )
            .intent,
        null,
    );
});

Deno.test("pinch maps closing to 览 and opening to 静 only at page scale", () => {
    assertEquals(pinchIntent(false, 200, 150, 1), "out");
    assertEquals(pinchIntent(false, 200, 260, 1), null);
    assertEquals(pinchIntent(true, 200, 260, 1), "in");
    assertEquals(pinchIntent(false, 200, 100, 1.5), null);
});

Deno.test("arrow keys move to the spatial neighbour on the desk grid", () => {
    const cells = layoutDesk(
        [
            { id: "notes", kind: "notes" },
            { id: "conversations", kind: "conversations" },
            { id: "apps", kind: "apps" },
            { id: "folder:work", kind: "folder", large: true },
            { id: "folder:read", kind: "folder" },
            { id: "paper:a", kind: "paper" },
            { id: "paper:b", kind: "paper" },
        ] as const,
        4,
    );
    // notes 2×2 at (0,0); conversations (2,0); apps (2,1); work 2×2 at (0,2);
    // read (2,2); a (3,2); b (2,3).
    assertEquals(deskNeighbour(cells, "notes", "ArrowRight"), "conversations");
    assertEquals(deskNeighbour(cells, "conversations", "ArrowDown"), "apps");
    assertEquals(deskNeighbour(cells, "apps", "ArrowLeft"), "notes");
    assertEquals(deskNeighbour(cells, "paper:b", "ArrowUp"), "folder:read");
    assertEquals(deskNeighbour(cells, "notes", "ArrowLeft"), null);
});
