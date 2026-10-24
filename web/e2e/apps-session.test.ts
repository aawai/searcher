import { assertEquals } from "@std/assert";
import { chromium, type Dialog, type Page } from "playwright";
import { startProductionApp } from "./helpers/production-app.ts";

const PASSWORD = "Apps-route-guard-password-174!";

interface Seed {
    apps?: Array<{ name: string; url: string }>;
    folders?: string[];
}

async function startFixture(username: string, seed: Seed = {}) {
    const app = await startProductionApp();
    const browser = await chromium.launch({
        handleSIGTERM: false,
        args: ["--no-sandbox"],
    });
    try {
        const page = await browser.newPage({
            viewport: { width: 1440, height: 900 },
        });
        // Session tests do not depend on real websites. The dedicated backfill
        // case below overrides this route with controlled success/failure.
        await page.route(
            "**/api/webapps/*/fetch-icon",
            (route) => route.abort(),
        );
        await page.goto(app.origin + "/register");
        await page.locator("#auth-username").fill(username);
        await page.locator("#auth-display-name").fill("Route guard tester");
        await page.locator("#auth-password").fill(PASSWORD);
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(app.origin + "/");
        await page.locator("main.home").waitFor({ state: "visible" });
        if (seed.apps?.length || seed.folders?.length) {
            await page.evaluate(async (seed) => {
                for (const [index, name] of (seed.folders ?? []).entries()) {
                    const response = await fetch("/api/webapp-groups", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name, sortOrder: index }),
                    });
                    if (!response.ok) throw new Error(await response.text());
                }
                for (const item of seed.apps ?? []) {
                    const response = await fetch("/api/webapps", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            ...item,
                            iconSource: "default",
                            openMode: "global",
                        }),
                    });
                    if (!response.ok) throw new Error(await response.text());
                }
            }, seed);
            await page.reload();
            await page.locator("main.home").waitFor({ state: "visible" });
        }
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

/** Opens the add-app dialog from the home `+` cell and optionally types a draft. */
async function openAddForm(
    page: Page,
    draft?: { url?: string; name?: string },
) {
    await page.locator('[data-library-cell="add"]').click();
    await page.locator(".app-form-dialog #app-url-input").waitFor({
        state: "visible",
    });
    if (draft?.url !== undefined) {
        await page.locator("#app-url-input").fill(draft.url);
    }
    if (draft?.name !== undefined) {
        await page.locator("#app-name-input").fill(draft.name);
    }
}

async function goToSettings(page: Page, origin: string) {
    await page.getByRole("button", { name: /^用户菜单/ }).click();
    await page.getByRole("menuitem", { name: "偏好设置", exact: true })
        .click();
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

/** Settings → home, so the history has an entry to go Back to. */
async function startWithHistory(username: string, seed?: Seed) {
    const fixture = await startFixture(username, seed);
    await goToSettings(fixture.page, fixture.origin);
    await goHome(fixture.page, fixture.origin);
    return fixture;
}

const LEAVE_TITLE = "放弃未保存的应用修改？";

Deno.test("app edit dialog keeps every field and its confirmations across viewport changes", async () => {
    const fixture = await startFixture("apps_session", {
        apps: [{ name: "编辑目标", url: "https://original.invalid/" }],
        folders: ["编辑目标文件夹"],
    });
    const { page } = fixture;
    const dialog = page.locator(".app-form-dialog");
    const alert = page.getByRole("alertdialog");
    const iconUrl = page.locator(
        'input[placeholder="https://example.com/icon.png"]',
    );
    try {
        await page.locator('.launcher-app:has-text("编辑目标")').click({
            button: "right",
        });
        await page.getByRole("menuitem", { name: "编辑", exact: true }).click();
        await dialog.getByRole("heading", { name: "编辑应用", exact: true })
            .waitFor();
        await page.locator("#app-url-input").fill("https://edited.invalid/");
        await page.locator("#app-name-input").fill("编辑中的全部字段");
        await page.locator("#app-group-select").selectOption({
            label: "编辑目标文件夹",
        });
        await page.getByRole("tab", { name: "新标签页", exact: true }).click();
        await page.getByRole("button", { name: "更换图标", exact: true })
            .click();
        await page.getByRole("tab", { name: "网络图片", exact: true }).click();
        await iconUrl.fill("https://unsubmitted.invalid/icon.png");
        await page.getByRole("button", { name: "保存修改", exact: true })
            .click();
        await alert.waitFor();
        for (
            const width of [767, 768, 767, 1023, 1024, 1023, 1440, 390, 1440]
        ) {
            await page.setViewportSize({ width, height: 900 });
            await alert.waitFor();
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
                await page.getByRole("tab", {
                    name: "新标签页",
                    exact: true,
                    includeHidden: true,
                }).getAttribute("aria-selected"),
                "true",
            );
            assertEquals(
                await iconUrl.inputValue(),
                "https://unsubmitted.invalid/icon.png",
            );
        }
        // Escape closes the innermost confirmation only; the form stays.
        await page.keyboard.press("Escape");
        await alert.waitFor({ state: "detached" });
        assertEquals(await dialog.count(), 1);
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            "编辑中的全部字段",
        );

        // Escape on the dirty form asks before discarding.
        await page.keyboard.press("Escape");
        await alert.getByRole("heading", { name: LEAVE_TITLE, exact: true })
            .waitFor();
        await alert.getByRole("button", { name: "继续编辑", exact: true })
            .click();
        await alert.waitFor({ state: "detached" });
        assertEquals(
            await page.locator("#app-url-input").inputValue(),
            "https://edited.invalid/",
        );
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            "编辑中的全部字段",
        );

        await dialog.getByRole("button", { name: "取消", exact: true })
            .click();
        await alert.getByRole("heading", { name: LEAVE_TITLE, exact: true })
            .waitFor();
        await alert.getByRole("button", { name: "放弃修改", exact: true })
            .click();
        await dialog.waitFor({ state: "detached" });
        await page.locator('.launcher-app:has-text("编辑目标")').waitFor();
        // Nothing was saved.
        const saved = await page.request.get(fixture.origin + "/api/webapps");
        assertEquals(
            (await saved.json()).data.map((item: { url: string }) => item.url),
            ["https://original.invalid/"],
        );
    } finally {
        await fixture.close();
    }
});

Deno.test("dirty app drafts block browser Back and Forward until confirmed", async () => {
    const fixture = await startWithHistory("apps_back_forward");
    const { page, origin } = fixture;
    const leaveDialog = page.getByRole("alertdialog");
    try {
        const backDraft = {
            url: "https://back-route.invalid/",
            name: "Back navigation draft",
        };
        await openAddForm(page, backDraft);

        const cancelledBack = page.goBack();
        await leaveDialog.waitFor({ state: "visible" });
        await leaveDialog.getByRole("heading", {
            name: LEAVE_TITLE,
            exact: true,
        }).waitFor();
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
        await page.getByRole("navigation", { name: "设置分类" }).waitFor({
            state: "visible",
        });

        await page.goForward();
        await page.waitForURL(origin + "/");
        await page.locator("main.home").waitFor({ state: "visible" });
        assertEquals(await page.locator(".app-form-dialog").count(), 0);
        await goToSettings(page, origin);
        const cleanBack = page.goBack();
        await page.waitForURL(origin + "/");
        await cleanBack;

        const forwardDraft = {
            url: "https://forward-route.invalid/",
            name: "Forward navigation draft",
        };
        await openAddForm(page, forwardDraft);
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

Deno.test("clean app form closes without confirmation and Back leaves without one", async () => {
    const fixture = await startWithHistory("apps_clean_route");
    const { page, origin } = fixture;
    try {
        await openAddForm(page);
        await page.keyboard.press("Escape");
        await page.locator(".app-form-dialog").waitFor({ state: "detached" });
        assertEquals(await page.getByRole("alertdialog").count(), 0);

        await openAddForm(page);
        await page.locator(".app-form-dialog").getByRole("button", {
            name: "取消",
            exact: true,
        }).click();
        await page.locator(".app-form-dialog").waitFor({ state: "detached" });
        assertEquals(await page.getByRole("alertdialog").count(), 0);

        await openAddForm(page);
        await page.goBack();
        await page.waitForURL(origin + "/settings");
        assertEquals(await page.getByRole("alertdialog").count(), 0);
    } finally {
        await fixture.close();
    }
});

Deno.test("a form close confirmation keeps its intent against a competing route leave", async () => {
    const fixture = await startWithHistory("apps_pending_competition");
    const { page } = fixture;
    const draft = {
        url: "https://pending-route.invalid/",
        name: "Pending intent draft",
    };
    const leaveDialog = page.getByRole("alertdialog");
    try {
        await openAddForm(page, draft);
        await page.locator(".app-form-dialog").getByRole("button", {
            name: "取消",
            exact: true,
        }).click();
        await leaveDialog.getByRole("heading", {
            name: LEAVE_TITLE,
            exact: true,
        }).waitFor();
        assertEquals(await page.getByRole("alertdialog").count(), 1);

        await page.goBack();
        await page.waitForURL((url) => url.pathname === "/");
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
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            draft.name,
        );
        assertEquals(await page.getByRole("alertdialog").count(), 0);

        // The close intent is still answerable after the competing leave.
        await page.locator(".app-form-dialog").getByRole("button", {
            name: "取消",
            exact: true,
        }).click();
        await leaveDialog.getByRole("button", {
            name: "放弃修改",
            exact: true,
        }).click();
        await page.locator(".app-form-dialog").waitFor({ state: "detached" });
        assertEquals(new URL(page.url()).pathname, "/");
    } finally {
        await fixture.close();
    }
});

Deno.test("route leave waits for an app form confirmation dialog to close", async () => {
    const duplicateUrl = "https://duplicate-route.invalid/";
    const draftName = "Duplicate confirmation draft";
    const fixture = await startWithHistory("apps_form_dialog_competition", {
        apps: [{ name: "Existing duplicate", url: duplicateUrl }],
    });
    const { page } = fixture;
    try {
        await page.locator('.launcher-app:has-text("Existing duplicate")')
            .waitFor({ state: "visible" });
        await openAddForm(page, { url: duplicateUrl, name: draftName });
        await page.locator(".app-form-dialog").getByRole("button", {
            name: "添加应用",
            exact: true,
        }).click();

        const formDialog = page.getByRole("alertdialog");
        await formDialog.getByRole("heading", {
            name: "该应用已存在，仍要继续添加吗？",
            exact: true,
        }).waitFor({ state: "visible" });
        await page.goBack();
        assertEquals(await page.getByRole("alertdialog").count(), 1);
        await formDialog.getByRole("button", {
            name: "取消",
            exact: true,
        }).click();

        const routeDialog = page.getByRole("alertdialog");
        await routeDialog.getByRole("heading", {
            name: LEAVE_TITLE,
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

Deno.test("app form beforeunload warns only for a dirty form", async () => {
    const fixture = await startWithHistory("apps_beforeunload");
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

        await openAddForm(page, {
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

        await page.goBack();
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

Deno.test("app form refuses route leave and Escape while the new-app save is pending", async () => {
    const fixture = await startWithHistory("apps_pending_save");
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
        await openAddForm(page, draft);
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
        await page.locator(".app-form-dialog").getByRole("button", {
            name: "添加应用",
            exact: true,
        }).click();
        await postStarted;
        await page.getByRole("button", {
            name: "保存中…",
            exact: true,
        }).waitFor({ state: "visible" });
        await page.goBack();
        await page.keyboard.press("Escape");
        await page.waitForURL((url) => url.pathname === "/");
        assertEquals(await page.getByRole("alertdialog").count(), 0);
        assertEquals(await page.locator(".app-form-dialog").count(), 1);
        assertEquals(
            await page.locator("#app-name-input").inputValue(),
            draft.name,
        );

        releaseSave();
        assertEquals((await saveResponse).ok(), true);
        await page.locator("#app-url-input").waitFor({ state: "detached" });
        assertEquals(new URL(page.url()).pathname, "/");
        assertEquals(await page.getByRole("alertdialog").count(), 0);
        await page.locator('.launcher-app:has-text("Saving Apps draft")')
            .waitFor();
    } finally {
        releaseSave();
        await page.unroute("**/api/webapps");
        await fixture.close();
    }
});

Deno.test("app creation returns before icon fetch and missing icons can be retried", async () => {
    const fixture = await startFixture("apps_icon_backfill");
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
        await openAddForm(page, {
            url: "https://icons.invalid",
            name: "自动图标契约",
        });
        await page.locator('.app-dialog-form button[type="submit"]').click();
        // The dialog closes and the tile appears while the icon request is
        // still held, so creation did not wait for it.
        await page.locator(".app-form-dialog").waitFor({ state: "detached" });
        await page.locator('.launcher-app:has-text("自动图标契约")').waitFor();
        // Backfill progress is shown while arranging the library.
        await page.getByRole("group", { name: "应用库空白区域" }).focus();
        await page.keyboard.press("Shift+F10");
        await page.getByRole("menuitem", { name: "整理布局", exact: true })
            .click();
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
