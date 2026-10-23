import { assertEquals } from "@std/assert";
import { chromium, type Dialog, type Page } from "playwright";
import { startProductionApp } from "./helpers/production-app.ts";

async function startZenAppsFixture(username: string) {
    const app = await startProductionApp();
    const browser = await chromium.launch({
        handleSIGTERM: false,
        args: ["--no-sandbox"],
    });
    try {
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        await page.goto(app.origin + "/register");
        await page.locator("#auth-username").fill(username);
        await page.locator("#auth-display-name").fill("Route guard tester");
        await page.locator("#auth-password").fill(
            "Apps-route-guard-password-174!",
        );
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(app.origin + "/");
        await page.locator("main.home").waitFor({ state: "visible" });
        return {
            page,
            origin: app.origin,
            async close() {
                await browser.close();
                await app.close();
            },
        };
    } catch (error) {
        await browser.close();
        await app.close();
        throw error;
    }
}

async function openZenAppsForm(
    page: Page,
    draft?: { url?: string; name?: string },
) {
    const appsEdge = page.locator('.zen-edge-btn[data-workspace="apps"]');
    await appsEdge.focus();
    await appsEdge.press("Enter");
    await page.locator(".apps-workspace-root").waitFor({ state: "visible" });
    await page.getByRole("button", {
        name: "添加应用",
        exact: true,
    }).click();
    await page.locator("#app-url-input").waitFor({ state: "visible" });
    if (draft?.url !== undefined) {
        await page.locator("#app-url-input").fill(draft.url);
    }
    if (draft?.name !== undefined) {
        await page.locator("#app-name-input").fill(draft.name);
    }
}

async function goToSettings(page: Page, origin: string) {
    await page.getByRole("link", { name: "设置", exact: true }).click();
    await page.waitForURL(origin + "/settings");
    await page.getByRole("navigation", { name: "设置分类" }).waitFor({
        state: "visible",
    });
}

async function goHome(page: Page, origin: string) {
    await page.getByRole("link", { name: "Searcher 首页", exact: true })
        .click();
    await page.waitForURL(origin + "/");
    await page.locator("main.home").waitFor({ state: "visible" });
}

Deno.test("apps edit keeps fields and confirmation across hosts and window modes", async () => {
    const app = await startProductionApp();
    const browser = await chromium.launch({
        handleSIGTERM: false,
        args: ["--no-sandbox"],
    });
    try {
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        await page.goto(app.origin + "/register");
        await page.locator("#auth-username").fill("apps_session");
        await page.locator("#auth-display-name").fill("Session tester");
        await page.locator("#auth-password").fill("Apps-session-password-141!");
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(app.origin + "/");
        await page.evaluate(async () => {
            await fetch("/api/webapps", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "编辑目标",
                    url: "https://original.invalid/",
                    iconSource: "default",
                    openMode: "global",
                    isPinned: false,
                }),
            });
            await fetch("/api/webapp-groups", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "编辑目标文件夹", sortOrder: 0 }),
            });
        });
        await page.reload();
        const appsEdge = page.locator('.zen-edge-btn[data-workspace="apps"]');
        await appsEdge.focus();
        await appsEdge.press("Enter");
        await page.locator(".apps-workspace-root").waitFor({
            state: "visible",
        });
        await page.locator('.launcher-app:has-text("编辑目标")').click({
            button: "right",
        });
        await page.getByRole("menuitem", { name: "编辑", exact: true }).click();
        await page.locator("#app-url-input").fill("https://edited.invalid/");
        await page.locator("#app-name-input").fill("编辑中的全部字段");
        await page.locator("#app-group-select").selectOption({
            label: "编辑目标文件夹",
        });
        await page.getByRole("switch", { name: "固定到首页", exact: true })
            .click();
        await page.getByRole("tab", { name: "新标签页", exact: true }).click();
        await page.getByRole("button", { name: "更换图标", exact: true })
            .click();
        await page.getByRole("tab", { name: "网络图片", exact: true }).click();
        await page.locator('input[placeholder="https://example.com/icon.png"]')
            .fill("https://unsubmitted.invalid/icon.png");
        await page.getByRole("button", { name: "保存修改", exact: true })
            .click();
        await page.getByRole("alertdialog").waitFor();
        for (
            const width of [767, 768, 767, 1023, 1024, 1023, 1440, 390, 1440]
        ) {
            await page.setViewportSize({ width, height: 900 });
            await page.getByRole("alertdialog").waitFor();
            assertEquals(
                await page.locator("#app-url-input").inputValue(),
                "https://edited.invalid/",
            );
            assertEquals(
                await page.locator("#app-name-input").inputValue(),
                "编辑中的全部字段",
            );
            assertEquals(
                await page.locator("#app-group-select option:checked")
                    .textContent(),
                "编辑目标文件夹",
            );
            assertEquals(
                await page.getByRole("switch", {
                    name: "固定到首页",
                    exact: true,
                    includeHidden: true,
                }).getAttribute("aria-checked"),
                "true",
            );
            assertEquals(
                await page.getByRole("tab", {
                    name: "新标签页",
                    exact: true,
                    includeHidden: true,
                })
                    .getAttribute("aria-selected"),
                "true",
            );
            assertEquals(
                await page.locator(
                    'input[placeholder="https://example.com/icon.png"]',
                ).inputValue(),
                "https://unsubmitted.invalid/icon.png",
            );
        }
        await page.keyboard.press("Escape");
        await page.getByRole("alertdialog").waitFor({ state: "detached" });
        // The Dock is hidden while a panel is open; switch with the header tabs.
        await page.getByRole("tab", { name: "便签工作区", exact: true })
            .click();
        await page.locator('.workspace-panel[aria-label="便签工作区"]')
            .waitFor({ state: "visible" });
        assertEquals(await page.getByRole("alertdialog").count(), 0);
        await page.getByRole("tab", { name: "应用工作区", exact: true })
            .click();
        await page.locator("#app-name-input").waitFor({ state: "visible" });
        assertEquals(
            await page.locator("#app-url-input").inputValue(),
            "https://edited.invalid/",
        );
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            "编辑中的全部字段",
        );
        assertEquals(await page.getByRole("alertdialog").count(), 0);
        await page.getByRole("button", { name: "取消", exact: true }).click();
        await page.getByRole("alertdialog").waitFor();
        await page.getByRole("button", { name: "继续编辑", exact: true })
            .click();
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            "编辑中的全部字段",
        );
        await page.getByRole("button", { name: "取消", exact: true }).click();
        await page.getByRole("button", { name: "放弃修改", exact: true })
            .click();
        await page.locator('.launcher-app:has-text("编辑目标")').waitFor();
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("Zen Apps dirty new-app draft survives a Settings route leave", async () => {
    const app = await startProductionApp();
    const browser = await chromium.launch({
        handleSIGTERM: false,
        args: ["--no-sandbox"],
    });
    try {
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        await page.goto(app.origin + "/register");
        await page.locator("#auth-username").fill("apps_route_guard");
        await page.locator("#auth-display-name").fill("Route guard tester");
        await page.locator("#auth-password").fill(
            "Apps-route-guard-password-174!",
        );
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(app.origin + "/");
        await page.locator("main.home").waitFor({ state: "visible" });

        await page.locator('[data-workspace="apps"]').click();
        await page.locator(".apps-workspace-root").waitFor({
            state: "visible",
        });
        await page.getByRole("button", {
            name: "添加应用",
            exact: true,
        }).click();
        await page.locator("#app-url-input").fill("https://draft.invalid/");
        await page.locator("#app-name-input").fill("未保存的新应用");

        const historyLength = await page.evaluate(() => history.length);
        const settingsLink = page.getByRole("link", {
            name: "设置",
            exact: true,
        });
        await settingsLink.click();

        const leaveDialog = page.getByRole("alertdialog");
        await leaveDialog.waitFor({ state: "visible" });
        assertEquals(new URL(page.url()).pathname, "/");
        await leaveDialog.getByRole("button", {
            name: "继续编辑",
            exact: true,
        }).click();
        await leaveDialog.waitFor({ state: "detached" });
        assertEquals(new URL(page.url()).pathname, "/");
        assertEquals(
            await page.locator("#app-url-input").inputValue(),
            "https://draft.invalid/",
        );
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            "未保存的新应用",
        );
        assertEquals(await page.evaluate(() => history.length), historyLength);

        await settingsLink.click();
        await leaveDialog.waitFor({ state: "visible" });
        await leaveDialog.getByRole("button", {
            name: "放弃修改",
            exact: true,
        }).click();
        await page.waitForURL(app.origin + "/settings");
        await page.getByRole("navigation", { name: "设置分类" }).waitFor({
            state: "visible",
        });
        assertEquals(await page.getByRole("alertdialog").count(), 0);
        assertEquals(
            await page.evaluate(() => history.length),
            historyLength + 1,
        );
    } finally {
        await browser.close();
        await app.close();
    }
});

Deno.test("clean Zen Apps form leaves for Settings without confirmation", async () => {
    const fixture = await startZenAppsFixture("apps_clean_route");
    try {
        await openZenAppsForm(fixture.page);
        await goToSettings(fixture.page, fixture.origin);
        assertEquals(await fixture.page.getByRole("alertdialog").count(), 0);
    } finally {
        await fixture.close();
    }
});

Deno.test("dirty Apps blocks SearchHome's programmatic Ask navigation", async () => {
    const fixture = await startZenAppsFixture("apps_programmatic_route");
    const { page, origin } = fixture;
    const draft = {
        url: "https://ask-route.invalid/",
        name: "Dirty before Ask navigation",
    };
    const query = "programmatic Ask route from Apps";
    try {
        await openZenAppsForm(page, draft);
        await page.getByRole("button", { name: /当前搜索引擎/ }).click();
        await page.getByRole("menuitemradio", {
            name: "AI 问答",
            exact: true,
        }).click();
        await page.locator("#search-query").fill(query);
        await page.locator("#search-query").press("Enter");

        const leaveDialog = page.getByRole("alertdialog");
        await leaveDialog.waitFor({ state: "visible" });
        assertEquals(new URL(page.url()).pathname, "/");
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            draft.name,
        );
        await leaveDialog.getByRole("button", {
            name: "继续编辑",
            exact: true,
        }).click();
        await leaveDialog.waitFor({ state: "detached" });
        assertEquals(new URL(page.url()).pathname, "/");
        assertEquals(
            await page.locator("#app-url-input").inputValue(),
            draft.url,
        );
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            draft.name,
        );

        await page.locator("#search-query").press("Enter");
        await leaveDialog.waitFor({ state: "visible" });
        await leaveDialog.getByRole("button", {
            name: "放弃修改",
            exact: true,
        }).click();
        await page.waitForURL((url) =>
            url.origin === origin && url.pathname === "/ask" &&
            url.searchParams.get("q") === query
        );
        await page.locator(".ask-workspace-layout").waitFor({
            state: "visible",
        });
        await leaveDialog.waitFor({ state: "detached" });
        assertEquals(await page.getByRole("alertdialog").count(), 0);
    } finally {
        await fixture.close();
    }
});

Deno.test("dirty Apps drafts block browser Back and Forward until confirmed", async () => {
    const fixture = await startZenAppsFixture("apps_back_forward");
    const { page, origin } = fixture;
    const leaveDialog = page.getByRole("alertdialog");
    try {
        await goToSettings(page, origin);
        await goHome(page, origin);
        const backDraft = {
            url: "https://back-route.invalid/",
            name: "Back navigation draft",
        };
        await openZenAppsForm(page, backDraft);

        const cancelledBack = page.goBack();
        await leaveDialog.waitFor({ state: "visible" });
        assertEquals(await page.getByRole("alertdialog").count(), 1);
        await leaveDialog.getByRole("button", {
            name: "继续编辑",
            exact: true,
        }).click();
        await cancelledBack;
        await leaveDialog.waitFor({ state: "detached" });
        assertEquals(new URL(page.url()).pathname, "/");
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            backDraft.name,
        );

        const confirmedBack = page.goBack();
        await leaveDialog.waitFor({ state: "visible" });
        await leaveDialog.getByRole("button", {
            name: "放弃修改",
            exact: true,
        }).click();
        await page.waitForURL(origin + "/settings");
        await confirmedBack;
        await leaveDialog.waitFor({ state: "detached" });
        assertEquals(await page.getByRole("alertdialog").count(), 0);

        await page.goForward();
        await page.waitForURL(origin + "/");
        await goToSettings(page, origin);
        const cleanBack = page.goBack();
        await page.waitForURL(origin + "/");
        await cleanBack;

        const forwardDraft = {
            url: "https://forward-route.invalid/",
            name: "Forward navigation draft",
        };
        await openZenAppsForm(page, forwardDraft);
        const cancelledForward = page.goForward();
        await leaveDialog.waitFor({ state: "visible" });
        assertEquals(await page.getByRole("alertdialog").count(), 1);
        await leaveDialog.getByRole("button", {
            name: "继续编辑",
            exact: true,
        }).click();
        await cancelledForward;
        await leaveDialog.waitFor({ state: "detached" });
        assertEquals(new URL(page.url()).pathname, "/");
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            forwardDraft.name,
        );

        const confirmedForward = page.goForward();
        await leaveDialog.waitFor({ state: "visible" });
        await leaveDialog.getByRole("button", {
            name: "放弃修改",
            exact: true,
        }).click();
        await page.waitForURL(origin + "/settings");
        await confirmedForward;
        await leaveDialog.waitFor({ state: "detached" });
        assertEquals(await page.getByRole("alertdialog").count(), 0);
    } finally {
        await fixture.close();
    }
});

Deno.test("Zen Apps draft survives presenter and edge workspace switches; close can cancel", async () => {
    const fixture = await startZenAppsFixture("apps_presenter_route");
    const { page } = fixture;
    const draft = {
        url: "https://presenter-route.invalid/",
        name: "Presenter-preserved Apps draft",
    };
    try {
        await openZenAppsForm(page, draft);
        await page.setViewportSize({ width: 767, height: 844 });
        await page.locator(".workspace-panel--mobile").waitFor({
            state: "visible",
        });
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            draft.name,
        );
        assertEquals(await page.getByRole("alertdialog").count(), 0);

        await page.setViewportSize({ width: 1440, height: 900 });
        await page.locator(".workspace-panel--mobile").waitFor({
            state: "detached",
        });
        assertEquals(
            await page.locator("#app-url-input").inputValue(),
            draft.url,
        );

        // The Dock is hidden while a panel is open; switch with the header tabs.
        await page.getByRole("tab", { name: "便签工作区", exact: true })
            .click();
        await page.locator('.workspace-panel[aria-label="便签工作区"]')
            .waitFor({ state: "visible" });
        assertEquals(await page.getByRole("alertdialog").count(), 0);

        await page.getByRole("tab", { name: "应用工作区", exact: true })
            .click();
        await page.locator("#app-url-input").waitFor({ state: "visible" });
        assertEquals(
            await page.locator("#app-url-input").inputValue(),
            draft.url,
        );
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            draft.name,
        );
        assertEquals(await page.getByRole("alertdialog").count(), 0);

        await page.getByRole("button", {
            name: "收起工作区",
            exact: true,
        }).click();
        const closeDialog = page.getByRole("alertdialog");
        await closeDialog.waitFor({ state: "visible" });
        await closeDialog.getByRole("button", {
            name: "继续编辑",
            exact: true,
        }).click();
        await closeDialog.waitFor({ state: "detached" });
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            draft.name,
        );
        assertEquals(await page.getByRole("alertdialog").count(), 0);
    } finally {
        await fixture.close();
    }
});

Deno.test("workspace close keeps first intent against a competing route leave", async () => {
    const fixture = await startZenAppsFixture("apps_pending_competition");
    const { page, origin } = fixture;
    const draft = {
        url: "https://pending-route.invalid/",
        name: "Pending intent draft",
    };
    const leaveDialog = page.getByRole("alertdialog");
    try {
        await goToSettings(page, origin);
        await goHome(page, origin);
        await openZenAppsForm(page, draft);
        await page.getByRole("button", {
            name: "收起工作区",
            exact: true,
        }).click();
        await leaveDialog.waitFor({ state: "visible" });
        assertEquals(await page.getByRole("alertdialog").count(), 1);

        const competingBack = page.goBack();
        await competingBack;
        await page.waitForURL(origin + "/");
        await leaveDialog.waitFor({ state: "visible" });
        assertEquals(new URL(page.url()).pathname, "/");
        assertEquals(await page.getByRole("alertdialog").count(), 1);
        await leaveDialog.getByRole("button", {
            name: "继续编辑",
            exact: true,
        }).click();
        await leaveDialog.waitFor({ state: "detached" });
        assertEquals(
            await page.locator("#app-url-input").inputValue(),
            draft.url,
        );
        assertEquals(await page.getByRole("alertdialog").count(), 0);

        await page.getByRole("link", { name: "设置", exact: true }).click();
        await leaveDialog.waitFor({ state: "visible" });
        await leaveDialog.getByRole("button", {
            name: "继续编辑",
            exact: true,
        }).click();
        await leaveDialog.waitFor({ state: "detached" });
        assertEquals(new URL(page.url()).pathname, "/");
        assertEquals(await page.getByRole("alertdialog").count(), 0);
    } finally {
        await fixture.close();
    }
});

Deno.test("route leave waits for an Apps form confirmation dialog to close", async () => {
    const fixture = await startZenAppsFixture("apps_form_dialog_competition");
    const { page, origin } = fixture;
    const duplicateUrl = "https://duplicate-route.invalid/";
    const draftName = "Duplicate confirmation draft";
    try {
        await goToSettings(page, origin);
        await goHome(page, origin);
        await page.evaluate(async (url) => {
            const response = await fetch("/api/webapps", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: "Existing duplicate",
                    url,
                    iconSource: "default",
                    openMode: "global",
                    isPinned: false,
                }),
            });
            if (!response.ok) throw new Error(await response.text());
        }, duplicateUrl);
        await page.reload();
        await page.locator("main.home").waitFor({ state: "visible" });
        const appsEdge = page.locator(
            '.zen-edge-btn[data-workspace="apps"]',
        );
        await appsEdge.focus();
        await appsEdge.press("Enter");
        await page.locator('.launcher-app:has-text("Existing duplicate")')
            .waitFor({ state: "visible" });
        await page.getByRole("button", {
            name: "添加应用",
            exact: true,
        }).click();
        await page.locator("#app-url-input").fill(duplicateUrl);
        await page.locator("#app-name-input").fill(draftName);
        await page.getByRole("button", {
            name: "添加应用",
            exact: true,
        }).click();

        const formDialog = page.getByRole("alertdialog");
        await formDialog.getByRole("heading", {
            name: "该应用已存在，仍要继续添加吗？",
            exact: true,
        }).waitFor({ state: "visible" });
        const back = page.goBack();
        await back;
        assertEquals(await page.getByRole("alertdialog").count(), 1);
        await formDialog.getByRole("button", {
            name: "取消",
            exact: true,
        }).click();

        const routeDialog = page.getByRole("alertdialog");
        await routeDialog.getByRole("heading", {
            name: "放弃未保存的应用修改？",
            exact: true,
        }).waitFor({ state: "visible" });
        assertEquals(await page.getByRole("alertdialog").count(), 1);
        await routeDialog.getByRole("button", {
            name: "继续编辑",
            exact: true,
        }).click();
        await page.waitForFunction(() =>
            document.querySelectorAll('[role="alertdialog"]').length === 0
        );
        assertEquals(new URL(page.url()).pathname, "/");
        assertEquals(
            await page.locator("#app-url-input").inputValue(),
            duplicateUrl,
        );
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            draftName,
        );
        assertEquals(await page.getByRole("alertdialog").count(), 0);
    } finally {
        await fixture.close();
    }
});

Deno.test("Apps beforeunload warns only for a dirty active document", async () => {
    const fixture = await startZenAppsFixture("apps_beforeunload");
    const { page, origin } = fixture;
    const dialogTypes: string[] = [];
    const dismissDialog = async (dialog: Dialog) => {
        dialogTypes.push(dialog.type());
        await dialog.dismiss();
    };
    try {
        page.on("dialog", dismissDialog);
        await page.reload();
        await page.locator("main.home").waitFor({ state: "visible" });
        assertEquals(dialogTypes, []);
        page.off("dialog", dismissDialog);

        await openZenAppsForm(page, {
            url: "https://beforeunload-route.invalid/",
            name: "Beforeunload dirty draft",
        });
        const dirtyDialog = page.waitForEvent("dialog", { timeout: 5000 });
        const reload = page.reload({ timeout: 5000 }).catch(() => null);
        const dialog = await dirtyDialog;
        assertEquals(dialog.type(), "beforeunload");
        dialogTypes.push(dialog.type());
        await dialog.dismiss();
        await reload;
        assertEquals(new URL(page.url()).pathname, "/");
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            "Beforeunload dirty draft",
        );
        assertEquals(dialogTypes, ["beforeunload"]);

        await page.getByRole("link", { name: "设置", exact: true }).click();
        const leaveDialog = page.getByRole("alertdialog");
        await leaveDialog.waitFor({ state: "visible" });
        await leaveDialog.getByRole("button", {
            name: "放弃修改",
            exact: true,
        }).click();
        await page.waitForURL(origin + "/settings");
        await leaveDialog.waitFor({ state: "detached" });
        await page.locator("#app-url-input").waitFor({ state: "detached" });
        await page.getByRole("navigation", { name: "设置分类" }).waitFor({
            state: "visible",
        });
        page.on("dialog", dismissDialog);
        await page.reload({ timeout: 5000 });
        await page.getByRole("navigation", { name: "设置分类" }).waitFor({
            state: "visible",
        });
        assertEquals(dialogTypes, ["beforeunload"]);
    } finally {
        page.off("dialog", dismissDialog);
        await fixture.close();
    }
});

Deno.test("Apps route leave is refused while the new-app save is pending", async () => {
    const fixture = await startZenAppsFixture("apps_pending_save");
    const { page } = fixture;
    const draft = {
        url: "https://pending-save.invalid/",
        name: "Saving Apps draft",
    };
    let releaseSave: () => void = () => {};
    const saveGate = new Promise<void>((resolve) => {
        releaseSave = resolve;
    });
    let notifyPostStarted: () => void = () => {};
    const postStarted = new Promise<void>((resolve) => {
        notifyPostStarted = resolve;
    });
    try {
        await openZenAppsForm(page, draft);
        await page.route("**/api/webapps", async (route) => {
            if (route.request().method() === "POST") {
                notifyPostStarted();
                await saveGate;
            }
            await route.continue();
        });
        const saveResponse = page.waitForResponse((response) =>
            response.url().endsWith("/api/webapps") &&
            response.request().method() === "POST"
        );
        await page.getByRole("button", {
            name: "添加应用",
            exact: true,
        }).click();
        await postStarted;
        await page.getByRole("button", {
            name: "保存中…",
            exact: true,
        }).waitFor({ state: "visible" });
        await page.getByRole("link", { name: "设置", exact: true }).click();
        assertEquals(new URL(page.url()).pathname, "/");
        assertEquals(await page.getByRole("alertdialog").count(), 0);
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            draft.name,
        );

        releaseSave();
        assertEquals((await saveResponse).ok(), true);
        await page.locator("#app-url-input").waitFor({ state: "detached" });
        assertEquals(new URL(page.url()).pathname, "/");
        assertEquals(await page.getByRole("alertdialog").count(), 0);
    } finally {
        releaseSave();
        await page.unroute("**/api/webapps");
        await fixture.close();
    }
});

Deno.test("apps creation returns before icon fetch and missing icons can be retried", async () => {
    const fixture = await startZenAppsFixture("apps_icon_backfill");
    const { page } = fixture;
    let attempts = 0;
    let created: Record<string, unknown> = {};
    const gate = Promise.withResolvers<void>();
    try {
        await page.route(
            "**/api/webapp-icons/real-icon",
            (route) =>
                route.fulfill({
                    contentType: "image/svg+xml",
                    body:
                        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="14"/></svg>',
                }),
        );
        await page.route("**/api/webapps", async (route) => {
            const response = await route.fetch();
            if (route.request().method() === "POST") {
                created = (await response.json()).data;
            }
            await route.fulfill({ response });
        });
        await page.route(
            "**/api/webapp-icons/fetch",
            (route) =>
                route.fulfill({
                    status: 400,
                    json: { status: false, message: "Unavailable" },
                }),
        );
        await page.route("**/api/webapps/*/fetch-icon", async (route) => {
            attempts++;
            if (attempts === 1) {
                await gate.promise;
                await route.fulfill({
                    status: 400,
                    json: { status: false, message: "Unavailable" },
                });
                return;
            }
            await route.fulfill({
                json: {
                    status: true,
                    data: {
                        ...created,
                        iconAssetId: "real-icon",
                        iconSource: "website",
                    },
                },
            });
        });
        await openZenAppsForm(page, {
            url: "https://icons.invalid",
            name: "自动图标契约",
        });
        await page.locator('.app-dialog-form button[type="submit"]').click();
        await page.locator(".apps-workspace-root").waitFor({
            state: "visible",
        });
        await page.getByRole("status").filter({ hasText: "正在补全图标" })
            .waitFor();
        assertEquals(attempts, 1);
        gate.resolve();
        await page.getByRole("status").filter({ hasText: "1 个失败" })
            .waitFor();
        await page.getByRole("button", { name: "补全图标", exact: true })
            .click();
        await page.locator('img[src="/api/webapp-icons/real-icon"]').first()
            .waitFor({ state: "attached" });
        assertEquals(attempts, 2);
    } finally {
        gate.resolve();
        await fixture.close();
    }
});
