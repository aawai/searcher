import { assert, assertEquals } from "@std/assert";
import { chromium, type Page } from "playwright";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";
import {
    deskDetail,
    deskObject,
    deskOverview,
    deskStage,
} from "./helpers/desk.ts";

/** Accessible name or id of the focused element. */
const focused = (page: Page) =>
    page.evaluate(() => {
        const element = document.activeElement as HTMLElement | null;
        if (!element || element === document.body) return null;
        return element.getAttribute("data-desk-object") ??
            element.getAttribute("aria-label") ?? element.id;
    });

async function waitFocus(page: Page, expected: string | null) {
    await page.waitForFunction(
        (want) => {
            const element = document.activeElement as HTMLElement | null;
            const name = !element || element === document.body
                ? null
                : element.getAttribute("data-desk-object") ??
                    element.getAttribute("aria-label") ?? element.id;
            return name === want;
        },
        expected,
        { timeout: 5000 },
    ).catch(async () => {
        throw new Error(
            `focus: expected ${expected}, got ${await focused(page)}`,
        );
    });
}

async function waitStage(page: Page, stage: "calm" | "overview") {
    await page.waitForFunction(
        (want) =>
            document.querySelector(".desk-home")?.getAttribute(
                "data-desk-stage",
            ) === want,
        stage,
        { timeout: 5000 },
    );
}

async function seed(page: Page, origin: string, papers: number) {
    const post = async (path: string, data: unknown) => {
        const response = await page.request.post(origin + path, {
            headers: { Origin: origin },
            data,
        });
        assert(response.ok(), await response.text());
        return (await response.json()).data;
    };
    await post("/api/webapps", { name: "GitHub", url: "https://github.com" });
    await post("/api/documents", { title: "读书笔记", body: "正文" });
    const ids: string[] = [];
    for (let index = 0; index < papers; index++) {
        const paper = await post("/api/documents", {
            title: `纸张 ${index}`,
            body: "",
            isHomeFixed: true,
        });
        ids.push(paper.id);
    }
    return ids;
}

Deno.test("desk 览: keyboard browse, open, edit and return; list fallback; Sheet below 768px; guests stay out #240", async (t) => {
    const app = await startProductionApp();
    const credentials = await app.seedAskFixtureUser({
        username: "desk_user",
        password: "Desk-overview-password-240!",
    });
    const browser = await chromium.launch({ headless: true });
    try {
        await t.step("guests cannot enter 览", async () => {
            const page = await browser.newPage({
                viewport: { width: 1440, height: 900 },
            });
            const errors: string[] = [];
            page.on("pageerror", (error) => errors.push(error.message));
            await page.goto(app.origin + "/");
            await page.locator("#search-query").waitFor();
            await page.locator("#search-query").focus();
            await page.keyboard.press("Escape");
            await page.keyboard.press("Control+.");
            await page.mouse.move(720, 600);
            await page.mouse.wheel(0, 400);
            assertEquals(await deskOverview(page).count(), 0);
            assertEquals(await deskStage(page), "calm");
            assertEquals(errors, []);
            await page.close();
        });

        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 },
            reducedMotion: "reduce",
        });
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await loginAndVisit(page, app.origin, "/", credentials);
        const [paperId] = await seed(page, app.origin, 1);
        await page.reload();
        await page.locator("#search-query").waitFor();

        await t.step("1440: the whole round trip by keyboard", async () => {
            await page.locator("#search-query").focus();
            await page.keyboard.press("Control+.");
            await waitStage(page, "overview");
            await waitFocus(page, "notes");
            // The home layer is out of reach while 览 is open.
            assertEquals(
                await page.locator(".desk-home").getAttribute("inert"),
                "",
            );
            // One tab stop; arrows move spatially.
            await page.keyboard.press("ArrowRight");
            await waitFocus(page, "conversations");
            await page.keyboard.press("ArrowLeft");
            await waitFocus(page, "notes");
            await page.keyboard.press("Enter");
            const detail = deskDetail(page);
            await detail.getByRole("heading", { name: "笔记", exact: true })
                .waitFor();
            await waitFocus(page, "关闭详情");
            // Nothing on the desk hides under the detail bar.
            const bar = await detail.boundingBox();
            assert(bar);
            for (
                const object of await page.locator("[data-desk-object]").all()
            ) {
                const box = await object.boundingBox();
                assert(box && box.x + box.width <= bar.x, "object under bar");
            }
            // Into the library and a note, edit, then close back to the object.
            await page.keyboard.press("Tab");
            const row = detail.getByRole("button", { name: "读书笔记" })
                .first();
            await row.waitFor();
            await row.focus();
            await page.keyboard.press("Enter");
            await detail.getByRole("button", {
                name: "返回上一级",
                exact: true,
            }).waitFor();
            await waitFocus(page, "返回上一级");
            assertEquals(
                await detail.getAttribute("data-workspace-expanded"),
                "true",
            );
            const editor = detail.locator("[contenteditable='true']").first();
            const saved = page.waitForResponse(
                (response) =>
                    response.request().method() === "PATCH" &&
                    /\/api\/documents\/[^/]+$/.test(response.url()) &&
                    response.ok(),
                { timeout: 10000 },
            );
            await editor.click();
            await page.keyboard.type("补充");
            await saved;
            await detail.getByText("已保存").waitFor();
            // ProseMirror keeps Escape (select parent node); from the nested
            // page's chrome one Escape closes the whole bar.
            await detail.getByRole("button", {
                name: "返回上一级",
                exact: true,
            })
                .focus();
            await page.keyboard.press("Escape");
            await detail.waitFor({ state: "detached" });
            await waitFocus(page, "notes");
            await page.keyboard.press("Escape");
            await waitStage(page, "calm");
            await waitFocus(page, "search-query");
        });

        await t.step(
            "1440: a home paper opened from 静 closes back to 静",
            async () => {
                await page.locator(".note-card .note-title").first().click();
                await waitStage(page, "overview");
                await deskDetail(page).waitFor();
                assertEquals(
                    await deskObject(page, `paper:${paperId}`).getAttribute(
                        "aria-pressed",
                    ),
                    "true",
                );
                await page.getByRole("button", { name: "关闭详情" }).click();
                await waitStage(page, "calm");
                await waitFocus(page, "纸张 0");
            },
        );

        await t.step(
            "1440: avatar menu and empty-search entries; focus returns to them",
            async () => {
                // The home has no bottom navigation (the former 工作区 Dock).
                assertEquals(
                    await page.getByRole("navigation", { name: "工作区" })
                        .count(),
                    0,
                );
                const trigger = page.locator(".user-avatar-trigger");
                const triggerName = await trigger.getAttribute("aria-label");
                await trigger.click();
                await page.getByRole("menuitem", { name: "桌面", exact: true })
                    .click();
                await waitStage(page, "overview");
                await waitFocus(page, "notes");
                await page.keyboard.press("Escape");
                await waitStage(page, "calm");
                await waitFocus(page, triggerName);

                await trigger.click();
                await page.getByRole("menuitem", { name: "笔记", exact: true })
                    .click();
                await deskDetail(page).getByRole("heading", {
                    name: "笔记",
                    exact: true,
                }).waitFor();
                await page.keyboard.press("Escape");
                await waitStage(page, "calm");
                await waitFocus(page, triggerName);

                // The focused empty search box offers 桌面 and 笔记.
                await page.locator("#search-query").focus();
                const options = page.getByRole("listbox").getByRole("option");
                await options.first().waitFor();
                assertEquals(await options.allInnerTexts(), ["桌面", "笔记"]);
                await page.getByRole("option", { name: "桌面" }).click();
                await waitStage(page, "overview");
                await page.keyboard.press("Escape");
                await waitStage(page, "calm");
                await waitFocus(page, "search-query");

                // From another page the menu is a page navigation home.
                await page.goto(app.origin + "/settings");
                await trigger.click();
                await page.getByRole("menuitem", { name: "笔记", exact: true })
                    .click();
                await waitStage(page, "overview");
                assertEquals(new URL(page.url()).pathname, "/");
                await page.goBack();
                await page.waitForURL(app.origin + "/settings");
                await page.goto(app.origin + "/");
                await page.locator("#search-query").waitFor();
            },
        );

        await t.step(
            "1440: more than 96 objects degrade to the list",
            async () => {
                await seed(page, app.origin, 96);
                await page.reload();
                await page.locator("#search-query").waitFor();
                await page.locator("#search-query").focus();
                await page.keyboard.press("Control+.");
                await waitStage(page, "overview");
                const overview = deskOverview(page);
                await overview.locator(".desk-list").waitFor();
                assertEquals(await overview.locator(".desk-grid").count(), 0);
                await page.keyboard.press("Escape");
                await waitStage(page, "calm");
            },
        );
        assertEquals(errors, []);
        await context.close();

        await t.step("390: 览 is a Sheet with nested details", async () => {
            const mobile = await browser.newContext({
                viewport: { width: 390, height: 844 },
                reducedMotion: "reduce",
                hasTouch: true,
            });
            const phone = await mobile.newPage();
            await loginAndVisit(phone, app.origin, "/", credentials);
            await phone.locator("#search-query").focus();
            await phone.keyboard.press("Control+.");
            const sheet = phone.getByRole("dialog");
            await sheet.getByRole("heading", { name: "桌面", exact: true })
                .waitFor();
            assertEquals(await deskOverview(phone).count(), 0);
            await sheet.locator('[data-desk-object="notes"]').click();
            await sheet.getByRole("heading", { name: "笔记", exact: true })
                .waitFor();
            await waitFocus(phone, "返回桌面");
            await phone.keyboard.press("Enter");
            await waitFocus(phone, "notes");
            await phone.keyboard.press("Escape");
            await sheet.waitFor({ state: "detached" });
            await waitStage(phone, "calm");
            await mobile.close();
        });
    } finally {
        await browser.close();
        await app.close();
    }
});
