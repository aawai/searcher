import { assert, assertEquals } from "@std/assert";
import type { Page } from "playwright";
import {
    createHomeNote,
    homeNote,
    openHomeNotesFixture,
    reloadHome,
    waitForNoteCards,
} from "./helpers/home-notes.ts";
import { closeLibrary, libraryPanel, libraryView } from "./helpers/library.ts";

interface TransitionRecord {
    before: string[];
    after: string[] | null;
    finished?: boolean;
    animations:
        | Array<{
            pseudo: string | null;
            duration: unknown;
            properties: string[];
        }>
        | null;
}

const TRANSITION_RECORDER = `(() => {
    window.__transitions = [];
    const original = document.startViewTransition?.bind(document);
    if (!original) return;
    const named = () => [...document.querySelectorAll("*")]
        .filter((element) => element.style.viewTransitionName &&
            element.style.viewTransitionName !== "none")
        .map((element) => element.style.viewTransitionName);
    document.startViewTransition = (callback) => {
        const record = { before: named(), after: null, animations: null };
        window.__transitions.push(record);
        const transition = original(async () => {
            await callback();
            record.after = named();
        });
        transition.ready.then(() => {
            record.animations = document.documentElement
                .getAnimations({ subtree: true })
                .map((animation) => ({
                    pseudo: animation.effect?.pseudoElement ?? null,
                    duration: animation.effect?.getComputedTiming().duration,
                    properties: [...new Set(
                        animation.effect.getKeyframes()
                            .flatMap((frame) => Object.keys(frame)),
                    )].filter((key) => ![
                        "offset", "easing", "composite", "computedOffset",
                    ].includes(key)),
                }));
        }).catch(() => {
            record.animations = [];
        });
        transition.finished.finally(() => setTimeout(() => {
            record.finished = true;
        }));
        return transition;
    };
})()`;

const NO_VIEW_TRANSITIONS = `(() => {
    try {
        Object.defineProperty(document, "startViewTransition", {
            value: undefined,
            configurable: true,
        });
    } catch {
        // Ignore when host makes it non-configurable.
    }
})()`;

function transitionsOf(page: Page): Promise<TransitionRecord[]> {
    return page.evaluate(
        () => ((globalThis as { __transitions?: TransitionRecord[] })
            .__transitions ?? []),
    );
}

Deno.test("home-masthead-document: entries render excerpts, copy code, unpin, open library and never load editor-vendor on home", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        const textNote = await createHomeNote(page, {
            title: "封面笔记",
            body: "这是一段安静的说明。\n\n- 第一件事\n- 第二件事",
            homeSortOrder: 0,
        });
        const codeNote = await createHomeNote(page, {
            title: "部署命令",
            body: "```sh\ndeno task build\ndeno task start\n```",
            homeSortOrder: 1,
        });
        const tasksOnlyNote = await createHomeNote(page, {
            title: "纯任务笔记",
            body: "- [x] 已完成\n- [ ] 待完成",
            homeSortOrder: 2,
        });
        const requestedUrls: string[] = [];
        page.on("request", (request) => requestedUrls.push(request.url()));
        await reloadHome(page);
        await waitForNoteCards(page, 3);

        const cover = homeNote(page, "封面笔记");
        await cover.waitFor({ state: "visible" });
        assertEquals(await cover.getAttribute("data-kind"), "text");
        assertEquals(
            await cover.locator("[contenteditable='true']").count(),
            0,
        );
        assertEquals(
            requestedUrls.some((url) => url.includes("editor-vendor")),
            false,
            "editor-vendor chunk must not load on the home page",
        );

        const codeEntry = homeNote(page, "部署命令");
        assertEquals(await codeEntry.getAttribute("data-kind"), "code");
        assertEquals(
            await codeEntry.locator(".home-masthead__entry-summary")
                .textContent(),
            "deno task build",
        );
        const copyBtn = codeEntry.locator(".home-masthead__copy-btn");
        await copyBtn.waitFor({ state: "visible" });

        const tasksEntry = homeNote(page, "纯任务笔记");
        assertEquals(await tasksEntry.getAttribute("data-kind"), "tasks-only");
        assertEquals(
            await tasksEntry.locator(".home-masthead__entry-summary")
                .textContent(),
            "2 项任务 · 1 已完成",
        );

        // Unpin via the ⋯ menu removes the entry from home.
        await tasksEntry.hover();
        await tasksEntry.getByRole("button", { name: "更多操作", exact: true })
            .click();
        const changed = page.waitForResponse((response) =>
            response.request().method() === "PATCH" &&
            response.url().endsWith(`/api/documents/${tasksOnlyNote.id}`) &&
            response.ok()
        );
        await page.getByRole("menuitem", { name: "取消固定", exact: true })
            .click();
        await changed;
        await waitForNoteCards(page, 2);
        const pinned = await page.evaluate(async (id) => {
            const document = (await (await fetch(`/api/documents/${id}`))
                .json()).data;
            return document.isHomeFixed as boolean;
        }, tasksOnlyNote.id);
        assertEquals(pinned, false);

        // Clicking an entry opens the note window.
        await cover.click();
        await libraryPanel(page).waitFor();
        await closeLibrary(page);

        // Footer "全部笔记 →" opens the notes library.
        await page.locator(".home-masthead__all-notes").click();
        await libraryPanel(page).waitFor();
        await libraryView(page, "notes").waitFor();
        await closeLibrary(page);

        void textNote;
        void codeNote;
    } finally {
        await fixture.close();
    }
});

Deno.test("an untitled note shows its first line as title without repeating it in the summary and opens by click or Enter", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page } = fixture;
    try {
        await createHomeNote(page, {
            title: null,
            body: "窗边的第一行\n\n第二段内容只出现一次。",
        });
        await reloadHome(page);
        await waitForNoteCards(page, 1);

        const entry = page.locator(".home-masthead__entry").first();
        assertEquals(await entry.getAttribute("data-untitled"), "true");
        assertEquals(
            await entry.locator(".home-masthead__entry-title").textContent(),
            "窗边的第一行",
        );
        const summary = await entry.locator(".home-masthead__entry-summary")
            .textContent();
        assertEquals(summary, "第二段内容只出现一次。");
        const text = await entry.innerText();
        assertEquals(
            text.split("窗边的第一行").length - 1,
            1,
            "the first line is not repeated in the excerpt",
        );
        assert(text.includes("第二段内容只出现一次。"));

        await entry.click();
        await libraryPanel(page).waitFor();
        await closeLibrary(page);

        await entry.focus();
        await page.keyboard.press("Enter");
        await libraryPanel(page).waitFor();
        await closeLibrary(page);
    } finally {
        await fixture.close();
    }
});

Deno.test("home-masthead-document: pinned note opens notes window with shared-element transition across closed, minimized, reduced-motion and unsupported modes", async () => {
    const fixture = await openHomeNotesFixture({
        viewport: { width: 1440, height: 900 },
    });
    const { page, context } = fixture;
    try {
        const first = await createHomeNote(page, {
            title: "过渡一号",
            body: "第一篇共享元素正文",
            homeSortOrder: 0,
        });
        const second = await createHomeNote(page, {
            title: "过渡二号",
            body: "第二篇共享元素正文",
            homeSortOrder: 1,
        });
        await context.addInitScript(TRANSITION_RECORDER);
        await reloadHome(page);
        await waitForNoteCards(page, 2);

        const waitTransitionSettled = (count: number) =>
            page.waitForFunction((n) => {
                const list = (globalThis as {
                    __transitions?: Array<{ finished?: boolean }>;
                }).__transitions ?? [];
                return list.length >= n && Boolean(list[n - 1]?.finished);
            }, count);

        // 1. From closed state via click on entry.
        const entry1 = homeNote(page, "过渡一号");
        await entry1.click();
        const target1 = page.locator(
            `[data-window-id="notes"] [data-shared-target="note-${first.id}"]`,
        );
        await target1.waitFor({ state: "visible" });
        await waitTransitionSettled(1);

        const [firstRecord] = await transitionsOf(page);
        assertEquals(firstRecord.before.length, 1);
        assertEquals(firstRecord.after, firstRecord.before);
        await page.waitForFunction((id) => {
            const target = document.querySelector(
                `[data-window-id="notes"] [data-shared-target="note-${id}"]`,
            );
            const active = document.activeElement;
            return Boolean(
                target &&
                    active &&
                    target.contains(active) &&
                    !active.classList.contains("document-title-input"),
            );
        }, first.id);

        // Escape minimizes and returns focus to the triggering entry.
        await page.keyboard.press("Escape");
        await page.locator('[data-window-id="notes"]').waitFor({
            state: "hidden",
        });
        await page.waitForFunction(
            (id) =>
                document.activeElement?.closest(".home-masthead__entry")
                    ?.getAttribute("data-note-id") === id,
            first.id,
        );

        // 2. From minimized state into a different note.
        const entry2 = homeNote(page, "过渡二号");
        await entry2.focus();
        await page.keyboard.press("Enter");
        const target2 = page.locator(
            `[data-window-id="notes"] [data-shared-target="note-${second.id}"]`,
        );
        await target2.waitFor({ state: "visible" });
        await waitTransitionSettled(2);
        const [, secondRecord] = await transitionsOf(page);
        assertEquals(secondRecord.before.length, 1);
        assertEquals(secondRecord.after, secondRecord.before);
        assertEquals(
            await target2.getByRole("textbox", {
                name: "笔记标题",
                exact: true,
            })
                .inputValue(),
            "过渡二号",
        );

        await page.keyboard.press("Escape");
        await page.locator('[data-window-id="notes"]').waitFor({
            state: "hidden",
        });
        await page.waitForFunction(
            (id) =>
                document.activeElement?.closest(".home-masthead__entry")
                    ?.getAttribute("data-note-id") === id,
            second.id,
        );

        // 3. Open via ⋯ -> 编辑笔记 and return focus to its menu button.
        await entry1.hover();
        const menuTrigger1 = entry1.getByRole("button", {
            name: "更多操作",
            exact: true,
        });
        await menuTrigger1.click();
        await page.getByRole("menuitem", { name: "编辑笔记", exact: true })
            .click();
        await target1.waitFor({ state: "visible" });
        await waitTransitionSettled(3);
        await page.keyboard.press("Escape");
        await page.locator('[data-window-id="notes"]').waitFor({
            state: "hidden",
        });
        await page.waitForFunction((id) => {
            const active = document.activeElement;
            return active?.getAttribute("aria-label") === "更多操作" &&
                active.closest(".home-masthead__entry")?.getAttribute(
                        "data-note-id",
                    ) === id;
        }, first.id);

        // 4. Reduced motion uses opacity-only animation on pseudo elements.
        await page.emulateMedia({ reducedMotion: "reduce" });
        await entry2.click();
        await target2.waitFor({ state: "visible" });
        await waitTransitionSettled(4);
        const reducedRecord = (await transitionsOf(page))[3];
        const pseudoAnimations = (reducedRecord.animations ?? []).filter((a) =>
            a.pseudo?.startsWith("::view-transition")
        );
        for (const anim of pseudoAnimations) {
            for (const prop of anim.properties) {
                assertEquals(
                    prop,
                    "opacity",
                    `Reduced motion must not animate ${prop} on ${anim.pseudo}`,
                );
            }
        }
        await page.keyboard.press("Escape");
        await page.locator('[data-window-id="notes"]').waitFor({
            state: "hidden",
        });

        // 5. Fallback without document.startViewTransition opens instantaneously.
        const fallbackPage = await context.newPage();
        await fallbackPage.addInitScript(NO_VIEW_TRANSITIONS);
        await fallbackPage.goto(page.url());
        await waitForNoteCards(fallbackPage, 2);
        await homeNote(fallbackPage, "过渡一号").click();
        const fallbackTarget = fallbackPage.locator(
            `[data-window-id="notes"] [data-shared-target="note-${first.id}"]`,
        );
        await fallbackTarget.waitFor({ state: "visible" });
        await fallbackPage.waitForFunction((id) => {
            const target = document.querySelector(
                `[data-window-id="notes"] [data-shared-target="note-${id}"]`,
            );
            const active = document.activeElement;
            return Boolean(
                target &&
                    active &&
                    target.contains(active) &&
                    !active.classList.contains("document-title-input"),
            );
        }, first.id);
        await fallbackPage.keyboard.press("Escape");
        await fallbackPage.locator('[data-window-id="notes"]').waitFor({
            state: "hidden",
        });
        await fallbackPage.waitForFunction(
            (id) =>
                document.activeElement?.closest(".home-masthead__entry")
                    ?.getAttribute("data-note-id") === id,
            first.id,
        );
        await fallbackPage.close();
    } finally {
        await fixture.close();
    }
});
