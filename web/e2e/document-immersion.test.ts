import { assert, assertEquals } from "@std/assert";
import { Buffer } from "node:buffer";
import { chromium, type Page } from "playwright";
import type { DocumentDto } from "../../src/shared/documents.ts";
import { startProductionApp } from "./helpers/production-app.ts";
import { waitForDocument } from "./helpers/document-state.ts";

async function stableLayout(page: Page) {
    await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all(
            document.getAnimations().filter((animation) =>
                animation.effect?.getComputedTiming().iterations !== Infinity
            ).map((animation) => animation.finished.catch(() => {})),
        );
        await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
    });
}

Deno.test("#147: document immersion preserves the editor and normal window semantics", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        reducedMotion: "reduce",
    });
    await page.goto(app.origin + "/register");
    await page.locator("#auth-username").fill("immersion_contract");
    await page.locator("#auth-display-name").fill("Immersion contract");
    await page.locator("#auth-password").fill("Immersion-contract-147!");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(app.origin + "/");
    const doc = await page.evaluate(async () => {
        await fetch("/api/preferences", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ style: "widgets", theme: "light" }),
        });
        const response = await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Immersion contract",
                body:
                    "Retain the existing document editor.\n\n<!-- pagebreak -->\n\nSecond paper.",
            }),
        });
        if (!response.ok) throw new Error(await response.text());
        return (await response.json()).data as DocumentDto;
    });
    await page.reload();
    await page.locator('.desktop-dock button[data-workspace="documents"]')
        .click();
    await page.locator(`[data-document-id="${doc.id}"] h4 button`).click();
    const win = page.locator(`[data-window-id="document:${doc.id}"]`);
    const editor = win.locator(".ProseMirror");
    await editor.waitFor();
    await stableLayout(page);
    const originalEditor = await editor.elementHandle();
    assert(originalEditor);
    const before = await win.boundingBox();
    const libraryBefore = await page.locator('[data-window-id="documents"]')
        .evaluate((element) => {
            const { x, y, width, height } = element.getBoundingClientRect();
            return { x, y, width, height };
        });
    const contentPatches: string[] = [];
    page.on("request", (request) => {
        if (
            request.method() === "PATCH" &&
            new URL(request.url()).pathname === `/api/documents/${doc.id}`
        ) contentPatches.push(request.postData() ?? "");
    });
    await win.getByRole("button", { name: "进入沉浸式", exact: true }).click({
        timeout: 5000,
    });
    await page.waitForFunction(() =>
        !!document.querySelector('[data-window-immersive="true"]')
    );
    await stableLayout(page);
    assertEquals(await win.boundingBox(), {
        x: 0,
        y: 0,
        width: 1440,
        height: 900,
    });
    assert(
        await originalEditor.evaluate((element) =>
            element === document.querySelector(".ProseMirror")
        ),
    );
    assertEquals(
        await page.locator(".topbar").evaluate((element) =>
            (element as HTMLElement).inert
        ),
        true,
    );
    assertEquals(
        await page.locator(".desktop-dock").evaluate((element) =>
            (element as HTMLElement).inert
        ),
        true,
    );
    assertEquals(
        await page.locator('[data-window-id="documents"]').evaluate(
            (element) => {
                const { x, y, width, height } = element.getBoundingClientRect();
                return { x, y, width, height };
            },
        ),
        libraryBefore,
    );
    await win.getByRole("button", { name: "退出沉浸式", exact: true }).click();
    await page.waitForFunction(() =>
        !document.documentElement.dataset.documentImmersive
    );
    await stableLayout(page);
    assertEquals(await win.boundingBox(), before);
    assert(
        await originalEditor.evaluate((element) =>
            element === document.querySelector(".ProseMirror")
        ),
    );
    assertEquals(await win.getAttribute("data-window-mode"), "normal");
    assertEquals(
        await win.getByRole("button", { name: "进入沉浸式", exact: true })
            .evaluate((element) => element === document.activeElement),
        true,
    );
    assertEquals(contentPatches, []);
    for (const mode of ["连续", "页面", "源码"]) {
        await win.getByRole("button", { name: mode, exact: true }).click();
        const body = mode === "源码"
            ? win.getByRole("textbox", {
                name: "Markdown 源码正文",
                exact: true,
            })
            : win.locator(".ProseMirror");
        await body.waitFor();
        const retained = await body.elementHandle();
        assert(retained);
        const canonical = mode === "源码"
            ? await body.inputValue()
            : await body.textContent();
        for (let cycle = 0; cycle < 20; cycle++) {
            await win.getByRole("button", { name: "进入沉浸式", exact: true })
                .click();
            await page.waitForFunction(() =>
                !!document.documentElement.dataset.documentImmersive
            );
            assert(
                await retained.evaluate((node) => node.isConnected),
                `${mode} cycle ${cycle} must retain its live editor`,
            );
            assertEquals(
                mode === "源码"
                    ? await body.inputValue()
                    : await body.textContent(),
                canonical,
            );
            await page.keyboard.press("Escape");
            await page.waitForFunction(() =>
                !document.documentElement.dataset.documentImmersive
            );
            await page.waitForFunction(() =>
                document.activeElement?.hasAttribute("data-immersive-enter")
            );
            await stableLayout(page);
            assertEquals(
                await win.boundingBox(),
                before,
                `${mode} immersion cycle ${cycle}: restored frame`,
            );
        }
    }
    for (let cycle = 0; cycle < 20; cycle++) {
        await win.getByRole("button", { name: "连续", exact: true }).click();
        await win.locator(".ProseMirror").waitFor();
        const rich = await win.locator(".ProseMirror").elementHandle();
        assert(rich);
        await win.getByRole("button", { name: "页面", exact: true }).click();
        assert(
            await rich.evaluate((node) =>
                node === document.querySelector(".ProseMirror")
            ),
            "continuous/page transitions must retain the rich editor",
        );
        await win.getByRole("button", { name: "源码", exact: true }).click();
        assertEquals(
            await win.getByRole("textbox", {
                name: "Markdown 源码正文",
                exact: true,
            }).inputValue(),
            doc.body,
        );
    }
    assertEquals(
        contentPatches,
        [],
        "presentation-only cycles must not save document content",
    );
    const saved = await page.evaluate(
        async (id) =>
            (await (await fetch(`/api/documents/${id}`)).json())
                .data as DocumentDto,
        doc.id,
    );
    assertEquals(saved.version, doc.version);
    await win.getByRole("button", { name: "连续", exact: true }).click();
    await win.locator(".ProseMirror").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText(" retained-undo-147");
    await waitForDocument(
        page,
        doc.id,
        (document) => document.body.trimEnd().endsWith(" retained-undo-147"),
    );
    await win.locator('.document-save-status[data-status="saved"]').waitFor({
        state: "attached",
    });
    const dirtyEditor = await win.locator(".ProseMirror").elementHandle();
    assert(dirtyEditor);
    const selectionBefore = await win.locator(".ProseMirror").evaluate(() => {
        const selection = getSelection();
        return {
            anchorOffset: selection?.anchorOffset,
            focusOffset: selection?.focusOffset,
            text: selection?.anchorNode?.textContent,
        };
    });
    const historyCyclePatchCount = contentPatches.length;
    for (const mode of ["连续", "页面"]) {
        await win.getByRole("button", { name: mode, exact: true }).click();
        await stableLayout(page);
        for (let cycle = 0; cycle < 20; cycle++) {
            await win.getByRole("button", { name: "进入沉浸式", exact: true })
                .click();
            await page.waitForFunction(() =>
                !!document.documentElement.dataset.documentImmersive
            );
            await page.keyboard.press("Escape");
            await page.waitForFunction(() =>
                !document.documentElement.dataset.documentImmersive
            );
            await page.waitForFunction(() =>
                document.activeElement?.hasAttribute("data-immersive-enter")
            );
            assert(
                await dirtyEditor.evaluate((node) =>
                    node === document.querySelector(".ProseMirror")
                ),
            );
            assertEquals(
                await win.locator(".ProseMirror").evaluate(() => {
                    const selection = getSelection();
                    return {
                        anchorOffset: selection?.anchorOffset,
                        focusOffset: selection?.focusOffset,
                        text: selection?.anchorNode?.textContent,
                    };
                }),
                selectionBefore,
                "presentation must preserve the document selection",
            );
        }
    }
    assertEquals(
        contentPatches.length,
        historyCyclePatchCount,
        "saved history/selection cycles must not write content",
    );
    await win.getByRole("button", { name: "连续", exact: true }).click();
    await win.getByRole("button", { name: "撤销", exact: true }).click();
    await waitForDocument(
        page,
        doc.id,
        (document) => !document.body.includes("retained-undo-147"),
    );
    const dirtyControls: Array<
        { patchCount: number; versionIncrement: number }
    > = [];
    for (const immersive of [false, true]) {
        await win.locator('.document-save-status[data-status="saved"]').waitFor(
            { state: "attached" },
        );
        const baseline = await page.evaluate(
            async (id) =>
                (await (await fetch(`/api/documents/${id}`)).json())
                    .data as DocumentDto,
            doc.id,
        );
        const patchStart = contentPatches.length;
        await win.locator(".ProseMirror").click();
        await page.keyboard.press("Control+End");
        await page.keyboard.insertText(" dirty-control-147");
        if (immersive) {
            await win.getByRole("button", { name: "进入沉浸式", exact: true })
                .click();
        } else {await win.getByRole("textbox", {
                name: "文档标题",
                exact: true,
            }).focus();}
        await waitForDocument(
            page,
            doc.id,
            (document) =>
                document.body.trimEnd().endsWith(" dirty-control-147"),
        );
        await win.locator('.document-save-status[data-status="saved"]').waitFor(
            { state: "attached" },
        );
        const committed = await page.evaluate(
            async (id) =>
                (await (await fetch(`/api/documents/${id}`)).json())
                    .data as DocumentDto,
            doc.id,
        );
        assertEquals(
            committed.version,
            baseline.version + 1,
            "dirty content must save exactly one content version",
        );
        dirtyControls.push({
            patchCount: contentPatches.length - patchStart,
            versionIncrement: committed.version - baseline.version,
        });
        if (immersive) {
            await win.getByRole("button", { name: "退出沉浸式", exact: true })
                .click();
            await page.waitForFunction(() =>
                !document.documentElement.dataset.documentImmersive
            );
        }
        await win.getByRole("button", { name: "撤销", exact: true }).click();
        await waitForDocument(
            page,
            doc.id,
            (document) => document.body === baseline.body,
        );
        await win.locator('.document-save-status[data-status="saved"]').waitFor(
            { state: "attached" },
        );
    }
    assertEquals(
        dirtyControls[1],
        dirtyControls[0],
        "geometry must not add saves beyond the identical dirty blur control",
    );
    await win.getByRole("button", { name: "进入沉浸式", exact: true }).click();
    await win.getByRole("button", { name: "历史", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assertEquals(
        await win.getAttribute("data-window-immersive"),
        "true",
        "Escape must dismiss history before immersion",
    );
    await page.route(`**/api/documents/${doc.id}`, async (route) => {
        if (route.request().method() === "PATCH") await route.abort("failed");
        else await route.continue();
    });
    await win.locator(".ProseMirror").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText(" recover-save-error");
    await win.getByRole("button", { name: "重试保存", exact: true }).waitFor();
    assertEquals(await win.getAttribute("data-window-immersive"), "true");
    await page.unroute(`**/api/documents/${doc.id}`);
    await win.getByRole("button", { name: "重试保存", exact: true }).click();
    await waitForDocument(
        page,
        doc.id,
        (document) => document.body.includes("recover-save-error"),
    );
    await win.locator('.document-save-status[data-status="saved"]').waitFor({
        state: "attached",
    });
    await page.evaluate(async (id) => {
        const latest = (await (await fetch(`/api/documents/${id}`)).json())
            .data as DocumentDto;
        const response = await fetch(`/api/documents/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                version: latest.version,
                body: latest.body + "\n\nRemote conflict fixture",
            }),
        });
        if (!response.ok) throw new Error(await response.text());
    }, doc.id);
    await win.locator(".ProseMirror").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.insertText(" local-conflict-draft");
    await page.getByRole("button", { name: "覆盖为本地版本", exact: true })
        .waitFor();
    assertEquals(
        await win.getAttribute("data-window-immersive"),
        "true",
        "409 must preserve immersion and expose conflict choices",
    );
    await page.keyboard.press("Escape");
    assertEquals(
        await win.getAttribute("data-window-immersive"),
        "true",
        "conflict dialog takes priority over immersive Escape",
    );
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await win.getByRole("button", { name: "处理冲突", exact: true }).click();
    await page.getByRole("button", { name: "暂不处理", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await win.getByRole("button", { name: "处理冲突", exact: true }).click();
    await page.locator('[data-slot="dialog-backdrop"]').click({
        position: { x: 5, y: 5 },
    });
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await win.getByRole("button", { name: "处理冲突", exact: true }).click();

    await page.getByRole("button", {
        name: "保留云端版本",
        exact: true,
    }).click();
    const cloudConfirmation = page.getByRole("alertdialog");
    await cloudConfirmation.waitFor();
    await cloudConfirmation.getByRole("button", {
        name: "返回",
        exact: true,
    }).click();
    await cloudConfirmation.waitFor({ state: "hidden" });

    let failConflictResolution = true;
    await page.route(`**/api/documents/${doc.id}`, async (route) => {
        const request = route.request();
        const payload = request.method() === "PATCH"
            ? request.postDataJSON() as { origin?: string }
            : null;
        if (
            payload?.origin === "conflict_resolution" &&
            failConflictResolution
        ) {
            failConflictResolution = false;
            await route.abort("failed");
        } else {
            await route.continue();
        }
    });
    await page.getByRole("button", {
        name: "覆盖为本地版本",
        exact: true,
    }).click();
    const localConfirmation = page.getByRole("alertdialog");
    await localConfirmation.waitFor();
    await localConfirmation.getByRole("button", {
        name: "确认覆盖云端",
        exact: true,
    }).click();
    const conflictDialog = page.getByRole("dialog");
    await conflictDialog.getByRole("alert").waitFor();
    assert(
        (await conflictDialog.getByRole("alert").textContent())?.includes(
            "处理冲突失败",
        ),
        "failed conflict resolution must be reported in the dialog",
    );
    assert(
        (await win.locator(".ProseMirror").textContent())?.includes(
            "local-conflict-draft",
        ),
        "failed conflict resolution must preserve local editor content",
    );

    await page.keyboard.press("Escape");
    await conflictDialog.waitFor({ state: "hidden" });
    await win.getByRole("button", { name: "处理冲突", exact: true }).click();
    await conflictDialog.locator("pre").filter({
        hasText: "local-conflict-draft",
    }).waitFor();
    await page.getByRole("button", {
        name: "覆盖为本地版本",
        exact: true,
    }).click();
    await page.getByRole("alertdialog").getByRole("button", {
        name: "确认覆盖云端",
        exact: true,
    }).click();
    await conflictDialog.waitFor({ state: "hidden" });
    await page.unroute(`**/api/documents/${doc.id}`);
    await waitForDocument(
        page,
        doc.id,
        (document) => document.body.includes("local-conflict-draft"),
    );
    let releaseUpload!: () => void;
    const uploadGate = new Promise<void>((resolve) => {
        releaseUpload = resolve;
    });
    cleanup.defer(() => releaseUpload());
    await page.route(`**/api/documents/${doc.id}/assets`, async (route) => {
        await uploadGate;
        await route.continue();
    });
    await win.locator('input[type="file"]').setInputFiles({
        name: "immersive-upload.png",
        mimeType: "image/png",
        buffer: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jgXkAAAAASUVORK5CYII=",
            "base64",
        ),
    });
    await win.locator(".desktop-immersive-save-status").filter({
        hasText: /^正在上传图片…$/,
    }).waitFor();
    assertEquals(await win.getAttribute("data-window-immersive"), "true");
    releaseUpload();
    await win.locator('img[data-canonical-src^="asset://"]').waitFor();
    await waitForDocument(
        page,
        doc.id,
        (document) => document.body.includes("asset://"),
    );
    await page.unroute(`**/api/documents/${doc.id}/assets`);
    const dock = page.locator(".desktop-dock");
    const trigger = page.getByRole("button", {
        name: "显示 Dock",
        exact: true,
    });
    await win.getByRole("button", { name: "退出沉浸式", exact: true }).focus();
    for (let tab = 0; tab < 100; tab++) {
        await page.keyboard.press("Tab");
        if (await trigger.evaluate((node) => node === document.activeElement)) {
            break;
        }
    }
    assert(
        await trigger.evaluate((node) => node === document.activeElement),
        "the bottom Dock trigger must be reachable through ordinary Tab navigation",
    );
    await page.mouse.move(720, 300);
    await page.waitForFunction(() =>
        !document.querySelector<HTMLElement>(".desktop-dock")?.inert
    );
    await win.getByRole("button", { name: "退出沉浸式", exact: true }).focus();
    await page.waitForFunction(() =>
        document.querySelector<HTMLElement>(".desktop-dock")?.inert === true
    );
    await trigger.focus();
    await trigger.press("Enter");
    await page.waitForFunction(() =>
        !document.querySelector<HTMLElement>(".desktop-dock")?.inert
    );
    await dock.locator(`[data-running-document="document:${doc.id}"]`).click();
    assertEquals(
        await win.getAttribute("data-window-immersive"),
        "true",
        "selecting the current Dock item must retain immersion",
    );
    await page.waitForFunction(
        (id) =>
            document.querySelector(
                `[data-window-id="document:${id}"] .ProseMirror`,
            ) === document.activeElement,
        doc.id,
    );
    assertEquals(
        await page.locator(`[data-window-id="document:${doc.id}"]`).count(),
        1,
    );
    await page.mouse.move(720, 300);
    await page.waitForFunction(() =>
        document.querySelector<HTMLElement>(".desktop-dock")?.inert === true
    );
    assertEquals((await trigger.boundingBox())?.height, 12);
    await page.mouse.move(720, 899);
    await page.waitForFunction(() =>
        !document.querySelector<HTMLElement>(".desktop-dock")?.inert
    );
    await dock.locator('[data-workspace="documents"]').click();
    await page.waitForFunction(() =>
        !document.documentElement.dataset.documentImmersive
    );
    await stableLayout(page);
    assertEquals(await win.boundingBox(), before);
    assertEquals(
        await page.locator('[data-window-id="documents"]').getAttribute(
            "data-window-active",
        ),
        "true",
    );
    await dock.locator(`[data-running-document="document:${doc.id}"]`).click();
    await win.getByRole("button", { name: "进入沉浸式", exact: true }).click();
    await trigger.focus();
    await trigger.press("Space");
    await dock.getByRole("button", { name: "窗口总览", exact: true }).click();
    await page.waitForFunction(() =>
        !document.documentElement.dataset.documentImmersive
    );
    await page.keyboard.press("Escape");
    await win.getByRole("button", { name: "进入沉浸式", exact: true }).click();
    await win.getByRole("button", { name: "最小化窗口", exact: true }).click();
    await page.waitForFunction(() =>
        !document.documentElement.dataset.documentImmersive
    );
    await dock.locator(`[data-running-document="document:${doc.id}"]`).click();
    await win.getByRole("button", { name: "进入沉浸式", exact: true })
        .waitFor();
    assertEquals(await win.getAttribute("data-window-mode"), "normal");
    await win.getByRole("button", { name: "最大化窗口", exact: true }).click();
    await stableLayout(page);
    const maximized = await win.boundingBox();
    await dock.locator('[data-workspace="apps"]').click();
    const appsWindow = page.locator('[data-window-id="apps"]');
    await appsWindow.getByRole("button", { name: "窗口系统菜单", exact: true })
        .click();
    await page.getByRole("menuitem", { name: "靠左分屏", exact: true }).click();
    await stableLayout(page);
    assertEquals(await appsWindow.getAttribute("data-window-active"), "true");
    await win.getByRole("button", { name: "进入沉浸式", exact: true }).click();
    await page.waitForFunction(() =>
        !!document.documentElement.dataset.documentImmersive
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() =>
        !document.documentElement.dataset.documentImmersive
    );
    await stableLayout(page);
    assertEquals(await win.getAttribute("data-window-mode"), "maximized");
    assertEquals(await win.boundingBox(), maximized);
    assertEquals(
        await appsWindow.count(),
        1,
        "Escape must not close the hidden active Apps window",
    );
    assertEquals(await appsWindow.getAttribute("data-window-active"), "true");
    await appsWindow.getByRole("button", { name: "收起工作区", exact: true })
        .click();
    await win.getByRole("button", { name: "进入沉浸式", exact: true }).click();
    await page.waitForFunction(() =>
        !!document.documentElement.dataset.documentImmersive
    );
    await page.reload();
    await win.getByRole("button", { name: "进入沉浸式", exact: true })
        .waitFor();
    assertEquals(await page.locator("[data-window-immersive=true]").count(), 0);
    assertEquals(await win.getAttribute("data-window-mode"), "maximized");
    await win.getByRole("button", { name: "进入沉浸式", exact: true }).click();
    await page.waitForFunction(() =>
        !!document.documentElement.dataset.documentImmersive
    );
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForFunction(() =>
        !document.documentElement.dataset.documentImmersive
    );
    assertEquals(
        await page.getByRole("button", { name: "退出沉浸式", exact: true })
            .count(),
        0,
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await win.getByRole("button", { name: "窗口系统菜单", exact: true })
        .click();
    await page.getByRole("menuitem", { name: "靠左分屏", exact: true }).click();
    await stableLayout(page);
    const snapped = await win.boundingBox();
    await win.getByRole("button", { name: "进入沉浸式", exact: true }).click();
    await page.waitForFunction(() =>
        !!document.documentElement.dataset.documentImmersive
    );
    await page.keyboard.press("Escape");
    await page.waitForFunction(() =>
        !document.documentElement.dataset.documentImmersive
    );
    await stableLayout(page);
    assertEquals(await win.getAttribute("data-window-mode"), "snapped");
    assertEquals(await win.getAttribute("data-window-snap"), "left");
    assertEquals(await win.boundingBox(), snapped);
    await page.keyboard.press("Escape");
    assertEquals(
        await win.count(),
        1,
        "Escape must not close an ordinary document window",
    );
    await page.setViewportSize({ width: 1024, height: 200 });
    await stableLayout(page);
    const fallbackFrame = await win.boundingBox();
    assert(
        fallbackFrame && fallbackFrame.x >= 0 && fallbackFrame.y >= 0 &&
            fallbackFrame.x + fallbackFrame.width <= 1024 &&
            fallbackFrame.y + fallbackFrame.height <= 200,
        "unusable geometry must present a viewport-bounded restricted Surface",
    );
    assert(
        await win.getByRole("button", { name: "关闭笔记", exact: true })
            .evaluate((button) => {
                const bounds = button.getBoundingClientRect();
                const hit = document.elementFromPoint(
                    bounds.x + bounds.width / 2,
                    bounds.y + bounds.height / 2,
                );
                return bounds.x >= 0 && bounds.right <= innerWidth &&
                    bounds.y >= 0 &&
                    bounds.bottom <= innerHeight &&
                    (hit === button || button.contains(hit));
            }),
        "tiny viewport fallback must keep its close control on-screen and clickable",
    );
    await win.locator(".document-editor-container").evaluate((node) => {
        node.scrollTop = 0;
    });
    await page.mouse.move(
        fallbackFrame.x + 20,
        fallbackFrame.y + fallbackFrame.height - 20,
    );
    await page.mouse.wheel(0, 300);
    await page.waitForFunction(
        (id) =>
            (document.querySelector(
                `[data-window-id="document:${id}"] .document-editor-container`,
            )?.scrollTop ?? 0) > 0,
        doc.id,
    );
    assertEquals(
        await win.getByRole("button", { name: "进入沉浸式", exact: true })
            .count(),
        0,
    );
    assertEquals(await win.locator(".desktop-window-resize-handle").count(), 0);
    assertEquals(
        await win.getAttribute("data-window-mode"),
        "snapped",
        "fallback presentation must not rewrite persisted window semantics",
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await win.getByRole("button", { name: "进入沉浸式", exact: true })
        .waitFor();
    await stableLayout(page);
    assertEquals(await win.boundingBox(), snapped);
    await win.getByRole("button", { name: "进入沉浸式", exact: true }).click();
    await page.waitForFunction(() =>
        !!document.documentElement.dataset.documentImmersive
    );
    await win.getByRole("button", { name: "关闭笔记", exact: true }).click();
    await win.waitFor({ state: "detached" });
    assertEquals(
        await page.locator("[data-immersive-dock-trigger]").count(),
        0,
    );
    assertEquals(
        await page.locator(".topbar").evaluate((node) =>
            (node as HTMLElement).inert
        ),
        false,
    );
    await page.locator(`[data-document-id="${doc.id}"] h4 button`).click();
    await editor.waitFor();
    await win.getByRole("button", { name: "进入沉浸式", exact: true }).click();
    await page.waitForFunction(() =>
        !!document.documentElement.dataset.documentImmersive
    );
    assertEquals(
        await page.evaluate(async () =>
            (await fetch("/api/auth/logout", { method: "POST" })).status
        ),
        200,
    );
    await win.getByRole("button", { name: "历史", exact: true }).click();
    await page.getByRole("link", { name: "登录", exact: true }).waitFor();
    assertEquals(
        await win.count(),
        0,
        "revoked session must remove the account's document Surface",
    );
    assertEquals(
        await page.locator("[data-immersive-dock-trigger]").count(),
        0,
    );
    assertEquals(
        await page.locator(".topbar").evaluate((node) =>
            (node as HTMLElement).inert
        ),
        false,
    );
    assertEquals(
        await page.evaluate(() =>
            document.documentElement.dataset.documentImmersive
        ),
        undefined,
    );
    await page.getByRole("link", { name: "登录", exact: true }).click();
    await page.locator("#auth-username").fill("immersion_contract");
    await page.locator("#auth-password").fill("Immersion-contract-147!");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(app.origin + "/");
    await page.locator('.desktop-dock button[data-workspace="documents"]')
        .waitFor();
    assertEquals(
        await page.evaluate(() =>
            document.documentElement.dataset.documentImmersive
        ),
        undefined,
        "logging in again must not restore session-only immersion",
    );
    const restrictedContext = await browser.newContext({
        viewport: { width: 1024, height: 350 },
        reducedMotion: "reduce",
        storageState: { cookies: await page.context().cookies(), origins: [] },
    });
    cleanup.defer(() => restrictedContext.close());
    const restrictedPage = await restrictedContext.newPage();
    await restrictedPage.goto(app.origin + "/");
    const restrictedDocument = await restrictedPage.evaluate(async () => {
        const note = await fetch("/api/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Initial restricted note",
                body: "Note editor remains reachable.",
            }),
        });
        if (!note.ok) throw new Error(await note.text());
        const document = await fetch("/api/documents", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: "Initial restricted document",
                body: Array.from(
                    { length: 80 },
                    (_, index) =>
                        `Paragraph ${
                            index + 1
                        }. Scroll the initial restricted document without creating an illegal window.`,
                ).join("\n\n"),
            }),
        });
        if (!document.ok) throw new Error(await document.text());
        return (await document.json()).data as DocumentDto;
    });
    await restrictedPage.reload();
    await restrictedPage.locator('.desktop-dock button[data-workspace="apps"]')
        .click();
    const restrictedSurface = restrictedPage.locator(
        '.workspace-panel[data-viewport-constrained="true"]',
    );
    await restrictedSurface.waitFor();
    assertEquals(await restrictedPage.locator("[data-window-id]").count(), 0);
    await restrictedSurface.getByRole("button", {
        name: "收起工作区",
        exact: true,
    }).click();
    await restrictedSurface.waitFor({ state: "detached" });
    await restrictedPage.locator('.desktop-dock button[data-workspace="notes"]')
        .click();
    await restrictedSurface.locator(".note-title", {
        hasText: "Initial restricted note",
    }).click();
    await restrictedSurface.locator(".note-editor").waitFor();
    assertEquals(await restrictedPage.locator("[data-window-id]").count(), 0);
    await restrictedSurface.getByRole("button", {
        name: "收起工作区",
        exact: true,
    }).click();
    await restrictedSurface.waitFor({ state: "detached" });
    await restrictedPage.locator(
        '.desktop-dock button[data-workspace="documents"]',
    ).click();
    await restrictedSurface.locator(
        `[data-document-id="${restrictedDocument.id}"] h4 button`,
    ).click();
    await restrictedSurface.locator(".ProseMirror").waitFor();
    await stableLayout(restrictedPage);
    assertEquals(await restrictedPage.locator("[data-window-id]").count(), 0);
    const initialScrollArea = restrictedSurface.locator(
        ".document-editor-scroll-area",
    );
    await initialScrollArea.hover();
    await restrictedPage.mouse.wheel(0, 500);
    await restrictedPage.waitForFunction(() =>
        (document.querySelector(".workspace-panel .document-editor-scroll-area")
            ?.scrollTop ?? 0) > 0
    );
    await restrictedSurface.getByRole("button", {
        name: "收起工作区",
        exact: true,
    }).click();
    await restrictedSurface.waitFor({ state: "detached" });
    await restrictedPage.locator('.desktop-dock button[data-workspace="apps"]')
        .click();
    await restrictedSurface.waitFor();
    await restrictedPage.setViewportSize({ width: 1024, height: 768 });
    await restrictedPage.locator('[data-window-id="apps"]').waitFor();
    await restrictedSurface.waitFor({ state: "detached" });
});
