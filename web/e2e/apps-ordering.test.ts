import { assertEquals } from "@std/assert";
import { chromium, type Route } from "playwright";
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
        await page.locator('[data-workspace="apps"]').click();
        await page.getByRole("button", { name: "应用更多操作", exact: true })
            .click();
        await page.getByRole("menuitem", { name: "整理布局", exact: true })
            .click();
        const root = page.locator(".apps-workspace-root");
        const routes: Route[] = [];
        await page.route("**/api/webapps/reorder", (route) => {
            routes.push(route);
        });
        const reorder = async () => {
            const tiles = root.locator(".launcher-grid > .launcher-tile");
            const target = await tiles.nth(1).getAttribute("data-tile-id");
            await tiles.first().locator("button").first().focus();
            await page.keyboard.press("Space");
            await root.locator(".launcher-tile.is-dragging").waitFor();
            await page.evaluate(() =>
                new Promise<void>((resolve) =>
                    requestAnimationFrame(() =>
                        requestAnimationFrame(() => resolve())
                    )
                )
            );
            await page.keyboard.press("ArrowRight");
            await root.locator(`[data-tile-id="${target}"].is-over`).waitFor();
            await page.keyboard.press("Space");
        };
        await reorder();
        await page.waitForFunction(() =>
            !document.querySelector(".launcher-tile.is-dragging")
        );
        await reorder();
        // Both optimistic gestures run before either request settles. The newer
        // request succeeds first; the older one then fails, so snapshot rollback
        // would incorrectly replace the server-confirmed order.
        await page.waitForFunction(() =>
            !document.querySelector(".launcher-tile.is-dragging")
        );
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
        await page.waitForFunction(
            (expected) =>
                JSON.stringify(
                    Array.from(
                        document.querySelectorAll(
                            ".apps-workspace-root .launcher-grid > .launcher-tile",
                        ),
                        (node) => node.getAttribute("data-tile-id"),
                    ),
                ) === JSON.stringify(expected),
            confirmed,
        );
        await page.getByRole("button", { name: "完成整理", exact: true })
            .click();
        await page.reload();
        await page.locator('[data-workspace="apps"]').click();
        assertEquals(
            await root.locator(".launcher-grid > .launcher-tile").evaluateAll(
                (nodes) =>
                    nodes.map((node) => node.getAttribute("data-tile-id")),
            ),
            confirmed,
        );
    } finally {
        await browser.close();
        await app.close();
    }
});
