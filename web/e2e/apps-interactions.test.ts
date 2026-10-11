import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { Buffer } from "node:buffer";
import { chromium, type Page } from "playwright";
import { startProductionApp } from "./helpers/production-app.ts";

async function footerVisible(page: Page) {
    const geometry = await page.locator(".app-dialog-footer").evaluate(
        (footer) => {
            const r = footer.getBoundingClientRect();
            const panel = footer.closest(".workspace-panel, .desktop-window")!
                .getBoundingClientRect();
            const body = footer.closest(".workspace-body")!;
            return {
                top: r.top,
                bottom: r.bottom,
                panelBottom: panel.bottom,
                bodyScroll: body.scrollTop,
                height: r.height,
            };
        },
    );
    assert(
        geometry.height > 0 && geometry.top >= 0 &&
            geometry.bottom <= geometry.panelBottom + 1,
    );
    assertEquals(geometry.bodyScroll, 0);
}

Deno.test("apps session, modal undo and visible management contracts #141", async (t) => {
    const app = await startProductionApp();
    const browser = await chromium.launch({ args: ["--no-sandbox"] });
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
        await page.locator('[data-workspace="apps"]').click();
        const root = page.locator(".apps-workspace-root");
        const search = page.getByRole("searchbox", {
            name: "搜索应用",
            exact: true,
        });
        const folderName =
            "长文件夹名称用于检查标题换行与计数只展示一次以及更多操作入口始终可达";

        if (
            !await t.step(
                "visible folder creation, arranging exit and layered Escape",
                async () => {
                    await page.getByRole("button", {
                        name: "应用更多操作",
                        exact: true,
                    }).click();
                    await page.getByRole("menuitem", {
                        name: "新建文件夹",
                        exact: true,
                    }).click();
                    await page.locator("#folder-name-input").fill(folderName);
                    await page.getByRole("button", {
                        name: "创建",
                        exact: true,
                    }).click();
                    await root.getByRole("button", {
                        name: new RegExp(`打开文件夹 ${folderName}`),
                    }).click();
                    assertEquals(
                        await root.getByRole("heading", {
                            name: folderName,
                            exact: true,
                        }).count(),
                        1,
                    );
                    await search.fill("IME 草稿");
                    await search.dispatchEvent("keydown", {
                        key: "Escape",
                        isComposing: true,
                        bubbles: true,
                    });
                    assertEquals(await search.inputValue(), "IME 草稿");
                    await search.fill(" ");
                    await search.press("Escape");
                    assertEquals(await search.inputValue(), "");
                    assertEquals(
                        await root.getByRole("heading", {
                            name: folderName,
                            exact: true,
                        }).count(),
                        1,
                    );
                    await page.getByRole("button", {
                        name: "应用更多操作",
                        exact: true,
                    }).click();
                    await page.getByRole("menu", {
                        name: "应用更多操作",
                        exact: true,
                    }).waitFor();
                    await page.keyboard.press("Escape");
                    await page.locator('[data-slot="dropdown-menu-content"]')
                        .waitFor({ state: "detached" });
                    assertEquals(
                        await root.getByRole("heading", {
                            name: folderName,
                            exact: true,
                        }).count(),
                        1,
                    );
                    await search.press("Escape");
                    await root.getByRole("heading", {
                        name: "全部应用",
                        exact: true,
                    }).waitFor();
                    await page.waitForFunction(
                        (name) =>
                            document.activeElement?.getAttribute("aria-label")
                                ?.includes(name),
                        folderName,
                    );
                    assertStringIncludes(
                        await page.evaluate(() =>
                            document.activeElement?.getAttribute(
                                "aria-label",
                            ) ?? ""
                        ),
                        folderName,
                    );
                    await page.getByRole("button", {
                        name: "应用更多操作",
                        exact: true,
                    }).click();
                    await page.getByRole("menuitem", {
                        name: "整理布局",
                        exact: true,
                    }).click();
                    assertEquals(await search.isDisabled(), true);
                    await page.getByRole("button", {
                        name: "完成整理",
                        exact: true,
                    }).click();
                    assertEquals(await search.isDisabled(), false);
                    await page.setViewportSize({ width: 390, height: 844 });
                    await page.locator(".workspace-panel--mobile").waitFor();
                    await page.getByRole("button", {
                        name: "应用更多操作",
                        exact: true,
                    }).click();
                    await page.getByRole("menu").waitFor();
                    await page.keyboard.press("Escape");
                    await page.getByRole("menu").waitFor({ state: "detached" });
                    assertEquals(
                        await page.locator(".workspace-panel--mobile").count(),
                        1,
                    );
                    await page.setViewportSize({ width: 1440, height: 900 });
                },
            )
        ) return;

        if (
            !await t.step(
                "all draft fields, icon input and real upload survive host replacement",
                async () => {
                    await root.getByRole("button", {
                        name: new RegExp(`打开文件夹 ${folderName}`),
                    }).click();
                    await page.getByRole("button", {
                        name: "添加应用",
                        exact: true,
                    }).click();
                    await page.locator("#app-url-input").fill(
                        "https://draft.invalid/",
                    );
                    await page.locator("#app-name-input").fill(
                        "同名应用——长名称展示及编辑会话验证",
                    );
                    await page.getByRole("switch", {
                        name: "固定到首页",
                        exact: true,
                    }).click();
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
                            "同名应用——长名称展示及编辑会话验证",
                        );
                        assertEquals(
                            await page.locator("#app-group-select")
                                .inputValue(),
                            group,
                        );
                        assertEquals(
                            await page.getByRole("switch", {
                                name: "固定到首页",
                                exact: true,
                            }).getAttribute("aria-checked"),
                            "true",
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
                    await page.getByRole("button", {
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
                    await root.waitFor();
                    assertEquals(saves, 1);
                    await page.unroute("**/api/webapps");
                    await root.getByRole("heading", {
                        name: folderName,
                        exact: true,
                    }).waitFor();
                },
            )
        ) return;

        if (
            !await t.step(
                "cross-folder search context and icon shortcut versus normal edit",
                async () => {
                    await search.fill("同名应用");
                    const row = root.locator(".apps-search-row");
                    assertStringIncludes(
                        await row.innerText(),
                        "draft.invalid",
                    );
                    assertStringIncludes(await row.innerText(), folderName);
                    await context.route(
                        "https://draft.invalid/",
                        (route) =>
                            route.fulfill({
                                contentType: "text/html",
                                body: "<title>Opened application</title>",
                            }),
                    );
                    const opened = context.waitForEvent("page");
                    await row.getByRole("button", { name: /^打开 / }).click();
                    const destination = await opened;
                    await destination.waitForURL("https://draft.invalid/");
                    assertEquals(destination.url(), "https://draft.invalid/");
                    await destination.close();
                    await context.unroute("https://draft.invalid/");
                    await row.getByRole("button", { name: /的更多操作/ })
                        .click();
                    await page.getByRole("menuitem", {
                        name: "更换图标",
                        exact: true,
                    }).click();
                    await page.getByRole("button", {
                        name: "收起图标设置",
                        exact: true,
                    }).waitFor();
                    await page.getByRole("button", {
                        name: "取消",
                        exact: true,
                    }).click();
                    await row.getByRole("button", { name: /的更多操作/ })
                        .click();
                    await page.getByRole("menuitem", {
                        name: "编辑",
                        exact: true,
                    }).click();
                    await page.getByRole("button", {
                        name: "更换图标",
                        exact: true,
                    }).waitFor();
                    await page.locator("#app-name-input").fill(
                        "编辑中的未保存草稿",
                    );
                    await page.setViewportSize({ width: 390, height: 844 });
                    const mobileName = page.locator(
                        '.workspace-panel[data-presentation="sheet"] #app-name-input',
                    );
                    await mobileName.waitFor({ state: "visible" });
                    assertEquals(
                        await mobileName.inputValue(),
                        "编辑中的未保存草稿",
                    );
                    await mobileName.press("Escape");
                    await page.getByRole("alertdialog").waitFor();
                    await page.keyboard.press("Escape");
                    await page.getByRole("alertdialog").waitFor({
                        state: "detached",
                    });
                    assertEquals(
                        await page.locator("#app-name-input").inputValue(),
                        "编辑中的未保存草稿",
                    );
                    await page.getByRole("button", {
                        name: "取消",
                        exact: true,
                    }).click();
                    await page.getByRole("button", {
                        name: "放弃修改",
                        exact: true,
                    }).click();
                    await row.waitFor();
                },
            )
        ) return;

        await t.step(
            "mobile modal undo is a visible, hittable normal layout row",
            async () => {
                for (const height of [640, 844]) {
                    await page.setViewportSize({ width: 390, height });
                    await root.locator(".apps-search-row").getByRole("button", {
                        name: /的更多操作/,
                    }).click();
                    await page.getByRole("menuitem", {
                        name: "删除",
                        exact: true,
                    }).click();
                    const undo = page.locator(
                        ".workspace-panel--mobile .undo-toast",
                    ).getByRole("button", { name: "撤销", exact: true });
                    await undo.waitFor({ state: "visible" });
                    assertEquals(await page.locator(".undo-toast").count(), 1);
                    assertEquals(
                        await undo.evaluate((button) => {
                            const r = button.getBoundingClientRect();
                            return button.contains(
                                document.elementFromPoint(
                                    r.x + r.width / 2,
                                    r.y + r.height / 2,
                                ),
                            );
                        }),
                        true,
                    );
                    if (height === 640) await undo.click();
                    else {
                        await undo.focus();
                        await undo.press("Space");
                    }
                    await root.locator(".apps-search-row").waitFor();
                }
            },
        );
        await t.step(
            "moving undo between modal and global hosts preserves its deadline",
            async () => {
                await page.clock.install();
                await root.locator(".apps-search-row").getByRole("button", {
                    name: /的更多操作/,
                }).click();
                await page.getByRole("menuitem", { name: "删除", exact: true })
                    .click();
                const toast = page.locator(".undo-toast");
                await toast.waitFor();
                await page.clock.pauseAt(
                    new Date(await page.evaluate(() => Date.now())),
                );
                const liveRegion = await toast.elementHandle();
                await page.clock.fastForward(3000);
                await page.getByRole("button", {
                    name: "收起工作区",
                    exact: true,
                }).click();
                await page.clock.runFor(300);
                await page.locator(".workspace-panel--mobile").waitFor({
                    state: "detached",
                });
                assertEquals(
                    await toast.evaluate(
                        (element, original) => element === original,
                        liveRegion,
                    ),
                    true,
                );
                await page.locator('#root [data-workspace="apps"]:visible')
                    .click();
                await page.clock.runFor(300);
                await page.locator(".workspace-panel--mobile .undo-toast")
                    .waitFor();
                assertEquals(
                    await toast.evaluate(
                        (element, original) => element === original,
                        liveRegion,
                    ),
                    true,
                );
                await page.clock.runFor(1500);
                await toast.waitFor({ state: "detached" });
                await liveRegion?.dispose();
            },
        );
        await t.step(
            "restore failure remains inside the active modal and never restores falsely",
            async () => {
                await page.clock.resume();
                const created = await page.request.post(
                    app.origin + "/api/webapps",
                    {
                        headers: { Origin: app.origin },
                        data: {
                            name: "恢复错误检查",
                            url: "https://restore-error.invalid/",
                        },
                    },
                );
                assertEquals(created.status(), 200);
                await page.reload();
                await page.locator('#root [data-workspace="apps"]:visible')
                    .click();
                await search.fill("恢复错误检查");
                await root.locator(".apps-search-row").getByRole("button", {
                    name: /的更多操作/,
                }).click();
                await page.getByRole("menuitem", { name: "删除", exact: true })
                    .click();
                await page.route(
                    "**/api/webapps/*/restore",
                    (route) =>
                        route.fulfill({
                            status: 503,
                            json: {
                                status: false,
                                message: "恢复服务暂时不可用",
                            },
                        }),
                );
                const undo = page.locator(
                    ".workspace-panel--mobile .undo-toast",
                ).getByRole("button", { name: "撤销", exact: true });
                await undo.focus();
                await undo.press("Space");
                await page.locator(".workspace-panel--mobile").getByRole(
                    "alert",
                ).filter({ hasText: "恢复服务暂时不可用" }).waitFor();
                assertEquals(await root.locator(".apps-search-row").count(), 0);
                assertEquals(await page.locator(".undo-toast").count(), 0);
            },
        );
    } finally {
        await browser.close();
        await app.close();
    }
});
