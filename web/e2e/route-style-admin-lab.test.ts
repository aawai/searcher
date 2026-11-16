// Design Lab and admin geometry/colour contracts, split from
// route-style-stability.test.ts so the two halves run as parallel files.
import { assert, assertEquals } from "@std/assert";
import { type Locator } from "playwright";
import { eq } from "drizzle-orm";
import { users } from "../../src/db/schema.ts";
import { ACCENTS } from "../../src/shared/contracts.ts";
import { chromium } from "./helpers/browser.ts";
import { loginAndVisit, startProductionApp } from "./helpers/production-app.ts";

Deno.test("Design Lab composition geometry", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const page = await browser.newPage();
    for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme });
        for (const width of [320, 390, 768, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            await page.goto(`${app.origin}/design-lab`);
            await page.locator(".design-lab-composition iframe").last()
                .waitFor();
            const geometry = await page.evaluate(() => ({
                documentWidth: document.documentElement.scrollWidth,
                viewportWidth: document.documentElement.clientWidth,
                previews: Array.from(
                    document.querySelectorAll(
                        ".design-lab-composition iframe",
                    ),
                    (frame) => {
                        const box = frame.getBoundingClientRect();
                        const iframe = frame as HTMLIFrameElement;
                        return {
                            width: box.width,
                            height: box.height,
                            sourceWidth: iframe.clientWidth,
                            sourceHeight: iframe.clientHeight,
                        };
                    },
                ),
            }));
            assert(
                geometry.documentWidth <= geometry.viewportWidth,
                `${width}/${theme}: ${JSON.stringify(geometry)}`,
            );
            assertEquals(geometry.previews.length, 2);
            assertEquals(geometry.previews[0], geometry.previews[1]);
            for (const preview of geometry.previews) {
                assertEquals(preview.sourceWidth, 1440);
                assertEquals(preview.sourceHeight, 900);
                assertEquals(preview.width / preview.height, 1.6);
            }
            for (
                const region of await page.getByRole("region", {
                    name: /构图预览/,
                }).all()
            ) {
                const reach = await region.evaluate((element) => {
                    element.scrollLeft = element.scrollWidth;
                    const frame = element.querySelector("iframe");
                    const box = element.getBoundingClientRect();
                    return {
                        right: frame?.getBoundingClientRect().right,
                        containerRight: box.right,
                        scrollLeft: element.scrollLeft,
                        maxScroll: element.scrollWidth - element.clientWidth,
                    };
                });
                assertEquals(reach.scrollLeft, reach.maxScroll);
                assert(reach.right !== undefined);
                assert(Math.abs(reach.right - reach.containerRight) <= 1);
            }
        }
    }
});

Deno.test("Admin backup actions retain readable semantic colors", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const user = await app.seedAskFixtureUser();
    await app.store.run((db) =>
        db.update(users).set({ role: "admin" }).where(
            eq(users.id, user.userId),
        ).run()
    );

    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        colorScheme: "light",
        reducedMotion: "reduce",
    });
    await loginAndVisit(page, app.origin, "/admin/backup", user);
    const download = page.getByRole("link", { name: "下载备份（ZIP）" });
    await download.waitFor({ state: "visible" });

    async function measureContrast(button: Locator) {
        await button.evaluate(async (element) => {
            // Flush style changes before waiting for the actual color transition.
            getComputedStyle(element).backgroundColor;
            await Promise.all(
                element.getAnimations().map((animation) => animation.finished),
            );
        });
        return await button.evaluate((element) => {
            const context = document.createElement("canvas").getContext("2d");
            if (!context) throw new Error("Canvas is unavailable");
            const style = getComputedStyle(element);
            const surface = element.closest(".settings-card");
            if (!surface) throw new Error("Settings surface is unavailable");
            context.fillStyle = getComputedStyle(surface).backgroundColor;
            context.fillRect(0, 0, 1, 1);
            context.fillStyle = style.backgroundColor;
            context.fillRect(0, 0, 1, 1);
            const background = Array.from(context.getImageData(0, 0, 1, 1).data)
                .slice(0, 3);
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = style.color;
            context.fillRect(0, 0, 1, 1);
            const foreground = Array.from(context.getImageData(0, 0, 1, 1).data)
                .slice(0, 3);
            const luminance = (channels: number[]) => {
                const linear = channels.map((value) => {
                    const channel = value / 255;
                    return channel <= 0.04045
                        ? channel / 12.92
                        : ((channel + 0.055) / 1.055) ** 2.4;
                });
                return 0.2126 * linear[0] + 0.7152 * linear[1] +
                    0.0722 * linear[2];
            };
            const fg = luminance(foreground);
            const bg = luminance(background);
            return {
                foreground,
                background,
                ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
            };
        });
    }

    for (const theme of ["light", "dark"] as const) {
        for (const accent of ["wallpaper", ...ACCENTS.map((item) => item.id)]) {
            const status = await page.evaluate(
                async (appearance) =>
                    (await fetch("/api/preferences", {
                        method: "PATCH",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(appearance),
                    })).status,
                { theme, accent },
            );
            assertEquals(status, 200);
            await page.reload();
            await page.waitForFunction(
                ({ theme, accent }) =>
                    document.documentElement.dataset.theme === theme &&
                    document.documentElement.dataset.accent === accent,
                {
                    theme,
                    accent,
                },
            );
            await download.waitFor({ state: "visible" });
            const { foreground, background, ratio } = await measureContrast(
                download,
            );
            assert(
                ratio >= 4.5,
                `${theme}/${accent}: backup action text contrast ${
                    ratio.toFixed(2)
                } < 4.5 (foreground ${foreground}, background ${background})`,
            );
        }

        const zip = await page.request.get(
            `${app.origin}/api/admin/backup/export`,
        );
        assertEquals(zip.status(), 200);
        await page.locator("#backup-restore-file").setInputFiles({
            name: "backup.zip",
            mimeType: "application/zip",
            buffer: await zip.body(),
        });
        await page.getByRole("button", { name: "预检备份" }).click();
        const restore = page.getByRole("button", { name: "还原此备份…" });
        await restore.waitFor({ state: "visible" });
        const { foreground, ratio } = await measureContrast(restore);
        assert(
            foreground[0] > foreground[1] && foreground[0] > foreground[2],
            `${theme}: destructive action must retain its red text`,
        );
        assert(
            ratio >= 4.5,
            `${theme}: destructive action text contrast ${
                ratio.toFixed(2)
            } < 4.5`,
        );
    }
});

Deno.test("Admin user table keeps short status and role labels readable", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const user = await app.seedAskFixtureUser();
    await app.store.run((db) =>
        db.update(users).set({ role: "admin" }).where(
            eq(users.id, user.userId),
        ).run()
    );
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        reducedMotion: "reduce",
    });
    await loginAndVisit(page, app.origin, "/admin/users", user);
    const created = await page.evaluate(async () => {
        const response = await fetch("/api/admin/users", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                username: "layout_demo",
                displayName: "后台演示用户 · 长名称示例",
                email: "demo.long.address@example.com",
                password: "Layout-demo-password-42!",
            }),
        });
        const body = await response.json() as {
            data: { user: { id: string } };
        };
        return { status: response.status, id: body.data.user.id };
    });
    assertEquals(created.status, 200);
    await page.reload();
    async function assertShortLabels() {
        for (const width of [390, 768]) {
            await page.setViewportSize({ width, height: 844 });
            const selector = width < 768 ? ".admin-user-row" : "tbody tr";
            const demo = page.locator(selector).filter({ hasText: "后台演示用户" });
            const admin = page.locator(selector).filter({ hasText: "Stability Tester" });
            await demo.waitFor({ state: "visible" });
            await admin.waitFor({ state: "visible" });
            const role = admin.getByText("管理员", { exact: true });
            await role.waitFor({ state: "visible" });
            const lines = await role.evaluate((element) => {
                const range = document.createRange();
                range.selectNodeContents(element);
                return new Set(Array.from(range.getClientRects(), (rect) => Math.round(rect.top))).size;
            });
            assertEquals(lines, 1, `${width}px: role must fit one line`);
            if (width === 768) {
                const identityWidth = await admin.locator("td").first().evaluate((cell) => cell.getBoundingClientRect().width);
                assert(identityWidth >= 144, `user identity column is squeezed to ${identityWidth}px`);
                const visible = await admin.getByRole("button", { name: "重置密码" }).evaluate((button) => {
                    const container = button.closest('[data-slot="table-container"]')!;
                    const box = button.getBoundingClientRect();
                    const bounds = container.getBoundingClientRect();
                    return box.left >= bounds.left && box.right <= bounds.right;
                });
                assert(visible, "self reset action must be fully visible at 768px");
            }
            assertEquals(await admin.getByRole("button", { name: "重置密码" }).count(), 1);
        }
    }
    await assertShortLabels();

    const status = await page.evaluate(
        async (id) =>
            (await fetch(`/api/admin/users/${id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ disabled: true }),
            })).status,
        created.id,
    );
    assertEquals(status, 200);
    await page.reload();
    await page.locator("tbody tr").filter({ hasText: "后台演示用户" })
        .getByText("已禁用").waitFor({ state: "visible" });
    await assertShortLabels();
});

Deno.test("Admin audit exposes the complete object ID to keyboard and touch", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const user = await app.seedAskFixtureUser();
    await app.store.run((db) =>
        db.update(users).set({ role: "admin" }).where(
            eq(users.id, user.userId),
        ).run()
    );
    const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    const page = await browser.newPage({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        reducedMotion: "reduce",
    });
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await loginAndVisit(page, app.origin, "/admin/users", user);
    const created = await page.evaluate(async () => {
        const response = await fetch("/api/admin/users", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                username: "audit_demo",
                displayName: "审计演示用户",
                password: "Audit-demo-password-42!",
            }),
        });
        const body = await response.json() as {
            data: { user: { id: string } };
        };
        return { status: response.status, id: body.data.user.id };
    });
    assertEquals(created.status, 200);
    const backup = await page.request.get(
        `${app.origin}/api/admin/backup/export`,
    );
    assertEquals(backup.status(), 200);
    await page.goto(`${app.origin}/admin/audit`);
    const event = page.locator(".admin-mobile-list .admin-audit-event").filter({
        hasText: "创建用户",
    });
    await event.waitFor({ state: "visible" });
    const shortEvent = page.locator(".admin-mobile-list .admin-audit-event")
        .filter({ hasText: "创建备份" });
    await shortEvent.waitFor({ state: "visible" });
    assertEquals(
        await shortEvent.getByText("备份", { exact: true }).count(),
        1,
    );
    assertEquals(
        await shortEvent.getByRole("button").count(),
        0,
        "A named system target must not add a redundant tab stop",
    );
    await event.getByText("@audit_demo", { exact: true })
        .waitFor({ state: "visible" });
    await event.getByText(`@${user.username}`, { exact: true })
        .waitFor({ state: "visible" });
    const trigger = event.getByRole("button", { name: /查看完整 ID$/ });
    assertEquals(
        await trigger.count(),
        1,
        "Full ID must have an accessible trigger",
    );
    assertEquals(
        (await trigger.getAttribute("aria-label"))?.startsWith(
            created.id.slice(0, 10),
        ),
        true,
        "The accessible name starts with the visible ID prefix",
    );
    const actionLines = await event.locator(".admin-audit-action > span")
        .evaluate(
            (element) => {
                const range = document.createRange();
                range.selectNodeContents(element);
                return new Set(
                    Array.from(
                        range.getClientRects(),
                        (rect) => Math.round(rect.top),
                    ),
                ).size;
            },
        );
    assertEquals(actionLines, 1, "Short audit actions must fit one line");
    const box = await trigger.boundingBox();
    assert(box && box.width >= 44 && box.height >= 44);

    await trigger.focus();
    await page.keyboard.press("Enter");
    const popover = page.getByRole("dialog", { name: "完整对象 ID" });
    await popover.getByText(created.id, { exact: true }).waitFor({
        state: "visible",
    });
    await popover.getByRole("button", { name: "复制对象 ID" }).waitFor({
        state: "visible",
    });
    await popover.getByRole("button", { name: "复制对象 ID" }).click();
    await popover.getByRole("button", { name: "已复制对象 ID" }).waitFor({
        state: "visible",
    });
    assertEquals(await page.evaluate(() => navigator.clipboard.readText()), created.id);
    await page.keyboard.press("Escape");
    await popover.waitFor({ state: "hidden" });
    assertEquals(
        await trigger.evaluate((element) => element === document.activeElement),
        true,
    );

    await trigger.tap();
    await popover.getByText(created.id, { exact: true }).waitFor({
        state: "visible",
    });
    await page.touchscreen.tap(5, 5);
    await popover.waitFor({ state: "hidden" });

    await page.setViewportSize({ width: 768, height: 844 });
    await page.goto(`${app.origin}/admin/audit`);
    await page.locator("th", { hasText: "操作者" }).waitFor({
        state: "visible",
    });
    const desktopRow = page.locator("tbody tr").filter({ hasText: "创建用户" });
    await desktopRow.getByText(`@${user.username}`, { exact: true }).waitFor({
        state: "visible",
    });
    const targetCell = desktopRow.locator(".admin-audit-target-cell");
    const targetWidth = await targetCell.evaluate((cell) => cell.getBoundingClientRect().width);
    assert(targetWidth >= 108, `audit target column is squeezed to ${targetWidth}px`);
    await desktopRow.locator(".admin-audit-tablet-time").waitFor({ state: "visible" });
    const search = page.getByRole("searchbox", { name: "搜索审计日志" });
    await search.fill("audit_demo");
    const filtered = page.waitForResponse((response) =>
        response.url().includes("/api/admin/audit-logs?") &&
        new URL(response.url()).searchParams.get("q") === "audit_demo" &&
        response.status() === 200
    );
    await search.press("Enter");
    await filtered;
    await desktopRow.waitFor({ state: "visible" });
    await page.waitForFunction(() => document.querySelectorAll(".admin-desktop-view tbody tr").length === 1);
});

Deno.test("Admin settings can discard and save changes", async () => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const user = await app.seedAskFixtureUser();
    await app.store.run((db) =>
        db.update(users).set({ role: "admin" }).where(eq(users.id, user.userId)).run()
    );
    const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
    cleanup.defer(() => browser.close());
    const page = await browser.newPage();
    await loginAndVisit(page, app.origin, "/admin/settings", user);
    const input = page.locator("#auditRetentionDays");
    await input.waitFor({ state: "visible" });
    const initial = await input.inputValue();
    const changed = initial === "91" ? "92" : "91";
    const save = page.getByRole("button", { name: "保存设置" });
    assertEquals(await save.isDisabled(), true);
    await input.fill(changed);
    assertEquals(await save.isDisabled(), false);
    await page.getByRole("button", { name: "放弃" }).click();
    assertEquals(await input.inputValue(), initial);
    assertEquals(await save.isDisabled(), true);
    await input.fill(changed);
    await save.click();
    await page.getByText("系统设置已保存").waitFor({ state: "visible" });
    assertEquals(await save.isDisabled(), true);
    await page.reload();
    await page.locator("#auditRetentionDays").waitFor({ state: "visible" });
    assertEquals(await page.locator("#auditRetentionDays").inputValue(), changed);
});
