import { createEvidenceDirectory } from "./helpers/evidence.ts";
import { assert, assertEquals } from "@std/assert";
import { type Page } from "playwright";
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
            const pageShellBox = await page.locator(".page-shell")
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

            const pageShellBox = await page.locator(".page-shell")
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

    // Write final metrics JSON
    await Deno.writeTextFile(
        `${artifactDir}/route-style-metrics.json`,
        JSON.stringify(metricsRecord, null, 2),
    );
});
