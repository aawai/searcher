import { assert, assertEquals } from "@std/assert";
import type { Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import { createHomeNote } from "./helpers/home-notes.ts";
import { openNoteRows } from "./helpers/library.ts";

const frame = (page: Page) => page.locator('[data-window-id="notes"]');
const title = (page: Page) =>
    frame(page).getByRole("textbox", { name: "笔记标题", exact: true });

async function expectTitle(page: Page, expected: string) {
    await page.waitForFunction(
        (value) =>
            document.querySelector<HTMLInputElement>('[aria-label="笔记标题"]')
                ?.value === value,
        expected,
    );
    assertEquals(await title(page).inputValue(), expected);
}

async function openRow(page: Page, id: string) {
    await openNoteRows(page);
    await frame(page).locator(`[data-document-id="${id}"] h4 button`).click();
}

async function closeNotes(page: Page) {
    await frame(page).getByRole("button", { name: "关闭笔记", exact: true })
        .click();
    await frame(page).waitFor({ state: "hidden" });
}

Deno.test("笔记窗口跨设备恢复、优先级及最小化", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const a = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const b = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await loginAndVisit(a, app.origin, "/", user);
    await loginAndVisit(b, app.origin, "/", user);
    const previous = await createHomeNote(a, {
        title: "之前打开",
        body: "正文",
        isHomeFixed: false,
    });
    const latest = await createHomeNote(a, {
        title: "最后打开",
        body: "正文",
        isHomeFixed: false,
    });
    await a.reload();
    let opened = a.waitForResponse((r) =>
        r.url().endsWith(`/${previous.id}/opened`) &&
        r.request().method() === "PUT" && r.ok()
    );
    await openRow(a, previous.id);
    await opened;
    opened = a.waitForResponse((r) =>
        r.url().endsWith(`/${latest.id}/opened`) &&
        r.request().method() === "PUT" && r.ok()
    );
    await openRow(a, latest.id);
    await opened;
    await b.locator('[data-dock-id="notes"]').click();
    await expectTitle(b, "最后打开");

    let restoreRequests = 0;
    b.on("request", (request) => {
        if (request.url().endsWith("/api/documents/last-opened")) {
            restoreRequests++;
        }
    });
    await frame(b).getByRole("button", { name: "最小化笔记" }).click();
    await frame(b).waitFor({ state: "hidden" });
    await b.locator('[data-dock-id="notes"]').click();
    await expectTitle(b, "最后打开");
    assertEquals(restoreRequests, 0);
    await closeNotes(b);
    const deleted = await a.request.delete(
        `${app.origin}/api/documents/${latest.id}?version=${latest.version}`,
        { headers: { Origin: app.origin } },
    );
    assert(deleted.ok(), `trash: ${deleted.status()}`);
    await b.locator('[data-dock-id="notes"]').click();
    await expectTitle(b, "之前打开");
    assertEquals(restoreRequests, 1);
    await closeNotes(b);

    // Hold the restore response after taking its server snapshot. A manual
    // selection must remain authoritative even when that old response arrives.
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    await b.route("**/api/documents/last-opened", async (route) => {
        const response = await route.fetch();
        started.resolve();
        await release.promise;
        await route.fulfill({ response });
    });
    const other = await createHomeNote(a, {
        title: "手动选择",
        body: "正文",
        isHomeFixed: false,
    });
    await b.locator('[data-dock-id="notes"]').click();
    await started.promise;
    await openRow(b, other.id);
    await expectTitle(b, "手动选择");
    const restoreResponse = b.waitForResponse((r) =>
        r.url().endsWith("/api/documents/last-opened")
    );
    release.resolve();
    await restoreResponse;
    await expectTitle(b, "手动选择");
    await b.unroute("**/api/documents/last-opened");

    // React Router's location state is the same deep-link entry used by sources.
    const deep = await browser.newPage({
        viewport: { width: 1440, height: 900 },
    });
    await loginAndVisit(deep, app.origin, "/", user);
    await deep.addInitScript((id) => {
        history.replaceState({
            usr: { openDocumentId: id },
            key: "restore-link",
            idx: 0,
        }, "");
    }, previous.id);
    await deep.reload();
    await expectTitle(deep, "之前打开");
});

Deno.test("窄窗口恢复结果决定是否打开笔记抽屉", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
    });
    await loginAndVisit(page, app.origin, "/", user);
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    await page.route("**/api/documents/last-opened", async (route) => {
        const response = await route.fetch();
        started.resolve();
        await release.promise;
        await route.fulfill({ response });
    });
    await page.locator('[data-dock-id="notes"]').click();
    await started.promise;
    await frame(page).locator(".documents-layout").waitFor();
    assertEquals(
        await frame(page).locator('.documents-layout[data-drawer="open"]')
            .count(),
        0,
    );
    release.resolve();
    await frame(page).locator('.documents-layout[data-drawer="open"]')
        .waitFor();
    await page.unroute("**/api/documents/last-opened");
    const note = await createHomeNote(page, {
        title: "窄屏恢复",
        body: "正文",
        isHomeFixed: false,
    });
    await closeNotes(page);
    const marked = await page.request.put(
        `${app.origin}/api/documents/${note.id}/opened`,
        { headers: { Origin: app.origin } },
    );
    assert(marked.ok());
    await page.locator('[data-dock-id="notes"]').click();
    await expectTitle(page, "窄屏恢复");
    assertEquals(
        await frame(page).locator('.documents-layout[data-drawer="open"]')
            .count(),
        0,
    );
});

Deno.test("侧栏和大纲宽度拖拽、键盘调整后按设备保存", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const user = await app.seedAskFixtureUser();
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const page = await browser.newPage({
        viewport: { width: 1600, height: 900 },
    });
    await loginAndVisit(page, app.origin, "/", user);
    const note = await createHomeNote(page, {
        title: "宽度偏好",
        body: "# 正文",
        isHomeFixed: false,
    });
    await page.reload();
    await openRow(page, note.id);
    await expectTitle(page, "宽度偏好");
    // Expand the host so the sidebar can grow beyond its default width.
    await frame(page).getByRole("button", { name: "笔记窗口菜单" }).click();
    await page.getByRole("menuitem", { name: "调整左边" }).click();
    for (let i = 0; i < 18; i++) await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    const sidebar = frame(page).getByRole("separator", {
        name: "调整侧栏宽度",
    });
    await sidebar.waitFor();
    const before = Number(await sidebar.getAttribute("aria-valuenow"));
    const box = await sidebar.boundingBox();
    assert(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 32, box.y + box.height / 2);
    await page.mouse.up();
    await page.waitForFunction(
        (width) =>
            Number(
                document.querySelector('[aria-label="调整侧栏宽度"]')
                    ?.getAttribute("aria-valuenow"),
            ) > width,
        before,
    );
    const dragged = Number(await sidebar.getAttribute("aria-valuenow"));
    await sidebar.focus();
    await page.keyboard.press("ArrowRight");
    const sidebarWidth = Number(await sidebar.getAttribute("aria-valuenow"));
    assertEquals(sidebarWidth, dragged + 16);
    await frame(page).getByRole("button", { name: "大纲", exact: true })
        .click();
    const outline = frame(page).getByRole("separator", {
        name: "调整大纲宽度",
    });
    await outline.waitFor();
    const outlineBefore = Number(await outline.getAttribute("aria-valuenow"));
    await outline.focus();
    await page.keyboard.press("ArrowLeft");
    const outlineWidth = Number(await outline.getAttribute("aria-valuenow"));
    assert(outlineWidth !== outlineBefore);
    await page.reload();
    await expectTitle(page, "宽度偏好");
    // Reload reconstructs the default window geometry, not the expanded host.
    await frame(page).getByRole("button", { name: "笔记窗口菜单" }).click();
    await page.getByRole("menuitem", { name: "调整左边" }).click();
    for (let i = 0; i < 18; i++) await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await sidebar.waitFor();
    assertEquals(
        Number(await sidebar.getAttribute("aria-valuenow")),
        sidebarWidth,
    );
    await outline.waitFor();
    await page.waitForFunction(
        (width) =>
            Number(
                document.querySelector('[aria-label="调整大纲宽度"]')
                    ?.getAttribute("aria-valuenow"),
            ) === width,
        outlineWidth,
    );
    // Narrow the host with a maximum saved width; expanding it again must
    // restore that preference instead of persisting the temporary clamp.
    await sidebar.focus();
    await page.keyboard.press("End");
    const maximum = Number(await sidebar.getAttribute("aria-valuenow"));
    await frame(page).getByRole("button", { name: "笔记窗口菜单" }).click();
    await page.getByRole("menuitem", { name: "调整左边" }).click();
    for (let i = 0; i < 18; i++) await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    const editorBox = await frame(page).locator(".documents-editor-pane")
        .boundingBox();
    assert(
        editorBox && editorBox.width >= 718,
        `editor width: ${editorBox?.width}`,
    );
    const clampedBox = await frame(page).locator(".documents-sidebar")
        .boundingBox();
    assert(
        clampedBox && clampedBox.width < maximum,
        `sidebar width: ${clampedBox?.width}`,
    );
    await frame(page).getByRole("button", { name: "笔记窗口菜单" }).click();
    await page.getByRole("menuitem", { name: "调整左边" }).click();
    for (let i = 0; i < 18; i++) await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await sidebar.waitFor();
    assertEquals(Number(await sidebar.getAttribute("aria-valuenow")), maximum);
    await page.setViewportSize({ width: 700, height: 900 });
    await frame(page).getByRole("button", { name: "笔记侧栏" }).click();
    const drawer = frame(page).locator(".documents-sidebar--drawer");
    await drawer.waitFor();
    assertEquals(await drawer.evaluate((element) =>
        getComputedStyle(element).getPropertyValue("--notes-sidebar-width").trim()
    ), "240px");
});
