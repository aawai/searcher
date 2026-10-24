import { assert, assertEquals } from "@std/assert";
import { chromium } from "./helpers/browser.ts";
import { startProductionApp } from "./helpers/production-app.ts";
import { SEARCH_QUICK_COMMANDS } from "../src/features/shortcuts/shortcut-catalog.ts";

Deno.test("omnibox lab keyboard, availability, capture and visual acceptance #237", async () => {
    const app = await startProductionApp();
    const browser = await chromium.launch({ headless: true });
    const evidence = await Deno.makeTempDir({
        prefix: "omnibox-237-evidence-",
    });
    try {
        const page = await browser.newPage({
            viewport: { width: 1280, height: 900 },
        });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto(`${app.origin}/design-lab/omnibox`);
        await page.waitForLoadState("networkidle");
        const input = page.getByRole("combobox", { name: "搜索或记录" });
        const list = page.getByRole("listbox", { name: "搜索建议" });
        const output = page.getByRole("region", { name: "模拟操作结果" });
        await input.focus();
        assertEquals(await input.getAttribute("aria-activedescendant"), null);
        assertEquals(
            await list.getByRole("group").evaluateAll((groups) =>
                groups.map((group) =>
                    group.getAttribute("aria-labelledby")?.replace(
                        "omnibox-group-",
                        "",
                    )
                )
            ),
            ["AI", "我的", "应用", "网页", "命令"],
        );
        assertEquals(
            await list.getByRole("option").first().textContent(),
            "询问 AIAlt + Enter",
        );
        assertEquals(
            await list.locator("[tabindex='0'],button,a,input").count(),
            0,
        );
        await input.fill("灵感");
        await input.press("Enter");
        assert((await output.innerText()).includes("网页搜索：灵感"));
        await input.focus();
        await input.press("ArrowDown");
        assertEquals(
            await input.getAttribute("aria-activedescendant"),
            "omnibox-option-ask",
        );
        await input.press("ArrowDown");
        assertEquals(
            await input.getAttribute("aria-activedescendant"),
            "omnibox-option-inspiration",
        );
        await input.press("Enter");
        assert((await output.innerText()).includes("今天的灵感来源是散步"));
        await input.fill("问题");
        await input.press("Alt+Enter");
        assert((await output.innerText()).includes("AI 问答：问题"));
        await input.press("Control+Enter");
        assert((await output.innerText()).includes("新标签页网页搜索：问题"));
        await input.press("Meta+Enter");
        assert((await output.innerText()).includes("新标签页网页搜索：问题"));
        await input.fill("记录散步");
        const previous = await output.innerText();
        for (const key of ["Enter", "ArrowDown", "ArrowUp", "Escape", "Tab"]) {
            await input.dispatchEvent("keydown", {
                key,
                keyCode: 229,
                bubbles: true,
            });
            await input.dispatchEvent("keydown", {
                key,
                isComposing: true,
                bubbles: true,
            });
        }
        for (
            const modifiers of [{ altKey: true }, { ctrlKey: true }, {
                metaKey: true,
            }, { shiftKey: true }]
        ) {
            await input.dispatchEvent("keydown", {
                key: "Enter",
                keyCode: 229,
                ...modifiers,
                bubbles: true,
            });
            await input.dispatchEvent("keydown", {
                key: "Enter",
                isComposing: true,
                ...modifiers,
                bubbles: true,
            });
        }
        assertEquals(await output.innerText(), previous);
        assertEquals(await input.inputValue(), "记录散步");
        assertEquals(await input.getAttribute("aria-activedescendant"), null);
        await input.dispatchEvent("compositionstart");
        await input.press("Shift+Enter");
        assertEquals(await input.inputValue(), "记录散步");
        await input.dispatchEvent("compositionend");
        await input.press("Shift+Enter");
        assertEquals(await input.inputValue(), "");
        assert(
            (await page.getByRole("region", { name: "本次记录" }).innerText())
                .includes("记录散步 · 未固定 · 未收藏"),
        );
        await page.getByRole("button", { name: "撤销", exact: true }).click();
        assertEquals(
            await page.getByRole("region", { name: "本次记录" }).count(),
            0,
        );
        await input.fill("保留记录");
        await input.press("Shift+Enter");
        await page.getByRole("button", { name: "固定到首页", exact: true })
            .click();
        assert(
            (await page.getByRole("region", { name: "本次记录" }).innerText())
                .includes("保留记录 · 已固定 · 未收藏"),
        );
        await input.fill("/");
        assertEquals(
            await list.getByRole("option").count(),
            SEARCH_QUICK_COMMANDS.length,
        );
        await input.fill("/ba");
        assertEquals(await list.getByRole("option").count(), 1);
        assert((await list.innerText()).includes("/ba 百度搜索"));
        await input.press("ArrowUp");
        await input.press("Enter");
        assert((await output.innerText()).includes("执行命令：/ba 百度搜索"));
        await input.fill("/");
        await input.press("Tab");
        assertEquals(
            await input.evaluate((element) =>
                element === document.activeElement
            ),
            false,
        );
        assertEquals(await input.inputValue(), "/");
        await page.getByRole("switch", { name: "可用模型" }).click();
        await input.fill("");
        await input.focus();
        assertEquals(
            await list.getByRole("group", { name: "AI", exact: true }).count(),
            0,
        );
        assertEquals(
            await list.getByRole("option", { name: /\/ai/ }).count(),
            0,
        );
        const noModelAction = await output.innerText();
        await input.press("Alt+Enter");
        assertEquals(await output.innerText(), noModelAction);
        await page.getByRole("switch", { name: "模拟登录" }).click();
        await input.focus();
        assertEquals(
            await list.getByRole("group").evaluateAll((groups) =>
                groups.map((group) =>
                    group.getAttribute("aria-labelledby")?.replace(
                        "omnibox-group-",
                        "",
                    )
                )
            ),
            ["网页", "命令"],
        );
        await input.fill("访客记录");
        await input.press("Shift+Enter");
        assertEquals(await input.inputValue(), "访客记录");
        await input.press("Alt+Enter");
        assertEquals(await output.innerText(), noModelAction);
        await input.press("Enter");
        assert((await output.innerText()).includes("网页搜索：访客记录"));
        await page.getByRole("switch", { name: "模拟登录" }).click();
        await page.getByRole("switch", { name: "可用模型" }).click();
        await input.fill("");
        await input.focus();
        await input.press("ArrowDown");
        await input.press("Escape");
        assertEquals(await input.getAttribute("aria-expanded"), "false");
        await input.focus();
        await input.press("ArrowDown");
        assertEquals(
            await input.getAttribute("aria-activedescendant"),
            "omnibox-option-ask",
        );
        for (const theme of ["light", "dark"]) {
            await page.evaluate((value) => {
                document.documentElement.dataset.theme = value;
            }, theme);
            await page.setViewportSize({ width: 390, height: 844 });
            await input.fill("");
            await input.focus();
            await page.screenshot({
                path: `${evidence}/390-${theme}.png`,
                fullPage: true,
            });
            assert(
                await page.evaluate(() =>
                    document.documentElement.scrollWidth <= innerWidth
                ),
            );
            const geometry = await list.evaluate((element) => ({
                height: element.clientHeight,
                viewport: innerHeight,
                scroll: element.scrollHeight,
            }));
            assert(geometry.height <= geometry.viewport / 2);
            assert(geometry.scroll > geometry.height);
            const colors = await page.evaluate(() => ({
                background: getComputedStyle(document.body).backgroundColor,
                foreground: getComputedStyle(document.body).color,
            }));
            console.log(theme, JSON.stringify({ geometry, colors }));
        }
        const touch = await browser.newContext({
            viewport: { width: 390, height: 844 },
            hasTouch: true,
            isMobile: true,
        });
        const touchPage = await touch.newPage();
        await touchPage.goto(`${app.origin}/design-lab/omnibox`);
        await touchPage.getByRole("combobox").focus();
        const touchSwitch = touchPage.getByRole("switch", { name: "模拟登录" });
        await touchPage.locator(".omnibox-lab-toggle").first().click({
            position: { x: 1, y: 1 },
        });
        assertEquals(await touchSwitch.getAttribute("aria-checked"), "false");
        await touchPage.locator(".omnibox-lab-toggle").first().click({
            position: { x: 1, y: 1 },
        });
        assertEquals(await touchSwitch.getAttribute("aria-checked"), "true");
        await touchPage.getByRole("combobox").focus();
        const targets = await touchPage.locator(
            ".omnibox-lab-option, .omnibox-lab-toggle, .omnibox-lab-page > a, .omnibox-lab-page input[role='combobox']",
        ).evaluateAll((elements) =>
            elements.map((element) => ({
                role: element.getAttribute("role"),
                width: element.getBoundingClientRect().width,
                height: element.getBoundingClientRect().height,
            }))
        );
        assert(
            targets.every((target) =>
                target.width >= 44 && target.height >= 44
            ),
            JSON.stringify(targets),
        );
        assertEquals(errors, []);
        console.log(
            `Production browser acceptance PASS; screenshots: ${evidence}; coarse targets: ${targets.length}`,
        );
        await touch.close();
    } finally {
        await browser.close();
        await app.close();
    }
});
