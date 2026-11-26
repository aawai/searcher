import { assertEquals } from "@std/assert";
import type { HomeNoteItem } from "../home-layouts/home-notes.ts";
import { homeViewport } from "../home-layouts/home-viewport.ts";
import { setTaskChecked } from "../home-layouts/note-tasks.ts";
import {
    buildMastheadStamp,
    formatRelativeNoteTime,
    MASTHEAD_COMPACT_MIN_WIDTH,
    MASTHEAD_DEFAULT_SEARCH_HEIGHT,
    MASTHEAD_EDGE_INSET_MAX,
    MASTHEAD_MAX_WIDTH,
    MASTHEAD_MIN_WIDTH,
    MASTHEAD_PEEK_FADE_MAX,
    MASTHEAD_STAMP_MAX_WIDTH,
    MASTHEAD_VW_RATIO,
    mastheadColumnWidth,
    mastheadDateParts,
    mastheadPeekMetrics,
    mastheadPlacement,
    mastheadSideAnchor,
    mastheadSideCollapsedKey,
    type MastheadStorage,
    readMastheadSideCollapsed,
    resolveMastheadSwipe,
    writeMastheadSideCollapsed,
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

Deno.test("mastheadPlacement: applies restrained frontispiece inset while keeping stamp flush with availableRect", () => {
    const { availableRect } = homeViewport(1440, 900, 56, 32);
    const searchRect = { x: 400, y: 314, width: 640, height: 56 };

    const atHalf = mastheadPlacement({
        viewportWidth: 1440,
        availableRect,
        searchRect,
        focalX: 0.5,
    });
    // 40px of spare width -> inset = round(40 * 0.4) = 16px -> x = 48, edgeGap = 48,
    // while collapsed stamp stays strictly aligned to availableRect.x (32px, flush with s.).
    assertEquals(atHalf, {
        mode: "side",
        side: "left",
        column: { x: 48, y: 88, width: 296, height: 780 },
        edgeGap: 48,
        stampAnchor: { left: 32, top: 88 },
    });
    if (atHalf.mode === "side") {
        assertEquals(
            mastheadSideAnchor(1440, atHalf.column, atHalf.side),
            { left: 48, top: 88 },
        );
    }

    const focalRight = mastheadPlacement({
        viewportWidth: 1440,
        availableRect,
        searchRect,
        focalX: 0.72,
    });
    assertEquals(focalRight.mode, "side");
    if (focalRight.mode === "side") {
        assertEquals(focalRight.side, "left");
        assertEquals(focalRight.column.x, 48);
        assertEquals(focalRight.edgeGap, 48);
        assertEquals(focalRight.stampAnchor, { left: 32, top: 88 });
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
        column: { x: 1440 - 32 - 296 - 16, y: 88, width: 296, height: 780 },
        edgeGap: 48,
        stampAnchor: { right: 32, top: 88 },
    });
    if (focalLeft.mode === "side") {
        assertEquals(
            mastheadSideAnchor(1440, focalLeft.column, focalLeft.side),
            { right: 48, top: 88 },
        );
    }

    // Ultra-wide viewport caps frontispiece inset at MASTHEAD_EDGE_INSET_MAX (36px).
    const { availableRect: wideRect } = homeViewport(1920, 1080, 56, 32);
    const ultraWide = mastheadPlacement({
        viewportWidth: 1920,
        availableRect: wideRect,
        searchRect: { x: 576, y: 360, width: 768, height: 56 },
        focalX: 0.5,
    });
    assertEquals(ultraWide.mode, "side");
    if (ultraWide.mode === "side") {
        assertEquals(ultraWide.column.x, 32 + MASTHEAD_EDGE_INSET_MAX);
        assertEquals(ultraWide.edgeGap, 32 + MASTHEAD_EDGE_INSET_MAX);
        assertEquals(ultraWide.stampAnchor, { left: 32, top: 88 });
    }
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
        assertEquals(fallbackRight.column.x, 1440 - 32 - 296 - 16);
        assertEquals(fallbackRight.edgeGap, 48);
        assertEquals(fallbackRight.stampAnchor, { right: 32, top: 88 });
        assertEquals(
            mastheadSideAnchor(1440, fallbackRight.column, fallbackRight.side),
            { right: 48, top: 88 },
        );
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
        assertEquals(fallbackLeft.column.x, 48);
        assertEquals(fallbackLeft.stampAnchor, { left: 32, top: 88 });
    }

    // Wide viewport with right dock (68px) where right side still fits: stamp clears Dock + margin,
    // while column insets gently from the dock clearance and reports total outer edgeGap.
    const { availableRect: wideRightDockRect } = homeViewport(
        1920,
        1080,
        56,
        32,
        { right: 68 },
    );
    const wideRight = mastheadPlacement({
        viewportWidth: 1920,
        availableRect: wideRightDockRect,
        searchRect: { x: 576, y: 360, width: 768, height: 56 },
        focalX: 0.2,
    });
    assertEquals(wideRight.mode, "side");
    if (wideRight.mode === "side") {
        assertEquals(wideRight.side, "right");
        assertEquals(wideRight.stampAnchor, { right: 100, top: 88 });
        // columnWidth = 364.8, rightX = 1920 - 100 - 364.8 = 1455.2,
        // search right + gap = 1376 -> slack = 79.2 -> inset = round(79.2 * 0.4) = 32.
        assertEquals(wideRight.edgeGap, 132);
        assertEquals(
            mastheadSideAnchor(1920, wideRight.column, wideRight.side),
            { right: 132, top: 88 },
        );
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

    // >=768px with right Dock where neither side fits enters narrow mode.
    const { availableRect: tabletDockRect } = homeViewport(
        1024,
        768,
        56,
        32,
        { right: 68 },
    );
    const tabletNarrow = mastheadPlacement({
        viewportWidth: 1024,
        availableRect: tabletDockRect,
        searchRect: { x: 192, y: 264, width: 640, height: 56 },
        focalX: 0.5,
    });
    assertEquals(tabletNarrow.mode, "narrow");
});

Deno.test("mastheadPeekMetrics: keeps collapsed peek glyph unclipped and hides on ultra-short viewports", () => {
    assertEquals(mastheadPeekMetrics(200, null), {
        height: 200,
        fadeTail: 16,
        hidden: false,
    });
    // Plenty of room: full 24px halo room and 16px fade tail below block.
    assertEquals(mastheadPeekMetrics(200, 72), {
        height: 96,
        fadeTail: 16,
        hidden: false,
    });
    // Tight room: fade tail shrinks to slack below block + 2px buffer so the
    // day glyph baseline stays 100% opaque.
    assertEquals(mastheadPeekMetrics(84, 72), {
        height: 84,
        fadeTail: 10,
        hidden: false,
    });
    // Exact / near-exact fit: fade tail drops to 0.
    assertEquals(mastheadPeekMetrics(74, 72), {
        height: 74,
        fadeTail: 0,
        hidden: false,
    });
    // Ultra-short landscape (e.g. 844x390): block cannot fit above search -> hide.
    assertEquals(mastheadPeekMetrics(40, 72), {
        height: 40,
        fadeTail: 0,
        hidden: true,
    });
});

Deno.test("wide-mode side collapse storage: isolates per user identity and tolerates storage errors", () => {
    const map = new Map<string, string>();
    const memoryStorage: MastheadStorage = {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => {
            map.set(key, value);
        },
    };

    assertEquals(
        mastheadSideCollapsedKey(null),
        "home:masthead:sideCollapsed:guest",
    );
    assertEquals(
        mastheadSideCollapsedKey(""),
        "home:masthead:sideCollapsed:guest",
    );
    assertEquals(
        mastheadSideCollapsedKey("user/1"),
        "home:masthead:sideCollapsed:user%2F1",
    );

    // Defaults to false for every identity.
    assertEquals(readMastheadSideCollapsed(memoryStorage, null), false);
    assertEquals(readMastheadSideCollapsed(memoryStorage, "u-1"), false);

    // Guest and signed-in accounts do not leak into one another.
    writeMastheadSideCollapsed(memoryStorage, null, true);
    assertEquals(readMastheadSideCollapsed(memoryStorage, null), true);
    assertEquals(readMastheadSideCollapsed(memoryStorage, "u-1"), false);

    writeMastheadSideCollapsed(memoryStorage, "u-1", true);
    writeMastheadSideCollapsed(memoryStorage, "u-2", false);
    assertEquals(readMastheadSideCollapsed(memoryStorage, "u-1"), true);
    assertEquals(readMastheadSideCollapsed(memoryStorage, "u-2"), false);

    // Non-"true" values read safely as false.
    map.set(mastheadSideCollapsedKey("u-2"), "1");
    assertEquals(readMastheadSideCollapsed(memoryStorage, "u-2"), false);

    // Restricted / throwing storage never throws.
    const brokenStorage: MastheadStorage = {
        getItem: () => {
            throw new Error("SecurityError");
        },
        setItem: () => {
            throw new Error("QuotaExceededError");
        },
    };
    assertEquals(readMastheadSideCollapsed(brokenStorage, "u-1"), false);
    assertEquals(readMastheadSideCollapsed(null, "u-1"), false);
    writeMastheadSideCollapsed(brokenStorage, "u-1", true);
});

Deno.test("buildMastheadStamp: formats date/time/tasks combinations and never yields an empty stamp", () => {
    const dateParts = mastheadDateParts(new Date(2026, 10, 25, 11, 14));

    assertEquals(
        buildMastheadStamp({
            dateParts,
            showDate: true,
            showTime: true,
            signedIn: true,
            openTaskCount: 2,
            notesCount: 3,
        }),
        {
            primary: "25",
            primaryKind: "day",
            dateMeta: "十一月 星期三",
            time: "11:14",
            tasksLabel: "2 待办",
            notesLabel: null,
            ariaLabel: "展开首页刊头，25 十一月 星期三，11:14，2 待办",
        },
    );

    // Guest mode suppresses signed-in task counts even if a stale count is passed.
    assertEquals(
        buildMastheadStamp({
            dateParts,
            showDate: true,
            showTime: false,
            signedIn: false,
            openTaskCount: 4,
            notesCount: 2,
        }),
        {
            primary: "25",
            primaryKind: "day",
            dateMeta: "十一月 星期三",
            time: null,
            tasksLabel: null,
            notesLabel: null,
            ariaLabel: "展开首页刊头，25 十一月 星期三",
        },
    );

    // Time-only mode.
    assertEquals(
        buildMastheadStamp({
            dateParts,
            showDate: false,
            showTime: true,
            signedIn: true,
            openTaskCount: 1,
            notesCount: 2,
        }),
        {
            primary: "11:14",
            primaryKind: "time",
            dateMeta: null,
            time: null,
            tasksLabel: "1 待办",
            notesLabel: null,
            ariaLabel: "展开首页刊头，11:14，1 待办",
        },
    );

    // Date and time both off: falls back to "今日" + tasks / notes counts.
    assertEquals(
        buildMastheadStamp({
            dateParts,
            showDate: false,
            showTime: false,
            signedIn: true,
            openTaskCount: 2,
            notesCount: 3,
        }),
        {
            primary: "今日",
            primaryKind: "fallback",
            dateMeta: null,
            time: null,
            tasksLabel: "2 待办",
            notesLabel: "3 篇笔记",
            ariaLabel: "展开首页刊头，今日，2 待办，3 篇笔记",
        },
    );

    // Date and time both off with zero tasks and zero notes still shows "今日".
    assertEquals(
        buildMastheadStamp({
            dateParts,
            showDate: false,
            showTime: false,
            signedIn: true,
            openTaskCount: 0,
            notesCount: 0,
        }),
        {
            primary: "今日",
            primaryKind: "fallback",
            dateMeta: null,
            time: null,
            tasksLabel: null,
            notesLabel: null,
            ariaLabel: "展开首页刊头，今日",
        },
    );
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

Deno.test("aggregateMastheadTasks: lists all open and completed tasks in note and document order and aligns ordinals with setTaskChecked", () => {
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
            key: i.key,
            noteId: i.noteId,
            noteTitle: i.noteTitle,
            index: i.index,
            text: i.text,
            checked: i.checked,
        })),
        [
            {
                key: mastheadTaskKey("n-a", 0),
                noteId: "n-a",
                noteTitle: "本周",
                index: 0,
                text: "已完成旧任务",
                checked: true,
            },
            {
                key: mastheadTaskKey("n-a", 1),
                noteId: "n-a",
                noteTitle: "本周",
                index: 1,
                text: "待办一",
                checked: false,
            },
            {
                key: mastheadTaskKey("n-a", 2),
                noteId: "n-a",
                noteTitle: "本周",
                index: 2,
                text: "待办二",
                checked: false,
            },
            {
                key: mastheadTaskKey("n-b", 0),
                noteId: "n-b",
                noteTitle: "发布",
                index: 0,
                text: "检查构建",
                checked: false,
            },
            {
                key: mastheadTaskKey("n-b", 1),
                noteId: "n-b",
                noteTitle: "发布",
                index: 1,
                text: "更新迁移",
                checked: true,
            },
        ],
    );

    // Check "待办二" (index 2 in noteA) and uncheck "已完成旧任务" (index 0 in noteA): order is preserved
    const checkedBodyA = setTaskChecked(noteA.body, 2, true)!;
    const afterCheck = aggregateMastheadTasks([
        { ...noteA, body: checkedBodyA },
        noteB,
    ]);
    assertEquals(afterCheck.done, 3);
    assertEquals(afterCheck.total, 5);
    assertEquals(afterCheck.open, 2);
    assertEquals(
        afterCheck.items.map((i) => ({
            key: i.key,
            text: i.text,
            checked: i.checked,
        })),
        [
            { key: "n-a:0", text: "已完成旧任务", checked: true },
            { key: "n-a:1", text: "待办一", checked: false },
            { key: "n-a:2", text: "待办二", checked: true },
            { key: "n-b:0", text: "检查构建", checked: false },
            { key: "n-b:1", text: "更新迁移", checked: true },
        ],
    );

    const uncheckedBodyA = setTaskChecked(checkedBodyA, 0, false)!;
    const afterUncheck = aggregateMastheadTasks([
        { ...noteA, body: uncheckedBodyA },
        noteB,
    ]);
    assertEquals(afterUncheck.done, 2);
    assertEquals(afterUncheck.total, 5);
    assertEquals(afterUncheck.open, 3);
    assertEquals(
        afterUncheck.items.map((i) => ({
            key: i.key,
            text: i.text,
            checked: i.checked,
        })),
        [
            { key: "n-a:0", text: "已完成旧任务", checked: false },
            { key: "n-a:1", text: "待办一", checked: false },
            { key: "n-a:2", text: "待办二", checked: true },
            { key: "n-b:0", text: "检查构建", checked: false },
            { key: "n-b:1", text: "更新迁移", checked: true },
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

Deno.test("masthead layout constants and frameless ambient cushion tokens mirror design tokens", async () => {
    const css = await Deno.readTextFile(
        new URL("../../design-system/tokens.css", import.meta.url),
    );
    const vw = Math.round(MASTHEAD_VW_RATIO * 100);
    assertEquals(
        css.includes(
            `--layout-masthead-col: clamp(${MASTHEAD_MIN_WIDTH}px, ${vw}vw, ${MASTHEAD_MAX_WIDTH}px);`,
        ),
        true,
    );
    assertEquals(
        css.includes(
            `--layout-masthead-compact-min: ${MASTHEAD_COMPACT_MIN_WIDTH}px;`,
        ),
        true,
    );
    assertEquals(
        css.includes(
            `--layout-masthead-stamp-max: ${MASTHEAD_STAMP_MAX_WIDTH}px;`,
        ),
        true,
    );
    assertEquals(
        css.includes(`--search-height: ${MASTHEAD_DEFAULT_SEARCH_HEIGHT}px;`),
        true,
    );
    assertEquals(
        css.includes("--layout-home-search-max: 580px;"),
        true,
    );
    assertEquals(
        css.includes(
            "--layout-home-search-max: clamp(580px, 32vw, 620px);",
        ),
        true,
    );
    assertEquals(MASTHEAD_PEEK_FADE_MAX, 16);

    // Legacy veil and removed folio-card tokens are completely absent.
    for (
        const removed of [
            "--layout-masthead-veil-fade",
            "--masthead-veil-light",
            "--masthead-veil-dark",
            "--masthead-veil-filter",
            "--masthead-peek-veil-opacity",
            "--masthead-folio-fill",
            "--masthead-folio-filter",
            "--font-masthead-folio-day-size",
            "--shape-masthead-radius",
            "--masthead-stamp-dark-fill",
            "--masthead-stamp-dark-bg",
        ]
    ) {
        assertEquals(css.includes(removed), false, `stale token: ${removed}`);
    }

    // Frameless editorial typography & three-tier adaptive cushion tokens exist.
    for (
        const expected of [
            "--font-masthead-day-size: 7.25rem;",
            "--font-masthead-day-line-height: 5.9rem;",
            "--font-masthead-day-size: 8rem;",
            "--font-masthead-day-line-height: 6.5rem;",
            "--font-masthead-entry-size: 1.25rem;",
            "--font-masthead-entry-line-height: 1.65rem;",
            "--masthead-display-ink: #18181B;",
            "--masthead-textured-muted: #4D4D54;",
            "--masthead-textured-muted: #BEBEC6;",
            "--masthead-muted: #2F2F34;",
            "--masthead-muted: #D4D4D8;",
            "--masthead-cushion-textured-light: 36%;",
            "--masthead-cushion-textured-dark: 28%;",
            "--masthead-cushion-textured-light: 48%;",
            "--masthead-cushion-textured-dark: 40%;",
            "--masthead-cushion-textured-light: 20%;",
            "--masthead-cushion-textured-dark: 14%;",
            "--masthead-cushion-contrast-light: 54%;",
            "--masthead-cushion-contrast-dark: 40%;",
            "--masthead-cushion-contrast-light: 66%;",
            "--masthead-cushion-contrast-dark: 52%;",
            "--masthead-cushion-contrast-light: 42%;",
            "--masthead-cushion-contrast-dark: 24%;",
            "--masthead-cushion-textured-compact-scale: 0.70;",
            "--masthead-cushion-textured-compact-scale: 0.56;",
            "--masthead-cushion-contrast-compact-scale: 0.84;",
            "--masthead-cushion-contrast-compact-scale: 0.60;",
            "--masthead-textured-text-shadow:",
            "--masthead-contrast-text-shadow:",
            "--masthead-icon-shadow:",
            "--masthead-entry-hover: rgb(255 255 255 / 0.30);",
            "--masthead-collapse-hover: rgb(255 255 255 / 0.38);",
            "--glass-obsidian-fill: 76%;",
            "--glass-pearl-fill: 72%;",
            '[data-ink-polarity="light"]',
            '[data-ink-polarity="dark"]',
        ]
    ) {
        assertEquals(
            css.includes(expected),
            true,
            `missing token: ${expected}`,
        );
    }
});

Deno.test("mastheadPlacement: defaultSearchRect mirrors tightened home search width and 52px height", () => {
    const { availableRect: wide1440 } = homeViewport(1440, 900, 56, 32);
    const placed1440 = mastheadPlacement({
        viewportWidth: 1440,
        availableRect: wide1440,
        searchRect: null,
        focalX: 0.5,
    });
    assertEquals(placed1440.mode, "side");
    if (placed1440.mode === "side") {
        // defaultSearchRect(1440): width = 580 -> x = 430; slack = 430 - 32 - (32 + 296) = 70 -> inset = 28 -> column.x = 60.
        assertEquals(placed1440.column.x, 60);
    }

    const { availableRect: wide1920 } = homeViewport(1920, 1080, 56, 32);
    const placed1920 = mastheadPlacement({
        viewportWidth: 1920,
        availableRect: wide1920,
        searchRect: null,
        focalX: 0.5,
    });
    assertEquals(placed1920.mode, "side");
    if (placed1920.mode === "side") {
        // defaultSearchRect(1920): width = clamp(580, 1920 * 0.32, 620) = 614.4 -> x = 652.8;
        // slack = 652.8 - 32 - (32 + 364.8) = 224 -> inset capped at MASTHEAD_EDGE_INSET_MAX (36).
        assertEquals(placed1920.column.x, 32 + MASTHEAD_EDGE_INSET_MAX);
    }

    const { availableRect: mobileRect } = homeViewport(390, 844, 56, 16);
    const mobile = mastheadPlacement({
        viewportWidth: 390,
        availableRect: mobileRect,
        searchRect: null,
        focalX: 0.5,
    });
    assertEquals(mobile.mode, "narrow");
    if (mobile.mode === "narrow") {
        assertEquals(mobile.searchDock.height, 52);
    }
});
