import { createEvidenceDirectory } from "./helpers/evidence.ts";
import { assert, assertEquals } from "@std/assert";
import { Buffer } from "node:buffer";
import { type Locator, type Page } from "playwright";
import { eq } from "drizzle-orm";
import { aiModels } from "../../src/db/ai-schema.ts";
import { users } from "../../src/db/schema.ts";
import { ACCENTS } from "../../src/shared/contracts.ts";
import { chromium } from "./helpers/browser.ts";
import {
    loginAndVisit,
    openSeededAskConversation,
    startProductionApp,
} from "./helpers/production-app.ts";

// Helper for client-side SPA navigation within the same document
async function spaNavigate(page: Page, path: string) {
    const timeBefore = await page.evaluate(() => performance.timeOrigin);
    await page.evaluate((targetPath) => {
        globalThis.history.pushState({}, "", targetPath);
        globalThis.dispatchEvent(new PopStateEvent("popstate"));
    }, path);
    const timeAfter = await page.evaluate(() => performance.timeOrigin);
    assertEquals(
        timeAfter,
        timeBefore,
        "SPA client-side navigation must not reload document (performance.timeOrigin unchanged)",
    );
}

Deno.test("Production Route Style Stability E2E Suite", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());

    const user = await app.seedAskFixtureUser();
    const artifactDir = await createEvidenceDirectory("route-style");

    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());

    const metricsRecord: Record<string, unknown> = {};

    // =========================================================================
    // Step 1: 1440x900 Settings & Ask Hard Gates + SPA Route Stability
    // =========================================================================
    await t.step(
        "1440x900: Settings Appearance and Ask geometry hard gates",
        async () => {
            const context = await browser.newContext({
                viewport: { width: 1440, height: 900 },
            });
            const page = await context.newPage();

            // Sequence A: Fresh load to /settings/appearance
            await loginAndVisit(page, app.origin, "/settings/appearance", user);
            await page.locator(".settings-content").waitFor({
                state: "visible",
            });

            // 1. Accent swatch 1440x900 hard gates: one row of unlabeled dots
            const swatchGroup = page.locator(
                '[data-slot="radio-group"][data-variant="swatch"]',
            );
            await swatchGroup.waitFor({ state: "visible" });
            const swatchBox = await swatchGroup.boundingBox();
            assert(swatchBox, "Swatch group must be visible");

            const swatchDisplay = await swatchGroup.evaluate((el) =>
                globalThis.getComputedStyle(el).display
            );
            assertEquals(swatchDisplay, "flex");

            const swatchItems = swatchGroup.locator(
                '[data-slot="radio-group-item"]',
            );
            const swatchCount = await swatchItems.count();
            assertEquals(
                swatchCount,
                10,
                "Should have 跟随壁纸 plus 9 accent swatch options",
            );

            const itemBoxes = [];
            const itemHeights = [];
            for (let i = 0; i < swatchCount; i++) {
                const item = swatchItems.nth(i);
                const box = await item.boundingBox();
                assert(box, `Item ${i} must have bounding box`);
                itemBoxes.push(box);
                itemHeights.push(box.height);

                // Names live in aria-label and tooltip only.
                assert(
                    await item.getAttribute("aria-label"),
                    `Swatch ${i} must keep an accessible name`,
                );
                assertEquals(
                    await item.innerText(),
                    "",
                    `Swatch ${i} must not render its name as visible text`,
                );
            }

            // Visual row count = 1
            const uniqueYRows = new Set(itemBoxes.map((b) => Math.round(b.y)));
            assertEquals(
                uniqueYRows.size,
                1,
                `1440 desktop accent swatches must render in one row (got ${uniqueYRows.size})`,
            );

            // Item height difference <= 1 CSS px
            const heightDiff = Math.max(...itemHeights) -
                Math.min(...itemHeights);
            assert(
                heightDiff <= 1,
                `All swatch items must have identical height (max diff ${heightDiff}px)`,
            );

            await page.setViewportSize({ width: 390, height: 844 });
            const narrowGrid = await swatchItems.evaluateAll((items) =>
                items.map((item) => {
                    const box = item.getBoundingClientRect();
                    return {
                        x: box.x,
                        y: box.y,
                        width: box.width,
                        height: box.height,
                    };
                })
            );
            assertEquals(
                new Set(narrowGrid.map((box) => Math.round(box.y))).size,
                2,
            );
            assertEquals(
                new Set(narrowGrid.map((box) => Math.round(box.x))).size,
                5,
            );
            assert(
                narrowGrid.every((box) => box.width >= 44 && box.height >= 44),
            );
            assertEquals(
                await swatchItems.first().getAttribute("aria-label"),
                "跟随壁纸",
            );
            const narrowSwatchRowGap = await page.locator(".settings-row")
                .filter({ has: swatchGroup })
                .evaluate((row) => {
                    const label = row.querySelector(".settings-row-label");
                    const group = row.querySelector(
                        '[data-slot="radio-group"][data-variant="swatch"]',
                    );
                    if (!label || !group) return null;
                    const labelBox = label.getBoundingClientRect();
                    const groupBox = group.getBoundingClientRect();
                    return {
                        labelHeight: labelBox.height,
                        gapToSwatch: groupBox.top - labelBox.bottom,
                    };
                });
            assert(narrowSwatchRowGap, "Swatch row label and group must exist");
            assert(
                narrowSwatchRowGap.labelHeight <= 32,
                `390px swatch row label must not inherit 8em vertical basis (got ${narrowSwatchRowGap.labelHeight}px)`,
            );
            assert(
                narrowSwatchRowGap.gapToSwatch >= 0 &&
                    narrowSwatchRowGap.gapToSwatch <= 16,
                `390px swatch row label-to-swatch gap must stay compact (got ${narrowSwatchRowGap.gapToSwatch}px)`,
            );
            await page.setViewportSize({ width: 1440, height: 900 });

            // Capture settings theme screenshot
            const swatchCard = page.locator(".settings-row").filter({
                has: swatchGroup,
            });
            await swatchCard.screenshot({
                path: `${artifactDir}/settings-theme-1440.png`,
            });

            // Record fresh settings computed styles for stability comparison
            const freshSwatchStyles = await swatchGroup.evaluate((el) => {
                const cs = globalThis.getComputedStyle(el);
                return {
                    display: cs.display,
                    gridTemplateColumns: cs.gridTemplateColumns,
                    padding: cs.padding,
                    borderRadius: cs.borderRadius,
                    minHeight: cs.minHeight,
                };
            });

            const freshSelectWidth = await page.locator(
                '[data-slot="radio-group"][data-variant="segmented"]',
            ).first().evaluate(
                (el) => globalThis.getComputedStyle(el).width,
            );

            // SPA navigate to /ask
            await spaNavigate(page, "/ask");
            await openSeededAskConversation(page);

            // Record Ask 1440 metrics
            const pageShellBox = await page.locator(".ask-page-shell:visible")
                .boundingBox();
            const sidebarBox = await page.locator(".ask-sidebar").boundingBox();
            const messagesInnerBox = await page.locator(
                ".ask-thread__messages-inner",
            ).boundingBox();
            const asstMsgBox = await page.locator(
                ".ask-assistant-msg-container",
            ).boundingBox();
            const userMsgBox = await page.locator(".ask-user-msg-container")
                .boundingBox();
            const composerBox = await page.locator(".ask-composer-container")
                .boundingBox();

            assert(
                pageShellBox && sidebarBox && messagesInnerBox && asstMsgBox &&
                    userMsgBox && composerBox,
            );

            assertEquals(
                Math.round(pageShellBox.width),
                1280,
                "PageShell width at 1440 must be 1280 ± 1px",
            );
            assertEquals(
                Math.round(sidebarBox.width),
                260,
                "Sidebar width must be 260 ± 1px",
            );
            assertEquals(
                Math.round(messagesInnerBox.width),
                900,
                "Reading lane at 1440 must be 900 ± 1px",
            );
            assertEquals(
                Math.round(asstMsgBox.width),
                900,
                "Assistant message container at 1440 must be 900 ± 1px",
            );
            assertEquals(
                Math.round(userMsgBox.width),
                760,
                "User message container at 1440 must be 760 ± 1px",
            );
            assertEquals(
                Math.round(composerBox.width),
                760,
                "Composer width at 1440 must be 760 ± 1px",
            );

            // Composer Send Button Containment
            const sendBtn = await page.locator(".ask-composer__send-btn")
                .first().boundingBox();
            const composerSurface = await page.locator(".ask-composer-surface")
                .first().boundingBox();
            assert(sendBtn && composerSurface);
            assert(
                sendBtn.x + sendBtn.width <=
                    composerSurface.x + composerSurface.width + 1,
                "Send button right edge must be within composer surface",
            );
            assert(
                sendBtn.x >= composerSurface.x,
                "Send button left edge must be within composer surface",
            );

            // Capture Ask 1440 screenshots
            await page.screenshot({
                path: `${artifactDir}/ask-workbench-1440.png`,
            });
            await page.locator(".ask-assistant-body").first().screenshot({
                path: `${artifactDir}/ask-markdown-1440.png`,
            });

            // SPA navigate back to /settings/appearance to verify route-order computed style invariance
            await spaNavigate(page, "/settings/appearance");
            await page.locator(".settings-content").waitFor({
                state: "visible",
            });

            const navigatedSwatchStyles = await swatchGroup.evaluate((el) => {
                const cs = globalThis.getComputedStyle(el);
                return {
                    display: cs.display,
                    gridTemplateColumns: cs.gridTemplateColumns,
                    padding: cs.padding,
                    borderRadius: cs.borderRadius,
                    minHeight: cs.minHeight,
                };
            });
            assertEquals(
                navigatedSwatchStyles,
                freshSwatchStyles,
                "Settings swatch styles must be identical regardless of route load history",
            );

            const navigatedSelectWidth = await page.locator(
                '[data-slot="radio-group"][data-variant="segmented"]',
            ).first().evaluate(
                (el) => globalThis.getComputedStyle(el).width,
            );
            assertEquals(
                navigatedSelectWidth,
                freshSelectWidth,
                "Theme control width must be identical regardless of route load history",
            );

            // Save metrics to record
            metricsRecord["1440x900"] = {
                pageShellWidth: pageShellBox.width,
                sidebarWidth: sidebarBox.width,
                readingLaneWidth: messagesInnerBox.width,
                assistantMsgWidth: asstMsgBox.width,
                userMsgWidth: userMsgBox.width,
                composerWidth: composerBox.width,
                swatchRows: uniqueYRows.size,
                swatchHeightDiff: heightDiff,
            };

            await context.close();
        },
    );

    // =========================================================================
    // Step 2: 2048x1152 Ask Wide-screen Hard Gates
    // =========================================================================
    await t.step(
        "2048x1152: Ask Wide-screen Responsive Geometry Hard Gates",
        async () => {
            const context = await browser.newContext({
                viewport: { width: 2048, height: 1152 },
            });
            const page = await context.newPage();

            await loginAndVisit(page, app.origin, "/ask", user);
            await openSeededAskConversation(page);

            const pageShellBox = await page.locator(".ask-page-shell:visible")
                .boundingBox();
            const sidebarBox = await page.locator(".ask-sidebar").boundingBox();
            const messagesInnerBox = await page.locator(
                ".ask-thread__messages-inner",
            ).boundingBox();
            const asstMsgBox = await page.locator(
                ".ask-assistant-msg-container",
            ).boundingBox();
            const userMsgBox = await page.locator(".ask-user-msg-container")
                .boundingBox();
            const composerBox = await page.locator(".ask-composer-container")
                .boundingBox();

            assert(
                pageShellBox && sidebarBox && messagesInnerBox && asstMsgBox &&
                    userMsgBox && composerBox,
            );

            // Exact tolerance assertions for 2048px
            assert(
                Math.abs(pageShellBox.width - 1679) <= 2,
                `Ask PageShell width at 2048 must be 1679 ± 2px (got ${pageShellBox.width})`,
            );
            assertEquals(
                Math.round(sidebarBox.width),
                260,
                "Sidebar width must be 260 ± 1px",
            );
            assertEquals(
                Math.round(messagesInnerBox.width),
                1040,
                "Reading column at 2048 must be 1040 ± 1px",
            );
            assertEquals(
                Math.round(asstMsgBox.width),
                1040,
                "Assistant message lane at 2048 must be 1040 ± 1px",
            );
            assertEquals(
                Math.round(userMsgBox.width),
                920,
                "User message lane at 2048 must be 920 ± 1px",
            );
            assertEquals(
                Math.round(composerBox.width),
                920,
                "Composer width at 2048 must be 920 ± 1px",
            );

            // Boundaries: right edge within page shell, scrollWidth <= clientWidth + 1
            const workspaceBox = await page.locator(".ask-workspace-layout")
                .boundingBox();
            assert(workspaceBox);
            assert(
                workspaceBox.x + workspaceBox.width <=
                    pageShellBox.x + pageShellBox.width + 1,
                "Ask workspace right edge must not exceed page shell right edge",
            );

            const composerScrollW = await page.locator(".ask-composer-surface")
                .evaluate((el) => el.scrollWidth);
            const composerClientW = await page.locator(".ask-composer-surface")
                .evaluate((el) => el.clientWidth);
            assert(
                composerScrollW <= composerClientW + 1,
                "Composer must not have horizontal scroll overflow",
            );

            const asstScrollW = await page.locator(
                ".ask-assistant-msg-container",
            ).evaluate((el) => el.scrollWidth);
            const asstClientW = await page.locator(
                ".ask-assistant-msg-container",
            ).evaluate((el) => el.clientWidth);
            assert(
                asstScrollW <= asstClientW + 1,
                "Assistant message container must not have horizontal scroll overflow",
            );

            // Code block pre geometry: no negative margins, contained in lane
            const preBox = await page.locator(".ask-assistant-body pre").first()
                .boundingBox();
            assert(preBox);
            assert(
                preBox.x + preBox.width <= asstMsgBox.x + asstMsgBox.width + 1,
                "Pre block right edge must not exceed assistant message lane",
            );
            assert(
                preBox.x >= asstMsgBox.x - 1,
                "Pre block left edge must not exceed assistant message lane",
            );

            const preMargins = await page.locator(".ask-assistant-body pre")
                .first().evaluate((el) => {
                    const cs = globalThis.getComputedStyle(el);
                    return {
                        left: cs.marginLeft,
                        right: cs.marginRight,
                    };
                });
            assertEquals(
                preMargins.left,
                "0px",
                "Pre must not have negative left margin",
            );
            assertEquals(
                preMargins.right,
                "0px",
                "Pre must not have negative right margin",
            );

            // Screenshot 2048 workbench
            await page.screenshot({
                path: `${artifactDir}/ask-workbench-2048.png`,
            });

            metricsRecord["2048x1152"] = {
                pageShellWidth: pageShellBox.width,
                sidebarWidth: sidebarBox.width,
                readingLaneWidth: messagesInnerBox.width,
                assistantMsgWidth: asstMsgBox.width,
                userMsgWidth: userMsgBox.width,
                composerWidth: composerBox.width,
                preWidth: preBox.width,
            };

            await context.close();
        },
    );

    // =========================================================================
    // Step 3: 390x844 Mobile Hard Gates
    // =========================================================================
    await t.step(
        "390x844: Mobile Layout, Touch Targets, and Drawer Contracts",
        async () => {
            const context = await browser.newContext({
                viewport: { width: 390, height: 844 },
                isMobile: true,
                hasTouch: true,
            });
            const page = await context.newPage();

            // Settings on mobile
            await loginAndVisit(page, app.origin, "/settings/appearance", user);
            await page.locator(".settings-content").waitFor({
                state: "visible",
            });
            assert(
                await page.evaluate(() =>
                    matchMedia("(pointer: coarse)").matches
                ),
                "Mobile emulation must report a coarse primary pointer",
            );

            const hasSettingsHScroll = await page.evaluate(
                () =>
                    document.documentElement.scrollWidth >
                        document.documentElement.clientWidth,
            );
            assertEquals(
                hasSettingsHScroll,
                false,
                "Settings must have zero horizontal overflow on mobile",
            );

            const swatchGroup = page.locator(
                '[data-slot="radio-group"][data-variant="swatch"]',
            );
            const swatchItems = swatchGroup.locator(
                '[data-slot="radio-group-item"]',
            );
            for (let i = 0; i < await swatchItems.count(); i++) {
                const box = await swatchItems.nth(i).boundingBox();
                assert(box);
                assert(
                    box.height >= 44,
                    `Swatch touch target height must be >= 44px (got ${box.height})`,
                );
            }
            const mobileSwatchRowGap = await page.locator(".settings-row")
                .filter({ has: swatchGroup })
                .evaluate((row) => {
                    const label = row.querySelector(".settings-row-label");
                    const group = row.querySelector(
                        '[data-slot="radio-group"][data-variant="swatch"]',
                    );
                    if (!label || !group) return null;
                    const labelBox = label.getBoundingClientRect();
                    const groupBox = group.getBoundingClientRect();
                    return {
                        labelHeight: labelBox.height,
                        gapToSwatch: groupBox.top - labelBox.bottom,
                    };
                });
            assert(mobileSwatchRowGap);
            assert(
                mobileSwatchRowGap.labelHeight <= 32 &&
                    mobileSwatchRowGap.gapToSwatch >= 0 &&
                    mobileSwatchRowGap.gapToSwatch <= 16,
                `Mobile swatch row label must stay compact above swatches (labelHeight=${mobileSwatchRowGap.labelHeight}px, gap=${mobileSwatchRowGap.gapToSwatch}px)`,
            );

            // A 40×24 switch keeps its look; its hit area still spans 44×44.
            const switches = page.locator('.settings-content [role="switch"]');
            assert(await switches.count() > 0, "Appearance has switches");
            for (let i = 0; i < await switches.count(); i++) {
                await switches.nth(i).evaluate((element) =>
                    element.scrollIntoView({
                        block: "center",
                        behavior: "instant",
                    })
                );
                const box = await switches.nth(i).boundingBox();
                assert(box);
                const hits = await switches.nth(i).evaluate(
                    (element, box) => {
                        const x = box.x + box.width / 2;
                        const y = box.y + box.height / 2;
                        // Just inside each edge of a centred 44×44 square.
                        return [[x, y - 21], [x, y + 21], [x - 21, y], [
                            x + 21,
                            y,
                        ]].map(([px, py]) =>
                            document.elementFromPoint(px, py)?.closest(
                                '[role="switch"]',
                            ) === element
                        );
                    },
                    box,
                );
                assert(
                    hits.every(Boolean),
                    `Switch ${i} hit area must span 44×44 (edges ${hits})`,
                );
            }

            await swatchGroup.scrollIntoViewIfNeeded();
            await swatchGroup.screenshot({
                path: `${artifactDir}/settings-theme-390.png`,
            });

            // SPA navigate to Ask
            await spaNavigate(page, "/ask");
            await page.locator(".ask-workspace-layout").waitFor({
                state: "visible",
            });

            // Mobile Ask hard gates:
            // 1. Zero document horizontal overflow
            const hasAskHScroll = await page.evaluate(
                () =>
                    document.documentElement.scrollWidth >
                        document.documentElement.clientWidth,
            );
            assertEquals(
                hasAskHScroll,
                false,
                "Ask must have zero horizontal overflow on mobile",
            );

            // 2. Desktop sidebar not occupying main space (<900px display: none)
            const sidebarDisplay = await page.locator(".ask-sidebar").evaluate(
                (el) => globalThis.getComputedStyle(el).display,
            );
            assertEquals(sidebarDisplay, "none");

            // 3. Mobile drawer trigger is visible
            const drawerBtn = page.locator(
                '[data-slot="button"].ask-header__drawer-toggle',
            );
            await drawerBtn.waitFor({ state: "visible" });

            // 4. Drawer initially closed
            const drawerContent = page.locator(".ask-history-sheet");
            const drawerInitiallyOpen = await drawerContent.count() > 0 &&
                await drawerContent.isVisible();
            assertEquals(
                drawerInitiallyOpen,
                false,
                "Drawer must be initially closed",
            );

            // 5. Drawer can open and close
            await drawerBtn.click();
            await drawerContent.waitFor({ state: "visible" });
            await page.waitForFunction(() =>
                document.querySelector(".ask-history-sheet")
                    ?.contains(document.activeElement)
            );

            // Close drawer
            await page.keyboard.press("Escape");
            await drawerContent.waitFor({ state: "hidden" });

            // 6. Composer width and send button touch target
            const composerSurface = page.locator(".ask-composer-surface")
                .first();
            const composerBox = await composerSurface.boundingBox();
            assert(composerBox);
            assert(
                composerBox.width <= 390,
                "Composer width must fit within mobile screen",
            );

            const sendBtn = page.locator(".ask-composer__send-btn").first();
            const sendBox = await sendBtn.boundingBox();
            assert(sendBox);
            assert(
                sendBox.width >= 44 && sendBox.height >= 44,
                `Send button touch target must be >= 44x44px (got ${sendBox.width}x${sendBox.height})`,
            );

            await page.screenshot({
                path: `${artifactDir}/ask-workbench-390.png`,
            });

            metricsRecord["390x844"] = {
                settingsHorizontalOverflow: hasSettingsHScroll,
                askHorizontalOverflow: hasAskHScroll,
                mobileSendBtnSize: {
                    width: sendBox.width,
                    height: sendBox.height,
                },
            };

            await context.close();
        },
    );

    // =========================================================================
    // Step 4: 768x1024 touch: settings window navigation keeps touch targets
    // =========================================================================
    await t.step(
        "768x1024 touch: settings window navigation rows are touch targets",
        async () => {
            const context = await browser.newContext({
                viewport: { width: 768, height: 1024 },
                isMobile: true,
                hasTouch: true,
            });
            const page = await context.newPage();
            await loginAndVisit(page, app.origin, "/settings/appearance", user);
            const settings = page.locator(".settings-layout:visible");
            assertEquals(
                await settings.getAttribute("data-host-narrow"),
                "true",
            );
            await settings.getByRole("link", { name: "设置", exact: true })
                .click();
            await settings.locator(".settings-nav-item:visible").first()
                .waitFor();
            assertEquals(await settings.getAttribute("data-view"), "list");
            const items = settings.locator(".settings-nav-item");
            await items.first().waitFor({ state: "visible" });
            for (let i = 0; i < await items.count(); i++) {
                const box = await items.nth(i).boundingBox();
                assert(box);
                assert(
                    box.height >= 44,
                    `Settings nav row ${i} must be >= 44px tall on touch (got ${box.height})`,
                );
            }
            await context.close();
        },
    );

    // =========================================================================
    // Step 5: 390x844 touch: text links that act as controls are touch targets
    // =========================================================================
    await t.step(
        "390x844 touch: admin overview actions and the auth switch link are touch targets",
        async () => {
            await app.store.run(async (db) => {
                await db.update(users).set({ role: "admin" }).where(
                    eq(users.id, user.userId),
                );
            });
            const context = await browser.newContext({
                viewport: { width: 390, height: 844 },
                isMobile: true,
                hasTouch: true,
            });
            const page = await context.newPage();
            await loginAndVisit(page, app.origin, "/admin", user);
            const actions = page.locator(".admin-stat-action");
            await actions.first().waitFor({ state: "visible" });
            for (let i = 0; i < await actions.count(); i++) {
                const box = await actions.nth(i).boundingBox();
                assert(box);
                assert(
                    box.height >= 44,
                    `Admin overview action ${i} must be >= 44px tall (got ${box.height})`,
                );
            }

            const guest = await browser.newContext({
                viewport: { width: 390, height: 844 },
                isMobile: true,
                hasTouch: true,
            });
            const guestPage = await guest.newPage();
            await guestPage.goto(app.origin + "/login");
            const link = guestPage.locator(".auth-footer a");
            await link.waitFor({ state: "visible" });
            const box = await link.boundingBox();
            assert(box);
            assert(
                box.width >= 44 && box.height >= 44,
                `Auth switch link must be >= 44x44px (got ${box.width}x${box.height})`,
            );
            await guest.close();
            await context.close();
        },
    );

    // Write final metrics JSON
    await Deno.writeTextFile(
        `${artifactDir}/route-style-metrics.json`,
        JSON.stringify(metricsRecord, null, 2),
    );
});

interface BoxMetrics {
    x: number;
    y: number;
    width: number;
    height: number;
    left: number;
    top: number;
    right: number;
    bottom: number;
}

interface SettingsRowSnapshot {
    viewportWidth: number;
    viewportHeight: number;
    docScrollWidth: number;
    docClientWidth: number;
    rowRect: BoxMetrics;
    rowContentWidth: number;
    labelRect: BoxMetrics;
    titleRect: BoxMetrics;
    titleFontSize: number;
    titleLineHeight: number;
    titleLineCount: number;
    titleNaturalWidth: number;
    descRect: BoxMetrics | null;
    descText: string;
    controlRect: BoxMetrics;
}

async function measureSettingsRowByTitle(
    page: Page,
    titleText: string,
): Promise<SettingsRowSnapshot> {
    await page.getByText(titleText, { exact: true }).first().waitFor({
        state: "visible",
    });
    const snapshot = await page.evaluate((targetTitle) => {
        const toBox = (rect: DOMRect): BoxMetrics => ({
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
        });
        const rows = Array.from(
            document.querySelectorAll<HTMLElement>(".settings-row"),
        );
        const row = rows.find((candidate) => {
            const titleEl = candidate.querySelector<HTMLElement>(
                ".settings-row-title",
            );
            return titleEl?.textContent?.trim() === targetTitle;
        });
        if (!row) return null;
        row.scrollIntoView({ block: "nearest" });

        const labelEl = row.querySelector<HTMLElement>(".settings-row-label");
        const titleEl = row.querySelector<HTMLElement>(".settings-row-title");
        const descEl = row.querySelector<HTMLElement>(".settings-row-desc");
        const controlEl = row.querySelector<HTMLElement>(
            ".settings-row-control",
        );
        if (!labelEl || !titleEl || !controlEl) return null;

        const rowCs = globalThis.getComputedStyle(row);
        const titleCs = globalThis.getComputedStyle(titleEl);
        const rowRect = row.getBoundingClientRect();
        const padLeft = Number.parseFloat(rowCs.paddingLeft) || 0;
        const padRight = Number.parseFloat(rowCs.paddingRight) || 0;
        const rowContentWidth = Math.max(0, rowRect.width - padLeft - padRight);

        const range = document.createRange();
        range.selectNodeContents(titleEl);
        const clientRects = Array.from(range.getClientRects()).filter(
            (r) => r.width > 0.5 && r.height > 0.5,
        );
        const lineYs: number[] = [];
        for (const r of clientRects) {
            if (!lineYs.some((y) => Math.abs(y - r.top) <= 3)) {
                lineYs.push(r.top);
            }
        }
        const titleLineCount = Math.max(1, lineYs.length);
        const titleNaturalWidth = clientRects.reduce(
            (sum, r) => sum + r.width,
            0,
        );
        const titleFontSize = Number.parseFloat(titleCs.fontSize) || 14;
        const parsedLineHeight = Number.parseFloat(titleCs.lineHeight);
        const titleLineHeight = Number.isFinite(parsedLineHeight)
            ? parsedLineHeight
            : titleFontSize * 1.4;

        return {
            viewportWidth: globalThis.innerWidth,
            viewportHeight: globalThis.innerHeight,
            docScrollWidth: document.documentElement.scrollWidth,
            docClientWidth: document.documentElement.clientWidth,
            rowRect: toBox(rowRect),
            rowContentWidth,
            labelRect: toBox(labelEl.getBoundingClientRect()),
            titleRect: toBox(titleEl.getBoundingClientRect()),
            titleFontSize,
            titleLineHeight,
            titleLineCount,
            titleNaturalWidth,
            descRect: descEl ? toBox(descEl.getBoundingClientRect()) : null,
            descText: descEl?.textContent?.trim() ?? "",
            controlRect: toBox(controlEl.getBoundingClientRect()),
        };
    }, titleText);
    assert(snapshot, `SettingsRow with title "${titleText}" must exist`);
    return snapshot;
}

function assertShortLabelReadingCapacity(
    snap: SettingsRowSnapshot,
    contextLabel: string,
) {
    assert(
        snap.docScrollWidth <= snap.docClientWidth,
        `${contextLabel}: document must not overflow horizontally (scrollWidth=${snap.docScrollWidth}, clientWidth=${snap.docClientWidth})`,
    );
    assert(
        snap.rowRect.left >= -1 &&
            snap.rowRect.right <= snap.viewportWidth + 1,
        `${contextLabel}: row must stay inside viewport (${snap.rowRect.left}..${snap.rowRect.right} vs ${snap.viewportWidth})`,
    );
    const minExpectedLabelWidth = Math.min(
        snap.rowContentWidth,
        snap.titleFontSize * 7.5,
    );
    assert(
        snap.labelRect.width >= minExpectedLabelWidth - 1 &&
            snap.labelRect.width >= 100,
        `${contextLabel}: short label must keep >= ~8em reading capacity (got ${snap.labelRect.width}px, minExpected=${minExpectedLabelWidth}px)`,
    );
    assert(
        snap.labelRect.width >= snap.titleNaturalWidth - 1,
        `${contextLabel}: label width (${snap.labelRect.width}px) must fit full natural title width (${snap.titleNaturalWidth}px)`,
    );
    assertEquals(
        snap.titleLineCount,
        1,
        `${contextLabel}: short title must render on a single line (got ${snap.titleLineCount} lines, labelWidth=${snap.labelRect.width}px)`,
    );
    assert(
        snap.titleRect.height <= snap.titleLineHeight * 1.45,
        `${contextLabel}: short title height (${snap.titleRect.height}px) must stay single-line (lineHeight=${snap.titleLineHeight}px)`,
    );
    assert(
        snap.controlRect.top >= snap.labelRect.bottom - 1 ||
            snap.controlRect.left >= snap.labelRect.right - 1,
        `${contextLabel}: control group must not overlap label`,
    );
    assert(
        snap.controlRect.left >= snap.rowRect.left - 1 &&
            snap.controlRect.right <= snap.rowRect.right + 1 &&
            snap.controlRect.right <= snap.viewportWidth + 1,
        `${contextLabel}: control group must stay inside row and viewport`,
    );
}

function boxesOverlap(a: BoxMetrics, b: BoxMetrics): boolean {
    return (
        a.left < b.right - 1 &&
        a.right > b.left + 1 &&
        a.top < b.bottom - 1 &&
        a.bottom > b.top + 1
    );
}

Deno.test(
    "Composite SettingsRow Capacity and Consumer Acceptance Matrix",
    async (t) => {
        await using cleanup = new AsyncDisposableStack();
        const app = await startProductionApp();
        cleanup.defer(() => app.close());

        const user = await app.seedAskFixtureUser();
        await app.store.run(async (db) => {
            await db.update(users).set({ role: "admin" }).where(
                eq(users.id, user.userId),
            );
        });

        const artifactDir = await createEvidenceDirectory(
            "settings-row-capacity",
        );
        const browser = await chromium.launch({
            handleSIGTERM: false,
            headless: true,
            args: ["--no-sandbox"],
        });
        cleanup.defer(() => browser.close());

        const matrixMetrics: Record<string, unknown> = {};

        const MATRIX_VIEWPORTS = [
            { width: 320, height: 568, screenshotThemes: [] as const },
            {
                width: 390,
                height: 844,
                screenshotThemes: ["light", "dark"] as const,
            },
            { width: 640, height: 800, screenshotThemes: [] as const },
            {
                width: 768,
                height: 1024,
                screenshotThemes: ["light", "dark"] as const,
            },
            { width: 1024, height: 768, screenshotThemes: [] as const },
            { width: 1366, height: 768, screenshotThemes: [] as const },
            {
                width: 1440,
                height: 900,
                screenshotThemes: ["light", "dark"] as const,
            },
            { width: 1920, height: 1080, screenshotThemes: [] as const },
            { width: 844, height: 390, screenshotThemes: [] as const },
        ] as const;

        // =====================================================================
        // Step 1: 9-Viewport Consumer Matrix on /settings/ai & /admin/backup
        // =====================================================================
        await t.step(
            "9-viewport consumer matrix on /settings/ai and /admin/backup with 390/768/1440 light/dark evidence",
            async () => {
                const context = await browser.newContext({
                    viewport: { width: 1440, height: 900 },
                    colorScheme: "light",
                    reducedMotion: "reduce",
                });
                cleanup.defer(() => context.close());
                const page = await context.newPage();

                await loginAndVisit(page, app.origin, "/settings/ai", user);
                await page.locator(".settings-content").waitFor({
                    state: "visible",
                });

                for (const vp of MATRIX_VIEWPORTS) {
                    const themesToCheck = vp.screenshotThemes.length > 0
                        ? vp.screenshotThemes
                        : (["light"] as const);
                    await page.setViewportSize({
                        width: vp.width,
                        height: vp.height,
                    });

                    for (const theme of themesToCheck) {
                        await page.emulateMedia({
                            colorScheme: theme,
                            reducedMotion: "reduce",
                        });
                        await page.waitForFunction(
                            (expected) =>
                                document.documentElement.dataset.theme ===
                                    expected,
                            theme,
                        );

                        // --- 1A. /settings/ai ---
                        await spaNavigate(page, "/settings/ai");
                        await page.locator(".settings-content").waitFor({
                            state: "visible",
                        });
                        const aiTag =
                            `/settings/ai@${vp.width}x${vp.height}-${theme}`;
                        const modelSnap = await measureSettingsRowByTitle(
                            page,
                            "标准稳定模型",
                        );
                        assertShortLabelReadingCapacity(modelSnap, aiTag);
                        assert(
                            modelSnap.descRect,
                            `${aiTag}: model description must be rendered`,
                        );
                        for (
                            const token of [
                                "mock-model-standard",
                                "文本",
                                "工具",
                                "流式",
                            ]
                        ) {
                            assert(
                                modelSnap.descText.includes(token),
                                `${aiTag}: model description must include "${token}" (got "${modelSnap.descText}")`,
                            );
                        }
                        assert(
                            modelSnap.descRect.width >=
                                    Math.min(
                                            modelSnap.rowContentWidth,
                                            modelSnap.titleFontSize * 7.5,
                                        ) - 1 &&
                                modelSnap.descRect.right <=
                                    modelSnap.rowRect.right + 1,
                            `${aiTag}: model description must have readable width within row (got ${modelSnap.descRect.width}px)`,
                        );

                        const modelControls = await page.evaluate(() => {
                            const toBox = (rect: DOMRect) => ({
                                x: rect.x,
                                y: rect.y,
                                width: rect.width,
                                height: rect.height,
                                left: rect.left,
                                top: rect.top,
                                right: rect.right,
                                bottom: rect.bottom,
                            });
                            const row = Array.from(
                                document.querySelectorAll<HTMLElement>(
                                    ".settings-row",
                                ),
                            ).find(
                                (r) =>
                                    r.querySelector(".settings-row-title")
                                        ?.textContent?.trim() ===
                                        "标准稳定模型",
                            );
                            if (!row) return null;
                            const toggles = Array.from(
                                row.querySelectorAll<HTMLElement>(
                                    ".ai-model-toggle",
                                ),
                            );
                            const configBtn = Array.from(
                                row.querySelectorAll<HTMLElement>("button"),
                            ).find((b) => b.textContent?.trim() === "推理设置");
                            if (toggles.length !== 3 || !configBtn) return null;
                            const items = [...toggles, configBtn];
                            return items.map((el) => {
                                el.scrollIntoView({ block: "nearest" });
                                const rect = el.getBoundingClientRect();
                                const cx = rect.left + rect.width / 2;
                                const cy = rect.top + rect.height / 2;
                                const hit = document.elementFromPoint(cx, cy);
                                return {
                                    text: el.textContent?.trim() ?? "",
                                    box: toBox(rect),
                                    reachable: Boolean(
                                        hit &&
                                            (el === hit || el.contains(hit) ||
                                                hit.contains(el)),
                                    ),
                                };
                            });
                        });
                        assert(
                            modelControls && modelControls.length === 4,
                            `${aiTag}: all 4 model controls (启用/可见/默认/推理设置) must exist`,
                        );
                        assertEquals(
                            modelControls.map((c) => c.text),
                            ["启用", "可见", "默认", "推理设置"],
                        );
                        if (
                            modelSnap.controlRect.top >=
                                modelSnap.labelRect.bottom - 1
                        ) {
                            assert(
                                Math.abs(
                                    modelControls[0].box.left -
                                        modelSnap.labelRect.left,
                                ) <= 2,
                                `${aiTag}: stacked model controls must align with label start (controlLeft=${
                                    modelControls[0].box.left
                                }, labelLeft=${modelSnap.labelRect.left})`,
                            );
                        }
                        for (let i = 0; i < modelControls.length; i++) {
                            const ctrl = modelControls[i];
                            assert(
                                ctrl.box.width > 0 && ctrl.box.height > 0,
                                `${aiTag}: control "${ctrl.text}" must have positive size`,
                            );
                            assert(
                                ctrl.box.left >= modelSnap.rowRect.left - 1 &&
                                    ctrl.box.right <=
                                        modelSnap.rowRect.right + 1 &&
                                    ctrl.box.right <= vp.width + 1,
                                `${aiTag}: control "${ctrl.text}" must stay inside row and viewport`,
                            );
                            assert(
                                ctrl.reachable,
                                `${aiTag}: control "${ctrl.text}" must be hit-test reachable`,
                            );
                            for (let j = i + 1; j < modelControls.length; j++) {
                                assert(
                                    !boxesOverlap(
                                        ctrl.box,
                                        modelControls[j].box,
                                    ),
                                    `${aiTag}: controls "${ctrl.text}" and "${
                                        modelControls[j].text
                                    }" must not overlap`,
                                );
                            }
                        }

                        if (vp.screenshotThemes.length > 0) {
                            await page.screenshot({
                                path:
                                    `${artifactDir}/settings-ai-${vp.width}x${vp.height}-${theme}.png`,
                            });
                        }

                        // --- 1B. /admin/backup ---
                        await spaNavigate(page, "/admin/backup");
                        await page.locator(".admin-panel").waitFor({
                            state: "visible",
                        });
                        const backupTag =
                            `/admin/backup@${vp.width}x${vp.height}-${theme}`;

                        for (
                            const rowTitle of [
                                "导出配置",
                                "导入配置",
                                "创建备份",
                                "备份文件",
                            ]
                        ) {
                            const rowSnap = await measureSettingsRowByTitle(
                                page,
                                rowTitle,
                            );
                            assertShortLabelReadingCapacity(
                                rowSnap,
                                `${backupTag}[${rowTitle}]`,
                            );
                        }

                        const backupFileSnap = await measureSettingsRowByTitle(
                            page,
                            "备份文件",
                        );
                        assert(
                            backupFileSnap.labelRect.height <=
                                backupFileSnap.titleLineHeight * 1.5,
                            `${backupTag}: "备份文件" label height must stay single-line (got ${backupFileSnap.labelRect.height}px)`,
                        );

                        const backupFileItems = await page.evaluate(() => {
                            const toBox = (rect: DOMRect) => ({
                                x: rect.x,
                                y: rect.y,
                                width: rect.width,
                                height: rect.height,
                                left: rect.left,
                                top: rect.top,
                                right: rect.right,
                                bottom: rect.bottom,
                            });
                            const row = Array.from(
                                document.querySelectorAll<HTMLElement>(
                                    ".settings-row",
                                ),
                            ).find(
                                (r) =>
                                    r.querySelector(".settings-row-title")
                                        ?.textContent?.trim() === "备份文件",
                            );
                            if (!row) return null;
                            const buttons = Array.from(
                                row.querySelectorAll<HTMLElement>("button"),
                            );
                            const statusEl = row.querySelector<HTMLElement>(
                                ".admin-file-placeholder, .admin-file-name",
                            );
                            if (buttons.length !== 2 || !statusEl) return null;
                            const chooseBtn = buttons[0];
                            chooseBtn.scrollIntoView({ block: "nearest" });
                            const chooseRect = chooseBtn
                                .getBoundingClientRect();
                            const hit = document.elementFromPoint(
                                chooseRect.left + chooseRect.width / 2,
                                chooseRect.top + chooseRect.height / 2,
                            );
                            return {
                                chooseBox: toBox(chooseRect),
                                chooseReachable: Boolean(
                                    hit &&
                                        (chooseBtn === hit ||
                                            chooseBtn.contains(hit)),
                                ),
                                statusBox: toBox(
                                    statusEl.getBoundingClientRect(),
                                ),
                                validateBox: toBox(
                                    buttons[1].getBoundingClientRect(),
                                ),
                            };
                        });
                        assert(
                            backupFileItems,
                            `${backupTag}: "备份文件" controls must exist`,
                        );
                        assert(
                            backupFileItems.chooseReachable,
                            `${backupTag}: "选择 ZIP 文件" button must be hit-test reachable`,
                        );
                        if (
                            backupFileSnap.controlRect.top >=
                                backupFileSnap.labelRect.bottom - 1
                        ) {
                            assert(
                                Math.abs(
                                    backupFileItems.chooseBox.left -
                                        backupFileSnap.labelRect.left,
                                ) <= 2,
                                `${backupTag}: stacked backup file controls must align with label start (chooseLeft=${backupFileItems.chooseBox.left}, labelLeft=${backupFileSnap.labelRect.left})`,
                            );
                        }
                        for (
                            const [name, box] of [
                                ["chooseBtn", backupFileItems.chooseBox],
                                ["fileStatus", backupFileItems.statusBox],
                                ["validateBtn", backupFileItems.validateBox],
                            ] as const
                        ) {
                            assert(
                                box.left >= backupFileSnap.rowRect.left - 1 &&
                                    box.right <=
                                        backupFileSnap.rowRect.right + 1 &&
                                    box.right <= vp.width + 1,
                                `${backupTag}: ${name} must stay within row and viewport`,
                            );
                        }
                        assert(
                            !boxesOverlap(
                                backupFileItems.chooseBox,
                                backupFileItems.validateBox,
                            ),
                            `${backupTag}: choose ZIP and pre-validate buttons must not overlap`,
                        );

                        if (vp.screenshotThemes.length > 0) {
                            await page.screenshot({
                                path:
                                    `${artifactDir}/admin-backup-${vp.width}x${vp.height}-${theme}.png`,
                            });
                        }

                        matrixMetrics[`${vp.width}x${vp.height}-${theme}`] = {
                            aiModelRow: {
                                labelWidth: modelSnap.labelRect.width,
                                rowHeight: modelSnap.rowRect.height,
                                titleLineCount: modelSnap.titleLineCount,
                            },
                            adminBackupRow: {
                                labelWidth: backupFileSnap.labelRect.width,
                                rowHeight: backupFileSnap.rowRect.height,
                                titleLineCount: backupFileSnap.titleLineCount,
                            },
                        };
                    }
                }
            },
        );

        // =====================================================================
        // Step 2: Long Model Name & Long Backup/Config Filename Stress Checks
        // =====================================================================
        await t.step(
            "Long model names and long filenames wrap cleanly without pushing actions out of row",
            async () => {
                const longModelRowId = `model_long_${crypto.randomUUID()}`;
                const longDisplayName =
                    "超长企业级推理模型名称_DeepSeek_R1_Distill_Qwen_32B_Preview_LongUnbrokenToken_2026";
                const longModelId =
                    "organization-inference-gateway/deepseek-r1-distill-qwen-32b-long-context-preview-20261026-v2";
                await app.store.run(async (db) => {
                    await db.insert(aiModels).values({
                        id: longModelRowId,
                        providerId: user.providerId,
                        modelId: longModelId,
                        displayName: longDisplayName,
                        enabled: true,
                        visibleToUsers: true,
                        supportsText: true,
                        supportsVision: true,
                        supportsTools: true,
                        supportsStreaming: true,
                        isDefault: false,
                        updatedAt: Date.now(),
                    });
                });

                const context = await browser.newContext({
                    viewport: { width: 390, height: 844 },
                    colorScheme: "light",
                    reducedMotion: "reduce",
                });
                cleanup.defer(() => context.close());
                const page = await context.newPage();

                await loginAndVisit(page, app.origin, "/settings/ai", user);
                await page.locator(".settings-content").waitFor({
                    state: "visible",
                });

                for (
                    const vp of [
                        { width: 320, height: 568 },
                        { width: 390, height: 844 },
                        { width: 1440, height: 900 },
                    ]
                ) {
                    await page.setViewportSize(vp);
                    const snap = await measureSettingsRowByTitle(
                        page,
                        longDisplayName,
                    );
                    assert(
                        snap.docScrollWidth <= snap.docClientWidth,
                        `/settings/ai long model @${vp.width}: zero horizontal overflow`,
                    );
                    assert(
                        snap.labelRect.width >=
                                Math.min(
                                        snap.rowContentWidth,
                                        snap.titleFontSize * 7.5,
                                    ) - 1 &&
                            snap.titleRect.right <= snap.rowRect.right + 1 &&
                            (snap.descRect?.right ?? 0) <=
                                snap.rowRect.right + 1,
                        `/settings/ai long model @${vp.width}: title and description wrap within row`,
                    );
                    const controlsInside = await page.evaluate(
                        (targetTitle) => {
                            const row = Array.from(
                                document.querySelectorAll<HTMLElement>(
                                    ".settings-row",
                                ),
                            ).find(
                                (r) =>
                                    r.querySelector(".settings-row-title")
                                        ?.textContent?.trim() === targetTitle,
                            );
                            if (!row) return null;
                            const rowRect = row.getBoundingClientRect();
                            const controls = Array.from(
                                row.querySelectorAll<HTMLElement>(
                                    ".ai-model-toggle, .ai-model-controls button",
                                ),
                            );
                            return controls.map((el) => {
                                const r = el.getBoundingClientRect();
                                return {
                                    text: el.textContent?.trim() ?? "",
                                    insideRow: r.left >= rowRect.left - 1 &&
                                        r.right <= rowRect.right + 1 &&
                                        r.right <= globalThis.innerWidth + 1 &&
                                        r.width > 0 &&
                                        r.height > 0,
                                };
                            });
                        },
                        longDisplayName,
                    );
                    assert(
                        controlsInside && controlsInside.length === 4 &&
                            controlsInside.every((c) => c.insideRow),
                        `/settings/ai long model @${vp.width}: all 4 controls remain inside row (${
                            JSON.stringify(controlsInside)
                        })`,
                    );
                }

                await app.store.run(async (db) => {
                    await db.delete(aiModels).where(
                        eq(aiModels.id, longModelRowId),
                    );
                });

                // Long filenames on /admin/backup (both horizontal "导入配置" and vertical "备份文件")
                await spaNavigate(page, "/admin/backup");
                await page.locator(".admin-panel").waitFor({
                    state: "visible",
                });
                const configExportRes = await page.request.get(
                    `${app.origin}/api/admin/system/config/export`,
                );
                assertEquals(configExportRes.status(), 200);
                const configBytes = await configExportRes.body();
                const longConfigFileName =
                    "searcher-system-configuration-export-2026-10-26-extra-long-unbroken-filename-segment-9876543210.json";
                const longZipFileName =
                    "searcher-production-full-backup-archive-2026-10-26-extra-long-filename-without-spaces-verylongsegment1234567890.zip";

                await page.locator("#config-import-file").setInputFiles({
                    name: longConfigFileName,
                    mimeType: "application/json",
                    buffer: configBytes,
                });
                await page.locator("#config-import-file-filename").waitFor({
                    state: "visible",
                });
                await page.locator('.status-banner:has-text("配置已导入")')
                    .waitFor({
                        state: "visible",
                    });

                await page.locator("#backup-restore-file").setInputFiles({
                    name: longZipFileName,
                    mimeType: "application/zip",
                    buffer: Buffer.from("unvalidated-file"),
                });
                await page.locator("#backup-restore-file-filename").waitFor({
                    state: "visible",
                });

                for (
                    const vp of [
                        { width: 320, height: 568 },
                        { width: 390, height: 844 },
                        { width: 1440, height: 900 },
                    ]
                ) {
                    await page.setViewportSize(vp);
                    for (
                        const [rowTitle, fileId] of [
                            ["导入配置", "config-import-file-filename"],
                            ["备份文件", "backup-restore-file-filename"],
                        ] as const
                    ) {
                        const rowSnap = await measureSettingsRowByTitle(
                            page,
                            rowTitle,
                        );
                        assertShortLabelReadingCapacity(
                            rowSnap,
                            `/admin/backup long filename ${rowTitle}@${vp.width}`,
                        );
                        const fileMetrics = await page.evaluate(
                            ({ targetTitle, targetFileId }) => {
                                const row = Array.from(
                                    document.querySelectorAll<HTMLElement>(
                                        ".settings-row",
                                    ),
                                ).find(
                                    (r) =>
                                        r.querySelector(".settings-row-title")
                                            ?.textContent?.trim() ===
                                            targetTitle,
                                );
                                const fileEl = document.getElementById(
                                    targetFileId,
                                );
                                if (!row || !fileEl) return null;
                                const rowRect = row.getBoundingClientRect();
                                const fileRect = fileEl.getBoundingClientRect();
                                const buttons = Array.from(
                                    row.querySelectorAll<HTMLElement>("button"),
                                ).map((b) => {
                                    const r = b.getBoundingClientRect();
                                    return {
                                        text: b.textContent?.trim() ?? "",
                                        inside: r.left >= rowRect.left - 1 &&
                                            r.right <= rowRect.right + 1 &&
                                            r.right <=
                                                globalThis.innerWidth + 1 &&
                                            r.width > 0 &&
                                            r.height > 0,
                                    };
                                });
                                return {
                                    fileWidth: fileRect.width,
                                    fileInsideRow:
                                        fileRect.left >= rowRect.left - 1 &&
                                        fileRect.right <= rowRect.right + 1 &&
                                        fileRect.right <=
                                            globalThis.innerWidth + 1,
                                    buttons,
                                };
                            },
                            { targetTitle: rowTitle, targetFileId: fileId },
                        );
                        assert(
                            fileMetrics && fileMetrics.fileWidth >= 60 &&
                                fileMetrics.fileInsideRow &&
                                fileMetrics.buttons.every((b) => b.inside),
                            `/admin/backup long filename ${rowTitle}@${vp.width}: filename and buttons must stay readable and inside row (${
                                JSON.stringify(fileMetrics)
                            })`,
                        );
                    }
                }
            },
        );

        // =====================================================================
        // Step 3: Ordinary SettingsRow Single-Value Input/Select Right-Align & Focus
        // =====================================================================
        await t.step(
            "Ordinary SettingsRow single-value Input/Select right alignment and keyboard focus on /settings/appearance, /account, and /admin/settings",
            async () => {
                const context = await browser.newContext({
                    viewport: { width: 1440, height: 900 },
                    colorScheme: "light",
                    reducedMotion: "reduce",
                });
                cleanup.defer(() => context.close());
                const page = await context.newPage();

                await loginAndVisit(
                    page,
                    app.origin,
                    "/settings/appearance",
                    user,
                );
                await page.locator(".settings-content").waitFor({
                    state: "visible",
                });

                for (
                    const vp of [
                        { width: 390, height: 844 },
                        { width: 1440, height: 900 },
                    ]
                ) {
                    await page.setViewportSize(vp);

                    // 3A. /settings/appearance ordinary rows
                    await spaNavigate(page, "/settings/appearance");
                    await page.locator(".settings-content").waitFor({
                        state: "visible",
                    });
                    for (const title of ["显示日期", "显示时间"]) {
                        const snap = await measureSettingsRowByTitle(
                            page,
                            title,
                        );
                        assertShortLabelReadingCapacity(
                            snap,
                            `/settings/appearance[${title}]@${vp.width}`,
                        );
                        assert(
                            snap.controlRect.left >= snap.labelRect.right - 1,
                            `/settings/appearance[${title}]@${vp.width}: switch stays on same horizontal line to the right of label`,
                        );
                    }

                    // 3B. /account single-value Input rows
                    await spaNavigate(page, "/account");
                    await page.getByRole("textbox", { name: "显示名称" })
                        .waitFor({
                            state: "visible",
                        });
                    for (const title of ["用户名", "显示名称", "邮箱"]) {
                        const snap = await measureSettingsRowByTitle(
                            page,
                            title,
                        );
                        assertShortLabelReadingCapacity(
                            snap,
                            `/account[${title}]@${vp.width}`,
                        );
                    }
                    for (const fieldName of ["显示名称", "邮箱"]) {
                        const input = page.getByRole("textbox", {
                            name: fieldName,
                        });
                        await input.focus();
                        const fieldCheck = await input.evaluate((el) => {
                            const cs = globalThis.getComputedStyle(el);
                            const row = el.closest(".settings-row");
                            const label = row?.querySelector(
                                ".settings-row-label",
                            );
                            const rRect = row?.getBoundingClientRect();
                            const lRect = label?.getBoundingClientRect();
                            const iRect = el.getBoundingClientRect();
                            return {
                                active: document.activeElement === el,
                                textAlign: cs.textAlign,
                                hasFocusIndicator: cs.boxShadow !== "none" ||
                                    (cs.outlineStyle !== "none" &&
                                        cs.outlineWidth !== "0px"),
                                clearOfLabel: Boolean(
                                    lRect && (
                                        iRect.left >= lRect.right - 1 ||
                                        iRect.top >= lRect.bottom - 1
                                    ),
                                ),
                                rightEdgeGap: rRect
                                    ? rRect.right - iRect.right
                                    : 999,
                            };
                        });
                        assert(
                            fieldCheck.active,
                            `/account[${fieldName}]@${vp.width}: input must receive focus`,
                        );
                        assert(
                            fieldCheck.textAlign === "end" ||
                                fieldCheck.textAlign === "right",
                            `/account[${fieldName}]@${vp.width}: inline input must right-align value (got ${fieldCheck.textAlign})`,
                        );
                        assert(
                            fieldCheck.hasFocusIndicator,
                            `/account[${fieldName}]@${vp.width}: focused input must show focus ring`,
                        );
                        assert(
                            fieldCheck.clearOfLabel &&
                                fieldCheck.rightEdgeGap <= 32,
                            `/account[${fieldName}]@${vp.width}: inline input must sit at right edge of row (gap=${fieldCheck.rightEdgeGap}px)`,
                        );
                    }

                    // 3C. /admin/settings single-value Select & Input rows
                    await spaNavigate(page, "/admin/settings");
                    await page.getByRole("combobox", { name: "默认搜索引擎" })
                        .waitFor({
                            state: "visible",
                        });
                    for (
                        const [rowTitle, selectLabel] of [
                            ["搜索引擎", "默认搜索引擎"],
                            ["界面主题", "默认界面主题"],
                            ["结果打开方式", "搜索结果打开方式"],
                        ] as const
                    ) {
                        const snap = await measureSettingsRowByTitle(
                            page,
                            rowTitle,
                        );
                        assertShortLabelReadingCapacity(
                            snap,
                            `/admin/settings[${rowTitle}]@${vp.width}`,
                        );
                        const select = page.getByRole("combobox", {
                            name: selectLabel,
                        });
                        await select.focus();
                        const selectCheck = await select.evaluate((el) => {
                            const cs = globalThis.getComputedStyle(el);
                            const row = el.closest(".settings-row");
                            const label = row?.querySelector(
                                ".settings-row-label",
                            );
                            const rRect = row?.getBoundingClientRect();
                            const lRect = label?.getBoundingClientRect();
                            const sRect = el.getBoundingClientRect();
                            return {
                                active: document.activeElement === el,
                                textAlign: cs.textAlign,
                                textAlignLast: cs.textAlignLast,
                                hasFocusIndicator: cs.boxShadow !== "none" ||
                                    (cs.outlineStyle !== "none" &&
                                        cs.outlineWidth !== "0px"),
                                toRightOfLabel: Boolean(
                                    lRect && sRect.left >= lRect.right - 1,
                                ),
                                rightEdgeGap: rRect
                                    ? rRect.right - sRect.right
                                    : 999,
                            };
                        });
                        assert(
                            selectCheck.active,
                            `/admin/settings[${rowTitle}]@${vp.width}: select must receive focus`,
                        );
                        assert(
                            selectCheck.textAlignLast === "end" ||
                                selectCheck.textAlignLast === "right" ||
                                selectCheck.textAlign === "end" ||
                                selectCheck.textAlign === "right",
                            `/admin/settings[${rowTitle}]@${vp.width}: inline select must right-align value (textAlign=${selectCheck.textAlign}, textAlignLast=${selectCheck.textAlignLast})`,
                        );
                        assert(
                            selectCheck.hasFocusIndicator,
                            `/admin/settings[${rowTitle}]@${vp.width}: focused select must show focus ring`,
                        );
                        assert(
                            selectCheck.toRightOfLabel &&
                                selectCheck.rightEdgeGap <= 32,
                            `/admin/settings[${rowTitle}]@${vp.width}: inline select must sit at right edge of row (gap=${selectCheck.rightEdgeGap}px)`,
                        );
                    }
                }
            },
        );

        // =====================================================================
        // Step 4: Coarse Pointer >=44px, Tab Order, Model Toggle & Backup Pre-Validate
        // =====================================================================
        await t.step(
            "Coarse pointer >=44px targets, keyboard Tab order, model toggle, and backup file selection + pre-validate pending/disabled",
            async () => {
                const touchContext = await browser.newContext({
                    viewport: { width: 390, height: 844 },
                    isMobile: true,
                    hasTouch: true,
                    colorScheme: "light",
                    reducedMotion: "reduce",
                });
                cleanup.defer(() => touchContext.close());
                const page = await touchContext.newPage();

                await loginAndVisit(page, app.origin, "/settings/ai", user);
                await page.locator(".settings-content").waitFor({
                    state: "visible",
                });
                assert(
                    await page.evaluate(() =>
                        matchMedia("(any-pointer: coarse)").matches
                    ),
                    "Touch context must report (any-pointer: coarse)",
                );

                for (
                    const vp of [
                        { width: 390, height: 844 },
                        { width: 768, height: 1024 },
                    ]
                ) {
                    await page.setViewportSize(vp);
                    await spaNavigate(page, "/settings/ai");
                    await page.getByText("标准稳定模型", { exact: true })
                        .first()
                        .waitFor({ state: "visible" });
                    const aiTouchTargets = await page.evaluate(() => {
                        const row = Array.from(
                            document.querySelectorAll<HTMLElement>(
                                ".settings-row",
                            ),
                        ).find(
                            (r) =>
                                r.querySelector(".settings-row-title")
                                    ?.textContent?.trim() === "标准稳定模型",
                        );
                        if (!row) return null;
                        const toggles = Array.from(
                            row.querySelectorAll<HTMLElement>(
                                ".ai-model-toggle",
                            ),
                        ).map((el) => {
                            const r = el.getBoundingClientRect();
                            return {
                                text: el.textContent?.trim() ?? "",
                                width: r.width,
                                height: r.height,
                            };
                        });
                        const btn = Array.from(
                            row.querySelectorAll<HTMLElement>("button"),
                        ).find((b) => b.textContent?.trim() === "推理设置");
                        const btnRect = btn?.getBoundingClientRect();
                        return {
                            toggles,
                            configBtn: btnRect
                                ? {
                                    width: btnRect.width,
                                    height: btnRect.height,
                                }
                                : null,
                        };
                    });
                    assert(aiTouchTargets && aiTouchTargets.configBtn);
                    for (const toggle of aiTouchTargets.toggles) {
                        assert(
                            toggle.height >= 44,
                            `Coarse pointer @${vp.width}: model toggle "${toggle.text}" height must be >= 44px (got ${toggle.height}px)`,
                        );
                    }
                    assert(
                        aiTouchTargets.configBtn.width >= 44 &&
                            aiTouchTargets.configBtn.height >= 44,
                        `Coarse pointer @${vp.width}: "推理设置" button must be >= 44x44px (got ${aiTouchTargets.configBtn.width}x${aiTouchTargets.configBtn.height})`,
                    );

                    await spaNavigate(page, "/admin/backup");
                    await page.locator(".admin-panel").waitFor({
                        state: "visible",
                    });
                    const backupButtons = page.locator(".admin-panel button");
                    const btnCount = await backupButtons.count();
                    assert(btnCount >= 4);
                    for (let i = 0; i < btnCount; i++) {
                        const box = await backupButtons.nth(i).boundingBox();
                        assert(box);
                        assert(
                            box.width >= 44 && box.height >= 44,
                            `Coarse pointer @${vp.width}: backup button ${i} must be >= 44x44px (got ${box.width}x${box.height})`,
                        );
                    }
                }

                // Tab order and model toggle + reasoning dialog on /settings/ai
                await page.setViewportSize({ width: 390, height: 844 });
                await spaNavigate(page, "/settings/ai");
                const enableCheckbox = page.getByRole("checkbox", {
                    name: "启用 标准稳定模型",
                });
                const visibleCheckbox = page.getByRole("checkbox", {
                    name: "可见 标准稳定模型",
                });
                const defaultRadio = page.getByRole("radio", {
                    name: "设为默认 标准稳定模型",
                });
                const reasoningBtn = page.getByRole("button", {
                    name: "推理设置",
                });
                await enableCheckbox.waitFor({ state: "visible" });

                await enableCheckbox.focus();
                assertEquals(
                    await page.evaluate(() =>
                        document.activeElement?.getAttribute("aria-label")
                    ),
                    "启用 标准稳定模型",
                );
                await page.keyboard.press("Tab");
                assertEquals(
                    await page.evaluate(() =>
                        document.activeElement?.getAttribute("aria-label")
                    ),
                    "可见 标准稳定模型",
                );
                await page.keyboard.press("Tab");
                assertEquals(
                    await page.evaluate(() =>
                        document.activeElement?.getAttribute("aria-label")
                    ),
                    "设为默认 标准稳定模型",
                );
                await page.keyboard.press("Tab");
                assertEquals(
                    await page.evaluate(() =>
                        document.activeElement?.textContent?.trim()
                    ),
                    "推理设置",
                );

                assertEquals(await visibleCheckbox.isChecked(), true);
                await visibleCheckbox.click();
                await page.waitForFunction(() => {
                    const el = document.querySelector<HTMLInputElement>(
                        'input[aria-label="可见 标准稳定模型"]',
                    );
                    return el && !el.checked;
                });
                await visibleCheckbox.click();
                await page.waitForFunction(() => {
                    const el = document.querySelector<HTMLInputElement>(
                        'input[aria-label="可见 标准稳定模型"]',
                    );
                    return el && el.checked;
                });
                assertEquals(await defaultRadio.isChecked(), true);

                await reasoningBtn.click();
                const reasoningDialog = page.getByRole("dialog", {
                    name: "推理设置",
                });
                await reasoningDialog.waitFor({ state: "visible" });
                await page.keyboard.press("Escape");
                await reasoningDialog.waitFor({ state: "hidden" });

                // File selection, Tab order, and pre-validate pending/disabled on /admin/backup
                await spaNavigate(page, "/admin/backup");
                await page.locator(".admin-panel").waitFor({
                    state: "visible",
                });

                const chooseZipBtn = page.getByRole("button", {
                    name: "选择 ZIP 文件",
                });
                const preValidateBtn = page.getByRole("button", {
                    name: "预检验证",
                });
                await chooseZipBtn.waitFor({ state: "visible" });
                assertEquals(
                    await page.locator(".admin-file-placeholder").textContent(),
                    "未选择文件",
                );
                assertEquals(await preValidateBtn.isDisabled(), true);

                const backupZipRes = await page.request.get(
                    `${app.origin}/api/admin/backup/export`,
                );
                assertEquals(backupZipRes.status(), 200);
                const realZipBytes = await backupZipRes.body();

                await page.locator("#backup-restore-file").setInputFiles({
                    name: "searcher-backup-2026-10-26.zip",
                    mimeType: "application/zip",
                    buffer: realZipBytes,
                });
                await page.locator("#backup-restore-file-filename").waitFor({
                    state: "visible",
                });
                assertEquals(
                    await page.locator("#backup-restore-file-filename")
                        .textContent(),
                    "searcher-backup-2026-10-26.zip",
                );
                assertEquals(await preValidateBtn.isDisabled(), false);

                // Tab from "选择 ZIP 文件" skips hidden file input and lands on "预检验证"
                await chooseZipBtn.focus();
                await page.keyboard.press("Tab");
                assertEquals(
                    await page.evaluate(() =>
                        document.activeElement?.textContent?.trim()
                    ),
                    "预检验证",
                );

                const validateGate = Promise.withResolvers<void>();
                await page.route(
                    "**/api/admin/backup/validate",
                    async (route) => {
                        await validateGate.promise;
                        await route.continue();
                    },
                );

                await preValidateBtn.click();
                const pendingValidateBtn = page.getByRole("button", {
                    name: "正在验证…",
                });
                await pendingValidateBtn.waitFor({ state: "visible" });
                assertEquals(await pendingValidateBtn.isDisabled(), true);

                validateGate.resolve();
                await page.locator(
                    '.status-banner:has-text("备份文件校验通过")',
                ).waitFor({
                    state: "visible",
                });
                assertEquals(await preValidateBtn.isDisabled(), false);

                for (
                    const manifestRowTitle of [
                        "生成时间",
                        "用户",
                        "AI 提供商 / 模型",
                        "还原备份",
                    ]
                ) {
                    const snap = await measureSettingsRowByTitle(
                        page,
                        manifestRowTitle,
                    );
                    assertShortLabelReadingCapacity(
                        snap,
                        `/admin/backup manifest[${manifestRowTitle}]@390x844`,
                    );
                }
            },
        );

        await Deno.writeTextFile(
            `${artifactDir}/composite-settings-row-metrics.json`,
            JSON.stringify(matrixMetrics, null, 2),
        );
    },
);

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
    const download = page.getByRole("button", { name: "下载备份 (ZIP)" });
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
        await page.getByRole("button", { name: "预检验证" }).click();
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
    const demoRow = page.locator("tbody tr").filter({
        hasText: "后台演示用户",
    });
    const adminRow = page.locator("tbody tr").filter({
        hasText: "Stability Tester",
    });
    await demoRow.waitFor({ state: "visible" });
    await adminRow.waitFor({ state: "visible" });

    async function assertShortLabels() {
        for (const width of [390, 768]) {
            await page.setViewportSize({ width, height: 844 });
            for (const row of [demoRow, adminRow]) {
                const status = row.locator("td").nth(2).locator("span");
                const lines = await status.evaluate((element) => {
                    const range = document.createRange();
                    range.selectNodeContents(element);
                    return new Set(
                        Array.from(
                            range.getClientRects(),
                            (rect) => Math.round(rect.top),
                        ),
                    ).size;
                });
                assertEquals(lines, 1, `${width}px: status must fit one line`);
            }
            if (width >= 768) {
                const lines = await adminRow.locator("td").nth(1).evaluate(
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
                assertEquals(lines, 1, `${width}px: role must fit one line`);
            }
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
    await demoRow.getByText("已禁用").waitFor({ state: "visible" });
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
    const row = page.locator("tbody tr").filter({ hasText: "创建用户" });
    await row.waitFor({ state: "visible" });
    const shortRow = page.locator("tbody tr").filter({
        hasText: "admin.backup.create",
    });
    await shortRow.waitFor({ state: "visible" });
    const shortTarget = shortRow.locator("td").nth(2);
    assertEquals(
        await shortTarget.getByText("backup", { exact: true }).count(),
        1,
    );
    assertEquals(
        await shortTarget.getByRole("button", { name: "查看对象 ID backup" })
            .count(),
        0,
        "An already complete ID must not add a redundant tab stop",
    );
    const trigger = row.getByRole("button", {
        name: `查看对象 ID ${created.id}`,
    });
    assertEquals(
        await trigger.count(),
        1,
        "Full ID must have an accessible trigger",
    );
    const actionLines = await row.locator("td").nth(1).locator("span").evaluate(
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
});
