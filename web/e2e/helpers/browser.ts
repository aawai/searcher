import {
    type Browser,
    type BrowserContext,
    chromium as playwrightChromium,
    type LaunchOptions,
} from "playwright";

/**
 * Implicit action and wait timeout for local triage, set by
 * `scripts/e2e/run.ts --timeout <ms>` (scripts/e2e/README.md). Unset keeps
 * Playwright's 30s default; waits that pass their own `timeout` keep it.
 */
function triageTimeout(): number | null {
    const value = Deno.env.get("E2E_TIMEOUT_MS");
    if (value === undefined) return null;
    const ms = Number(value);
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(ms)) {
        throw new Error(`E2E_TIMEOUT_MS must be a positive integer: ${value}`);
    }
    return ms;
}

/** Applies the triage timeout to every context and page the browser opens. */
function withTimeout(browser: Browser, ms: number): Browser {
    const newContext = browser.newContext.bind(browser);
    const newPage = browser.newPage.bind(browser);
    browser.newContext = async (options) => {
        const context = await newContext(options);
        context.setDefaultTimeout(ms);
        return context;
    };
    browser.newPage = async (options) => {
        const page = await newPage(options);
        page.context().setDefaultTimeout(ms);
        return page;
    };
    return browser;
}

/** The only Chromium entry for E2E files; `check:e2e` rejects direct imports. */
export const chromium = {
    async launch(options?: LaunchOptions): Promise<Browser> {
        const ms = triageTimeout();
        const browser = await playwrightChromium.launch(options);
        return ms === null ? browser : withTimeout(browser, ms);
    },
    async launchPersistentContext(
        userDataDir: string,
        options?: Parameters<
            typeof playwrightChromium.launchPersistentContext
        >[1],
    ): Promise<BrowserContext> {
        const ms = triageTimeout();
        const context = await playwrightChromium.launchPersistentContext(
            userDataDir,
            options,
        );
        if (ms !== null) context.setDefaultTimeout(ms);
        return context;
    },
};
