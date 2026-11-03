import { assertEquals } from "@std/assert";
import type { HomeNoteItem } from "../home-layouts/home-notes.ts";
import { homeViewport } from "../home-layouts/home-viewport.ts";
import { setTaskChecked } from "../home-layouts/note-tasks.ts";
import {
    formatRelativeNoteTime,
    mastheadColumnWidth,
    mastheadDateParts,
    mastheadPlacement,
    resolveMastheadSwipe,
} from "./masthead-layout.ts";
import {
    aggregateMastheadTasks,
    mastheadTaskKey,
    summarizeMastheadEntry,
} from "./masthead-notes.ts";

function noteFixture(overrides: Partial<HomeNoteItem> = {}): HomeNoteItem {
    return {
        id: "note-1",
        title: "示例笔记",
        displayTitle: "示例笔记",
        snippet: "",
        body: "",
        notebookId: null,
        isFavorite: false,
        isHomeFixed: true,
        homeSortOrder: 0,
        version: 1,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000,
        ...overrides,
    };
}

Deno.test("mastheadPlacement: selects side by focalX and defaults focalX = 0.5 to left", () => {
    const { availableRect } = homeViewport(1440, 900, 56, 32);
    const searchRect = { x: 400, y: 314, width: 640, height: 56 };

    const atHalf = mastheadPlacement({
        viewportWidth: 1440,
        availableRect,
        searchRect,
        focalX: 0.5,
    });
    // 40px of spare width between the margin and the search gap becomes edge inset.
    assertEquals(atHalf, {
        mode: "side",
        side: "left",
        column: { x: 72, y: 88, width: 296, height: 780 },
        veilWidth: 72 + 296 + 600,
    });

    const focalRight = mastheadPlacement({
        viewportWidth: 1440,
        availableRect,
        searchRect,
        focalX: 0.72,
    });
    assertEquals(focalRight.mode, "side");
    if (focalRight.mode === "side") {
        assertEquals(focalRight.side, "left");
        assertEquals(focalRight.column.x, 72);
    }

    const focalLeft = mastheadPlacement({
        viewportWidth: 1440,
        availableRect,
        searchRect,
        focalX: 0.28,
    });
    assertEquals(focalLeft, {
        mode: "side",
        side: "right",
        column: { x: 1440 - 32 - 296 - 40, y: 88, width: 296, height: 780 },
        veilWidth: 72 + 296 + 600,
    });
});

Deno.test("mastheadPlacement: falls back to opposite side when dock or search blocks preferred side", () => {
    // Dock on left (68px): left availableRect starts at 32 + 68 = 100.
    // 100 + 296 + 32 = 428 > searchRect.x (400), so left side cannot fit; right side fits.
    const { availableRect: leftDockRect } = homeViewport(1440, 900, 56, 32, {
        left: 68,
    });
    const searchRect = { x: 400, y: 314, width: 640, height: 56 };

    const fallbackRight = mastheadPlacement({
        viewportWidth: 1440,
        availableRect: leftDockRect,
        searchRect,
        focalX: 0.5,
    });
    assertEquals(fallbackRight.mode, "side");
    if (fallbackRight.mode === "side") {
        assertEquals(fallbackRight.side, "right");
        assertEquals(fallbackRight.column.x, 1440 - 32 - 296 - 40);
    }

    // Dock on right (68px) with focalX < 0.5 (preferring right): falls back to left.
    const { availableRect: rightDockRect } = homeViewport(1440, 900, 56, 32, {
        right: 68,
    });
    const fallbackLeft = mastheadPlacement({
        viewportWidth: 1440,
        availableRect: rightDockRect,
        searchRect,
        focalX: 0.2,
    });
    assertEquals(fallbackLeft.mode, "side");
    if (fallbackLeft.mode === "side") {
        assertEquals(fallbackLeft.side, "left");
        assertEquals(fallbackLeft.column.x, 72);
    }
});

Deno.test("mastheadPlacement: exact fit width boundary and narrow fallback when neither side fits", () => {
    // At 1360px, colWidth = 296, availableRect.x = 32, search width = 640 -> searchRect.x = 360.
    // 32 + 296 + 32 = 360 <= 360 -> exact fit!
    const { availableRect: exactRect } = homeViewport(1360, 900, 56, 32);
    const exactFit = mastheadPlacement({
        viewportWidth: 1360,
        availableRect: exactRect,
        searchRect: { x: 360, y: 314, width: 640, height: 56 },
        focalX: 0.5,
    });
    assertEquals(exactFit.mode, "side");
    if (exactFit.mode === "side") {
        assertEquals(exactFit.side, "left");
        assertEquals(exactFit.column.width, 296);
        // No spare width: the column stays on the page margin.
        assertEquals(exactFit.column.x, 32);
    }

    // 1px narrower on both sides -> neither side has 32px clearance -> narrow mode.
    const { availableRect: tightRect } = homeViewport(1358, 900, 56, 32);
    const narrow = mastheadPlacement({
        viewportWidth: 1358,
        availableRect: tightRect,
        searchRect: { x: 359, y: 314, width: 640, height: 56 },
        focalX: 0.5,
    });
    assertEquals(narrow, {
        mode: "narrow",
        // Collapsed, the masthead peeks from the free area's top down to 8px above the search box.
        peek: { x: 32, y: 88, width: 1358 - 64, height: 314 - 8 - 88 },
        sheet: { x: 32, y: 88, width: 1358 - 64, height: 780 - 56 - 24 },
        searchDock: { x: 32, y: 88 + 780 - 56, width: 1358 - 64, height: 56 },
    });

    // Mobile (<768px) is always narrow mode.
    const { availableRect: mobileRect } = homeViewport(390, 844, 56, 16);
    assertEquals(
        mastheadPlacement({
            viewportWidth: 390,
            availableRect: mobileRect,
            searchRect: { x: 16, y: 200, width: 358, height: 56 },
            focalX: 0.5,
        }),
        {
            mode: "narrow",
            peek: { x: 16, y: 72, width: 358, height: 200 - 8 - 72 },
            // The open sheet ends 24px above the search box docked on the free area's bottom.
            sheet: { x: 16, y: 72, width: 358, height: 756 - 56 - 24 },
            searchDock: { x: 16, y: 72 + 756 - 56, width: 358, height: 56 },
        },
    );

    // A search box at (or above) the free area's top leaves no room to peek.
    const cramped = mastheadPlacement({
        viewportWidth: 390,
        availableRect: mobileRect,
        searchRect: { x: 16, y: 60, width: 358, height: 56 },
        focalX: 0.5,
    });
    assertEquals(cramped.mode === "narrow" && cramped.peek.height, 0);

    // Column width scales with 19vw up to 372px.
    assertEquals(mastheadColumnWidth(1440), 296);
    assertEquals(mastheadColumnWidth(2000), 372);
});

Deno.test("mastheadDateParts: formats day number, weekday, Chinese month name and 24h time", () => {
    const nov = mastheadDateParts(new Date(2026, 10, 3, 9, 5));
    assertEquals(nov, {
        day: "3",
        weekday: "星期二",
        month: "十一月",
        time: "09:05",
    });

    const jan = mastheadDateParts(new Date(2026, 0, 18, 21, 40));
    assertEquals(jan.day, "18");
    assertEquals(jan.weekday, "星期日");
    assertEquals(jan.month, "一月");
    assertEquals(jan.time, "21:40");

    const dec = mastheadDateParts(new Date(2026, 11, 31, 0, 0));
    assertEquals(dec.month, "十二月");
});

Deno.test("summarizeMastheadEntry: distinguishes code fence, standalone inline code, tasks-only, and text with inline code", () => {
    // 1. Fenced code block as first block -> code entry with first line & full code for copy
    const fenced = summarizeMastheadEntry({
        title: "omp auth",
        displayTitle: "omp auth",
        body:
            "```bash\nssh -L 51121:127.0.0.1:51121 aawei@192.168.31.5\necho connected\n```\n\n后续说明",
    });
    assertEquals(fenced, {
        kind: "code",
        text: "ssh -L 51121:127.0.0.1:51121 aawei@192.168.31.5",
        code: "ssh -L 51121:127.0.0.1:51121 aawei@192.168.31.5\necho connected",
    });

    // 2. Whole paragraph is inline code -> code entry
    const inlineOnly = summarizeMastheadEntry({
        title: "快速启动",
        displayTitle: "快速启动",
        body: "`deno task dev`",
    });
    assertEquals(inlineOnly, {
        kind: "code",
        text: "deno task dev",
        code: "deno task dev",
    });

    // 3. Inline code mixed with prose -> text entry (not code entry) that
    //    keeps the code span, with whitespace collapsed across segments
    const inlineMixed = summarizeMastheadEntry({
        title: "部署",
        displayTitle: "部署",
        body: "`deno task build`  后以 **production** 启动，再看 `logs`",
    });
    assertEquals(inlineMixed, {
        kind: "text",
        segments: [
            { text: "deno task build", code: true },
            { text: " 后以 production 启动，再看 ", code: false },
            { text: "logs", code: true },
        ],
    });

    // 4. Tasks-only note -> tasks-only summary
    const tasksOnly = summarizeMastheadEntry({
        title: "本周",
        displayTitle: "本周",
        body: "- [x] 笔记底栏对齐\n- [ ] 首页笔记效果图\n- [ ] 玻璃档位实页\n",
    });
    assertEquals(tasksOnly, {
        kind: "tasks-only",
        text: "3 项任务 · 1 已完成",
        total: 3,
        done: 1,
    });

    // 5. Text note strips Markdown syntax, images (including alt), and HTML
    const prose = summarizeMastheadEntry({
        title: "UI Refactor",
        displayTitle: "UI Refactor",
        body:
            "**是否引入** [HeroUI v3](https://example.com) ![预览图](https://example.com/a.png) <span>与迁移风险</span>",
    });
    assertEquals(prose, {
        kind: "text",
        segments: [{ text: "是否引入 HeroUI v3 与迁移风险", code: false }],
    });
});

Deno.test("summarizeMastheadEntry: untitled note does not repeat first line and summarizes from next block", () => {
    const singleParagraph = summarizeMastheadEntry({
        title: null,
        displayTitle: "少一点干扰，多一点专注。",
        body: "少一点干扰，多一点专注。",
    });
    assertEquals(singleParagraph, {
        kind: "text",
        segments: [],
    });

    const untitledWithInlineCode = summarizeMastheadEntry({
        title: null,
        displayTitle: "启动服务",
        body: "启动服务 用 `deno task dev`",
    });
    assertEquals(untitledWithInlineCode, {
        kind: "text",
        segments: [
            { text: "用 ", code: false },
            { text: "deno task dev", code: true },
        ],
    });

    const multiBlockText = summarizeMastheadEntry({
        title: "   ",
        displayTitle: "周会纪要",
        body: "# 周会纪要\n\n讨论排期与迁移风险。",
    });
    assertEquals(multiBlockText, {
        kind: "text",
        segments: [{ text: "讨论排期与迁移风险。", code: false }],
    });

    const untitledCodeSecondBlock = summarizeMastheadEntry({
        title: null,
        displayTitle: "隧道命令",
        body: "隧道命令\n\n```sh\nssh -N -L 8080:localhost:8080 host\n```",
    });
    assertEquals(untitledCodeSecondBlock, {
        kind: "code",
        text: "ssh -N -L 8080:localhost:8080 host",
        code: "ssh -N -L 8080:localhost:8080 host",
    });
});

Deno.test("aggregateMastheadTasks: aligns ordinals with setTaskChecked and retains only session-completed tasks", () => {
    const noteA = noteFixture({
        id: "n-a",
        displayTitle: "本周",
        body:
            "- [x] 已完成旧任务\n- [ ] 待办一\n\n```\n- [ ] 代码块内假任务\n```\n\n- [ ] 待办二\n",
    });
    const noteB = noteFixture({
        id: "n-b",
        displayTitle: "发布",
        body: "1. [ ] 检查构建\n2. [x] 更新迁移\n",
    });

    const initial = aggregateMastheadTasks([noteA, noteB]);
    assertEquals(initial.done, 2);
    assertEquals(initial.total, 5);
    assertEquals(initial.open, 3);
    assertEquals(
        initial.items.map((i) => ({
            noteId: i.noteId,
            index: i.index,
            text: i.text,
            checked: i.checked,
            justCompleted: i.justCompleted,
        })),
        [
            {
                noteId: "n-a",
                index: 1,
                text: "待办一",
                checked: false,
                justCompleted: false,
            },
            {
                noteId: "n-a",
                index: 2,
                text: "待办二",
                checked: false,
                justCompleted: false,
            },
            {
                noteId: "n-b",
                index: 0,
                text: "检查构建",
                checked: false,
                justCompleted: false,
            },
        ],
    );

    // Toggle "待办二" (index 2 in noteA) using setTaskChecked and record its session key
    const updatedBodyA = setTaskChecked(noteA.body, 2, true)!;
    const sessionKeys = new Set([mastheadTaskKey("n-a", 2)]);
    const afterCheck = aggregateMastheadTasks(
        [{ ...noteA, body: updatedBodyA }, noteB],
        sessionKeys,
    );
    assertEquals(afterCheck.done, 3);
    assertEquals(afterCheck.total, 5);
    assertEquals(afterCheck.open, 2);
    assertEquals(
        afterCheck.items.map((i) => ({
            key: i.key,
            text: i.text,
            checked: i.checked,
            justCompleted: i.justCompleted,
        })),
        [
            {
                key: "n-a:1",
                text: "待办一",
                checked: false,
                justCompleted: false,
            },
            {
                key: "n-a:2",
                text: "待办二",
                checked: true,
                justCompleted: true,
            },
            {
                key: "n-b:0",
                text: "检查构建",
                checked: false,
                justCompleted: false,
            },
        ],
    );
});

Deno.test("formatRelativeNoteTime and resolveMastheadSwipe cover time labels and swipe thresholds", () => {
    const now = new Date(2026, 10, 3, 14, 0, 0);
    assertEquals(
        formatRelativeNoteTime(now.getTime() - 20_000, now),
        "刚刚",
    );
    assertEquals(
        formatRelativeNoteTime(now.getTime() - 15 * 60_000, now),
        "15 分钟前",
    );
    assertEquals(
        formatRelativeNoteTime(now.getTime() - 2 * 3_600_000, now),
        "2 小时前",
    );
    assertEquals(
        formatRelativeNoteTime(new Date(2026, 10, 2, 18, 0).getTime(), now),
        "昨天",
    );
    assertEquals(
        formatRelativeNoteTime(new Date(2026, 9, 30, 12, 0).getTime(), now),
        "10月30日",
    );

    assertEquals(
        resolveMastheadSwipe({ deltaX: 10, deltaY: 48, collapsed: true }),
        "expand",
    );
    assertEquals(
        resolveMastheadSwipe({ deltaX: 60, deltaY: 50, collapsed: true }),
        null,
    );
    assertEquals(
        resolveMastheadSwipe({
            deltaX: 8,
            deltaY: -52,
            collapsed: false,
            panelScrollTop: 0,
        }),
        "collapse",
    );
    assertEquals(
        resolveMastheadSwipe({
            deltaX: 8,
            deltaY: -52,
            collapsed: false,
            panelScrollTop: 24,
        }),
        null,
    );
});
