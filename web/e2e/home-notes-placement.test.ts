import { assert, assertEquals } from "@std/assert";
import {
    assertNoIntersections,
    countLayoutPatches,
    createHomeNote,
    expectLayout,
    measureHomeNotes,
    openHomeNotesFixture,
    readLayout,
    reloadHome,
    seedHomeApps,
    waitForNoteCards,
} from "./helpers/home-notes.ts";

const BODY =
    "保留一个安静的入口，让重要的事情留在眼前。先走到窗边看看天气，再把今天的想法慢慢写下来。";

Deno.test("home notes snap to the plate edges and keep the search top at every breakpoint", async (t) => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        await seedHomeApps(page);
        for (let index = 0; index < 4; index++) {
            await createHomeNote(page, {
                title: `笔记 ${index}`,
                body: BODY,
                homeSortOrder: index,
            });
        }
        await reloadHome(page);
        await waitForNoteCards(page, 4);
        await page.waitForTimeout(300);

        await t.step(
            "1440×900: two cells per side, aligned to the plate",
            async () => {
                const metrics = await measureHomeNotes(page);
                assert(metrics.plate);
                assertEquals(metrics.cards.length, 4);
                assertNoIntersections(metrics);
                const gap = 12;
                const cell = 180;
                const byTitle = new Map(
                    metrics.cards.map((card) => [card.title, card]),
                );
                const first = byTitle.get("笔记 0");
                const second = byTitle.get("笔记 1");
                assert(first && second, "both default notes placed");
                assertEquals(
                    Math.round(first.x),
                    Math.round(metrics.plate.x - gap - cell),
                );
                assertEquals(Math.round(first.y), Math.round(metrics.search.y));
                assertEquals(
                    Math.round(second.x),
                    Math.round(metrics.plate.x + metrics.plate.width + gap),
                );
                assertEquals(
                    Math.round(second.y),
                    Math.round(metrics.search.y),
                );
                assertEquals(Math.round(first.width), cell);
                assertEquals(Math.round(first.height), cell);
            },
        );

        await t.step(
            "1366×768: the same lattice without intersections",
            async () => {
                await page.setViewportSize({ width: 1366, height: 768 });
                await reloadHome(page);
                await waitForNoteCards(page, 4);
                await page.waitForTimeout(300);
                const metrics = await measureHomeNotes(page);
                assertNoIntersections(metrics);
                assertEquals(metrics.cards.length, 4);
                assertEquals(metrics.cards[0].y, metrics.search.y);
            },
        );

        await t.step(
            "1024×768: no side column fits, so notes use two-column flow",
            async () => {
                await page.setViewportSize({ width: 1024, height: 768 });
                await reloadHome(page);
                await waitForNoteCards(page, 4);
                await page.waitForTimeout(300);
                const metrics = await measureHomeNotes(page);
                assertEquals(metrics.flow, "flow");
                assertEquals(metrics.cards.length, 4);
                assertEquals(metrics.more.mode, null);
                assertEquals(
                    Math.round(metrics.cards[0].width),
                    Math.round((metrics.search.width - 12) / 2),
                );
                assertNoIntersections(metrics);
            },
        );

        await t.step(
            "768–1023: two-column flow shares the search axis",
            async () => {
                await page.setViewportSize({ width: 768, height: 1024 });
                await reloadHome(page);
                await waitForNoteCards(page, 4);
                await page.waitForTimeout(300);
                const metrics = await measureHomeNotes(page);
                assertEquals(metrics.flow, "flow");
                assertEquals(metrics.cards.length, 4);
                assertEquals(
                    Math.round(metrics.cards[0].width),
                    Math.round((metrics.search.width - 12) / 2),
                );
                assertEquals(
                    Math.round(metrics.cards[0].x),
                    Math.round(metrics.search.x),
                );
                assertEquals(
                    Math.round(metrics.cards[1].x),
                    Math.round(metrics.search.x + metrics.search.width / 2 + 6),
                );
                assertEquals(
                    Math.round(metrics.cards[0].height),
                    Math.round(metrics.cards[1].height),
                );
                assertEquals(Math.round(metrics.cards[0].height), 180);
            },
        );

        await t.step(
            "<768: one vertical stack at the search width",
            async () => {
                await page.setViewportSize({ width: 390, height: 844 });
                await reloadHome(page);
                await waitForNoteCards(page, 4);
                await page.waitForTimeout(300);
                const metrics = await measureHomeNotes(page);
                assertEquals(metrics.flow, "stack");
                assertEquals(metrics.cards.length, 4);
                for (const card of metrics.cards) {
                    assertEquals(
                        Math.round(card.x),
                        Math.round(metrics.search.x),
                    );
                    assertEquals(
                        Math.round(card.width),
                        Math.round(metrics.search.width),
                    );
                    assertEquals(Math.round(card.height), 134);
                }
                for (let index = 1; index < metrics.cards.length; index++) {
                    assertEquals(
                        metrics.cards[index].y >
                            metrics.cards[index - 1].y +
                                metrics.cards[index - 1].height,
                        true,
                    );
                }
                const overflow = await page.evaluate(() =>
                    document.documentElement.scrollWidth >
                        document.documentElement.clientWidth
                );
                assertEquals(overflow, false);
            },
        );
    } finally {
        await fixture.close();
    }
});

Deno.test("tablet flow spans both columns for a W note", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 768, height: 1024 },
    });
    const { page } = fixture;
    try {
        await seedHomeApps(page);
        await createHomeNote(page, {
            title: "宽笔记",
            body: BODY,
            size: "w",
        });
        await createHomeNote(page, {
            title: "小笔记",
            body: BODY,
            homeSortOrder: 1,
        });
        await reloadHome(page);
        await waitForNoteCards(page, 2);
        await page.waitForTimeout(300);
        const metrics = await measureHomeNotes(page);
        assertEquals(metrics.flow, "flow");
        const wide = metrics.cards.find((card) => card.title === "宽笔记");
        const small = metrics.cards.find((card) => card.title === "小笔记");
        assert(wide && small);
        assertEquals(Math.round(wide.width), Math.round(metrics.search.width));
        assertEquals(Math.round(wide.height), 180);
        assertEquals(
            Math.round(small.width),
            Math.round((metrics.search.width - 12) / 2),
        );
    } finally {
        await fixture.close();
    }
});

Deno.test("saved cells above the search box keep a negative side row", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        await seedHomeApps(page);
        const left = await createHomeNote(page, {
            title: "上方左",
            body: BODY,
            band: "left",
            col: 0,
            row: -1,
        });
        const right = await createHomeNote(page, {
            title: "上方右",
            body: BODY,
            homeSortOrder: 1,
            band: "right",
            col: 0,
            row: -1,
        });
        await reloadHome(page);
        await waitForNoteCards(page, 2);
        await page.waitForTimeout(300);
        const metrics = await measureHomeNotes(page);
        assertNoIntersections(metrics);
        const byTitle = new Map(
            metrics.cards.map((card) => [card.title, card]),
        );
        const leftCard = byTitle.get("上方左");
        const rightCard = byTitle.get("上方右");
        assert(leftCard && rightCard);
        assertEquals(
            Math.round(leftCard.y),
            Math.round(metrics.search.y) - 192,
        );
        assertEquals(
            Math.round(rightCard.y),
            Math.round(metrics.search.y) - 192,
        );
        assert(
            leftCard.x < metrics.search.x,
            "left row stays in the left band",
        );
        assert(
            rightCard.x > metrics.search.x + metrics.search.width,
            "right row stays in the right band",
        );
        await expectLayout(page, left.id, {
            band: "left",
            col: 0,
            row: -1,
            size: "s",
        });
        await expectLayout(page, right.id, {
            band: "right",
            col: 0,
            row: -1,
            size: "s",
        });
    } finally {
        await fixture.close();
    }
});

Deno.test("a W without a saved cell uses the centre shelf before falling back to S", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        const note = await createHomeNote(page, {
            title: "宽笔记",
            body: BODY,
            size: "w",
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);
        await page.waitForTimeout(300);
        const patches = countLayoutPatches(page);
        const metrics = await measureHomeNotes(page);
        const card = metrics.cards[0];
        assertEquals(card.title, "宽笔记");
        assertEquals(Math.round(card.width), 372, "the W tier is kept");
        const blockBottom = metrics.plate
            ? metrics.plate.y + metrics.plate.height
            : metrics.search.y + metrics.search.height;
        assert(card.y > blockBottom, "the shelf starts below the block");
        assertNoIntersections(metrics);
        const layout = await readLayout(page, note.id);
        assert(layout);
        assertEquals(layout.band, null, "placement never writes a cell");
        assertEquals(layout.col, null);
        assertEquals(layout.row, null);
        assertEquals(layout.size, "w");
        assertEquals(patches.count(), 0);
    } finally {
        await fixture.close();
    }
});
