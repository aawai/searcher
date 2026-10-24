import { assert, assertEquals } from "@std/assert";
import { Buffer } from "node:buffer";
import { type Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { startProductionApp } from "./helpers/production-app.ts";

/** The dialog footer stays inside the dialog and the viewport at every size. */
async function footerVisible(page: Page) {
    const geometry = await page.locator(".app-dialog-footer").evaluate(
        (footer) => {
            const r = footer.getBoundingClientRect();
            const dialog = footer.closest(".app-form-dialog")!
                .getBoundingClientRect();
            return {
                top: r.top,
                bottom: r.bottom,
                height: r.height,
                dialogTop: dialog.top,
                dialogBottom: dialog.bottom,
                viewportHeight: innerHeight,
            };
        },
    );
    assert(
        geometry.height > 0 && geometry.top >= geometry.dialogTop &&
            geometry.bottom <= geometry.dialogBottom + 1 &&
            geometry.bottom <= geometry.viewportHeight + 1,
        JSON.stringify(geometry),
    );
}

Deno.test("app form dialog session and icon contracts on home #141 #244", async (t) => {
    const app = await startProductionApp();
    const browser = await chromium.launch({
        handleSIGTERM: false,
        args: ["--no-sandbox"],
    });
    try {
        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
            hasTouch: true,
        });
        const page = await context.newPage();
        await page.goto(app.origin + "/register");
        await page.locator("#auth-username").fill("apps_interactions");
        await page.locator("#auth-display-name").fill("Apps tester");
        await page.locator("#auth-password").fill(
            "Apps-contract-password-141!",
        );
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(app.origin + "/");
        const folderName =
            "长文件夹名称用于检查标题换行与计数只展示一次以及添加入口始终可达";
        const appName = "同名应用——长名称展示及编辑会话验证";
        const created = await page.request.post(
            app.origin + "/api/webapp-groups",
            {
                headers: { Origin: app.origin },
                data: { name: folderName, sortOrder: 0 },
            },
        );
        assertEquals(created.status(), 200);
        await page.reload();
        const dialog = page.locator(".app-form-dialog");
        const popup = page.locator(".launcher-popup");

        if (
            !await t.step(
                "folder add opens the form in the folder; draft fields, icon input and real upload survive resizes",
                async () => {
                    await page.getByRole("button", {
                        name: new RegExp(`打开文件夹 ${folderName}`),
                    }).click();
                    await popup.getByRole("heading", {
                        name: folderName,
                        exact: true,
                    }).waitFor();
                    await popup.getByRole("button", {
                        name: `添加应用到 ${folderName}`,
                        exact: true,
                    }).click();
                    await dialog.getByRole("heading", {
                        name: "添加应用",
                        exact: true,
                    }).waitFor();
                    assertEquals(
                        await page.locator("#app-group-select option:checked")
                            .textContent(),
                        folderName,
                    );
                    await page.locator("#app-url-input").fill(
                        "https://draft.invalid/",
                    );
                    await page.locator("#app-name-input").fill(appName);
                    await page.getByRole("tab", {
                        name: "新标签页",
                        exact: true,
                    }).click();
                    await page.getByRole("button", {
                        name: "更换图标",
                        exact: true,
                    }).click();
                    await page.getByRole("tab", {
                        name: "网络图片",
                        exact: true,
                    }).click();
                    await page.locator(
                        'input[placeholder="https://example.com/icon.png"]',
                    ).fill("https://pending.invalid/icon.png");
                    const group = await page.locator("#app-group-select")
                        .inputValue();
                    for (
                        const width of [
                            767,
                            768,
                            767,
                            1023,
                            1024,
                            1023,
                            1440,
                            390,
                            1440,
                        ]
                    ) {
                        await page.setViewportSize({
                            width,
                            height: width === 390 ? 640 : 900,
                        });
                        await page.locator("#app-url-input").waitFor({
                            state: "visible",
                        });
                        assertEquals(
                            await page.locator("#app-url-input").inputValue(),
                            "https://draft.invalid/",
                        );
                        assertEquals(
                            await page.locator("#app-name-input").inputValue(),
                            appName,
                        );
                        assertEquals(
                            await page.locator("#app-group-select")
                                .inputValue(),
                            group,
                        );
                        assertEquals(
                            await page.getByRole("tab", {
                                name: "新标签页",
                                exact: true,
                            }).getAttribute("aria-selected"),
                            "true",
                        );
                        assertEquals(
                            await page.locator(
                                'input[placeholder="https://example.com/icon.png"]',
                            ).inputValue(),
                            "https://pending.invalid/icon.png",
                        );
                        await footerVisible(page);
                    }
                    await page.getByRole("button", {
                        name: "收起图标设置",
                        exact: true,
                    }).click();
                    await footerVisible(page);
                    await page.getByRole("button", {
                        name: "更换图标",
                        exact: true,
                    }).click();
                    assertEquals(
                        await page.locator(
                            'input[placeholder="https://example.com/icon.png"]',
                        ).inputValue(),
                        "https://pending.invalid/icon.png",
                    );
                    await page.getByRole("tab", {
                        name: "上传图片",
                        exact: true,
                    }).click();
                    const upload = Promise.withResolvers<void>();
                    let uploads = 0;
                    await page.route(
                        "**/api/webapp-icons/upload",
                        async (route) => {
                            uploads++;
                            await upload.promise;
                            await route.continue();
                        },
                    );
                    const requested = page.waitForRequest(
                        "**/api/webapp-icons/upload",
                    );
                    await page.locator('input[type="file"]').setInputFiles({
                        name: "real-icon.svg",
                        mimeType: "image/svg+xml",
                        buffer: Buffer.from(
                            '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>',
                        ),
                    });
                    await requested;
                    await page.setViewportSize({ width: 390, height: 640 });
                    await page.getByText("正在上传…", { exact: true })
                        .waitFor();
                    upload.resolve();
                    await page.locator(".app-dialog-source-badge").filter({
                        hasText: "本地上传",
                    }).waitFor();
                    assertEquals(uploads, 1);
                    await page.unroute("**/api/webapp-icons/upload");
                    const save = Promise.withResolvers<void>();
                    let saves = 0;
                    await page.route("**/api/webapps", async (route) => {
                        if (route.request().method() === "POST") {
                            saves++;
                            await save.promise;
                        }
                        await route.continue();
                    });
                    const saveRequest = page.waitForRequest((request) =>
                        request.url().endsWith("/api/webapps") &&
                        request.method() === "POST"
                    );
                    await dialog.getByRole("button", {
                        name: "添加应用",
                        exact: true,
                    }).click();
                    await saveRequest;
                    await page.setViewportSize({ width: 1440, height: 900 });
                    await page.getByRole("button", {
                        name: "保存中…",
                        exact: true,
                    }).waitFor();
                    save.resolve();
                    await dialog.waitFor({ state: "detached" });
                    assertEquals(saves, 1);
                    await page.unroute("**/api/webapps");
                    // Saving returns to the folder popup that opened the form.
                    await popup.getByRole("heading", {
                        name: folderName,
                        exact: true,
                    }).waitFor();
                    await popup.getByRole("button", {
                        name: `打开 ${appName}`,
                        exact: true,
                    }).waitFor();
                },
            )
        ) return;

        await t.step(
            "icon shortcut versus normal edit, and dirty-edit Escape layering",
            async () => {
                const tile = popup.locator(".launcher-app", {
                    hasText: appName,
                });
                await context.route(
                    "https://draft.invalid/",
                    (route) =>
                        route.fulfill({
                            contentType: "text/html",
                            body: "<title>Opened application</title>",
                        }),
                );
                const opened = context.waitForEvent("page");
                await popup.getByRole("button", {
                    name: `打开 ${appName}`,
                    exact: true,
                }).click();
                const destination = await opened;
                await destination.waitForURL("https://draft.invalid/");
                assertEquals(destination.url(), "https://draft.invalid/");
                await destination.close();
                await context.unroute("https://draft.invalid/");

                await tile.click({ button: "right" });
                await page.getByRole("menuitem", {
                    name: "更换图标",
                    exact: true,
                }).click();
                await page.getByRole("button", {
                    name: "收起图标设置",
                    exact: true,
                }).waitFor();
                // A clean form closes without asking.
                await dialog.getByRole("button", {
                    name: "取消",
                    exact: true,
                }).click();
                await dialog.waitFor({ state: "detached" });
                assertEquals(await page.getByRole("alertdialog").count(), 0);

                await tile.click({ button: "right" });
                await page.getByRole("menuitem", {
                    name: "编辑",
                    exact: true,
                }).click();
                await dialog.getByRole("heading", {
                    name: "编辑应用",
                    exact: true,
                }).waitFor();
                await page.getByRole("button", {
                    name: "更换图标",
                    exact: true,
                }).waitFor();
                await page.locator("#app-name-input").fill(
                    "编辑中的未保存草稿",
                );
                await page.setViewportSize({ width: 390, height: 844 });
                await page.locator("#app-name-input").waitFor({
                    state: "visible",
                });
                assertEquals(
                    await page.locator("#app-name-input").inputValue(),
                    "编辑中的未保存草稿",
                );
                await page.locator("#app-name-input").press("Escape");
                await page.getByRole("alertdialog").waitFor();
                // The dialog can mount before Base UI hands it focus; wait so Escape targets it.
                await page.waitForFunction(() =>
                    document.querySelector('[role="alertdialog"]')
                        ?.contains(document.activeElement) === true
                );
                await page.keyboard.press("Escape");
                await page.getByRole("alertdialog").waitFor({
                    state: "detached",
                });
                assertEquals(
                    await page.locator("#app-name-input").inputValue(),
                    "编辑中的未保存草稿",
                );
                await dialog.getByRole("button", {
                    name: "取消",
                    exact: true,
                }).click();
                await page.getByRole("button", {
                    name: "放弃修改",
                    exact: true,
                }).click();
                await dialog.waitFor({ state: "detached" });
                await tile.waitFor();
                assertEquals(
                    await tile.locator(".webapp-name").textContent(),
                    appName,
                );
            },
        );
    } finally {
        await browser.close();
        await app.close();
    }
});
