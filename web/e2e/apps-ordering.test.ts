import { assertEquals } from "@std/assert";
import { type Route } from "playwright";
import { chromium } from "./helpers/browser.ts";
import { startProductionApp } from "./helpers/production-app.ts";

Deno.test("apps concurrent optimistic sorting converges to confirmed server order #141", async () => {
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
        await page.locator("#auth-username").fill("apps_ordering");
        await page.locator("#auth-display-name").fill("Ordering tester");
        await page.locator("#auth-password").fill(
            "Apps-ordering-password-141!",
        );
        await page.locator('form button[type="submit"]').click();
        await page.waitForURL(app.origin + "/");
        for (let index = 0; index < 3; index++) {
            const response = await page.request.post(
                app.origin + "/api/webapps",
                {
                    headers: { Origin: app.origin },
                    data: {
                        name: `Order ${index}`,
                        url: `https://order${index}.example/`,
                        sortOrder: index,
                    },
                },
            );
            assertEquals(response.status(), 200);
        }
        await page.reload();
        const tiles = page.locator(
            ".launcher-grid--home > .launcher-tile[data-tile-id]",
        );
        const readOrder = () =>
            tiles.evaluateAll((nodes) =>
                nodes.map((node) => node.getAttribute("data-tile-id"))
            );
        await tiles.first().waitFor();
        await tiles.first().click({ button: "right" });
        await page.getByRole("menuitem", { name: "整理布局", exact: true })
            .click();
        await page.locator(".home-managing-bar").waitFor();
        const initial = await readOrder();
        assertEquals(initial.length, 3);
        const routes: Route[] = [];
        await page.route("**/api/webapps/reorder", (route) => {
            routes.push(route);
        });
        // In 整理 mode the arrow keys move the focused tile one visual slot
        // and persist the whole order; every gesture is optimistic.
        const moveRight = async (
            index: number,
            expected: Array<string | null>,
        ) => {
            const requested = page.waitForRequest((request) =>
                new URL(request.url()).pathname === "/api/webapps/reorder" &&
                request.method() === "PUT"
            );
            await tiles.nth(index).locator("button").first().focus();
            await page.keyboard.press("ArrowRight");
            await requested;
            await page.waitForFunction(
                (order) =>
                    JSON.stringify(
                        Array.from(
                            document.querySelectorAll(
                                ".launcher-grid--home > .launcher-tile[data-tile-id]",
                            ),
                            (node) => node.getAttribute("data-tile-id"),
                        ),
                    ) === JSON.stringify(order),
                expected,
            );
        };
        const afterFirst = [initial[1], initial[0], initial[2]];
        const afterSecond = [initial[1], initial[2], initial[0]];
        await moveRight(0, afterFirst);
        await moveRight(1, afterSecond);
        // Both optimistic gestures run before either request settles. The newer
        // request succeeds first; the older one then fails, so snapshot rollback
        // would incorrectly replace the server-confirmed order.
        if (routes.length !== 2) {
            throw new Error(
                `Expected two pending gestures, got ${routes.length}`,
            );
        }
        const newer = await routes[1].fetch();
        await routes[1].fulfill({ response: newer });
        await routes[0].fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
                status: false,
                error: "Controlled ordering failure",
            }),
        });
        await page.getByRole("alert").filter({ hasText: "排列保存失败" })
            .waitFor();
        const server = await page.request.get(app.origin + "/api/webapps");
        const envelope = await server.json();
        const confirmed = envelope.data.toSorted((
            a: { sortOrder: number },
            b: { sortOrder: number },
        ) => a.sortOrder - b.sortOrder).map((item: { id: string }) => item.id);
        assertEquals(confirmed, afterSecond);
        await page.waitForFunction(
            (expected) =>
                JSON.stringify(
                    Array.from(
                        document.querySelectorAll(
                            ".launcher-grid--home > .launcher-tile[data-tile-id]",
                        ),
                        (node) => node.getAttribute("data-tile-id"),
                    ),
                ) === JSON.stringify(expected),
            confirmed,
        );
        await page.getByRole("button", { name: "完成", exact: true }).click();
        await page.reload();
        await tiles.first().waitFor();
        assertEquals(await readOrder(), confirmed);
    } finally {
        await browser.close();
        await app.close();
    }
});
