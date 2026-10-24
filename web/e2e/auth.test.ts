import {
    assertEquals,
    assertNotEquals,
    assertStringIncludes,
} from "@std/assert";
import { type Browser, type Page } from "playwright";
import { chromium } from "./helpers/browser.ts";
import {
    AUTH_CREDENTIAL_RULES,
    AUTH_USERNAME_PATTERN,
} from "../../src/shared/contracts.ts";
import { startProductionApp } from "./helpers/production-app.ts";

async function withPage(
    test: (origin: string, page: Page) => Promise<void>,
): Promise<void> {
    const app = await startProductionApp();
    let browser: Browser | undefined;
    try {
        browser = await chromium.launch({
            handleSIGTERM: false,
            headless: true,
            args: ["--no-sandbox"],
        });
        const page = await browser.newPage({ colorScheme: "light" });
        await test(app.origin, page);
    } finally {
        if (browser) await browser.close();
        await app.close();
    }
}

async function visit(page: Page, origin: string, path: string) {
    const response = await page.goto(origin + path);
    assertEquals(response?.status(), 200, path);
    await page.locator("#auth-username").waitFor({ state: "visible" });
}

function registrationAvailability(allowRegistration: boolean) {
    return {
        code: 200,
        status: true,
        data: { allowRegistration },
    };
}

Deno.test("auth registration exposes accessible credential rules and invalid states", async () => {
    await withPage(async (origin, page) => {
        await visit(page, origin, "/register");

        const username = page.locator("#auth-username");
        const usernameHint = page.locator("#auth-username-hint");
        const password = page.locator("#auth-password");
        const passwordHint = page.locator("#auth-password-hint");
        const usernameRules = AUTH_CREDENTIAL_RULES.username;
        const passwordRules = AUTH_CREDENTIAL_RULES.password;
        assertEquals(await usernameHint.isVisible(), true);
        assertEquals(await passwordHint.isVisible(), true);
        assertEquals(
            await username.getAttribute("aria-describedby"),
            "auth-username-hint",
        );
        assertEquals(
            await password.getAttribute("aria-describedby"),
            "auth-password-hint",
        );
        assertStringIncludes(
            await usernameHint.textContent() ?? "",
            `${usernameRules.minLength}–${usernameRules.maxLength}`,
        );
        assertStringIncludes(
            await passwordHint.textContent() ?? "",
            `${passwordRules.minLength}–${passwordRules.maxLength}`,
        );
        assertEquals(
            await username.getAttribute("minlength"),
            String(usernameRules.minLength),
        );
        assertEquals(
            await username.getAttribute("maxlength"),
            String(usernameRules.maxLength),
        );
        assertEquals(
            await password.getAttribute("minlength"),
            String(passwordRules.minLength),
        );
        assertEquals(
            await password.getAttribute("maxlength"),
            String(passwordRules.maxLength),
        );

        assertEquals(
            await username.getAttribute("pattern"),
            AUTH_USERNAME_PATTERN,
        );
        await username.fill(" Alice ");
        assertEquals(
            await username.evaluate((element) =>
                (element as HTMLInputElement).checkValidity()
            ),
            true,
        );

        const usernameHintColor = await usernameHint.evaluate((element) =>
            getComputedStyle(element).color
        );
        await username.fill("ab");
        await username.blur();
        assertEquals(await username.getAttribute("aria-invalid"), "true");
        assertNotEquals(
            await usernameHint.evaluate((element) =>
                getComputedStyle(element).color
            ),
            usernameHintColor,
        );
        const passwordHintColor = await passwordHint.evaluate((element) =>
            getComputedStyle(element).color
        );
        await password.fill("short");
        await password.blur();
        assertEquals(await password.getAttribute("aria-invalid"), "true");
        assertNotEquals(
            await passwordHint.evaluate((element) =>
                getComputedStyle(element).color
            ),
            passwordHintColor,
        );
    });
});

Deno.test("registration status 503 is not open and can recover after retry", async () => {
    await withPage(async (origin, page) => {
        let availabilityChecks = 0;
        let registrationPosts = 0;
        await page.route("**/api/auth/register", async (route) => {
            if (route.request().method() === "GET") {
                availabilityChecks += 1;
                if (availabilityChecks === 1) {
                    await route.fulfill({
                        status: 503,
                        contentType: "application/json",
                        body: JSON.stringify({
                            code: 503,
                            status: false,
                            message: "注册状态暂不可用",
                        }),
                    });
                    return;
                }
                await route.fulfill({
                    status: 200,
                    contentType: "application/json",
                    body: JSON.stringify(
                        registrationAvailability(availabilityChecks >= 3),
                    ),
                });
                return;
            }
            if (route.request().method() === "POST") registrationPosts += 1;
            await route.continue();
        });

        await visit(page, origin, "/register");
        const unavailableMessage = page.getByText(
            "暂时无法确认注册状态",
            { exact: false },
        );
        await unavailableMessage.waitFor({ state: "visible" });
        const submit = page.locator('form button[type="submit"]');
        assertEquals(await submit.isDisabled(), true);
        await page.locator("#auth-username").fill("auth_recovery_199");
        await page.locator("#auth-display-name").fill("Auth Recovery");
        await page.locator("#auth-password").fill(
            "Auth-recovery-password-199!",
        );
        await page.locator(".narrow-form form").evaluate((form) => {
            (form as HTMLFormElement).requestSubmit();
        });
        const blockedSubmission = page.getByRole("alert");
        await blockedSubmission.waitFor({ state: "visible" });
        assertStringIncludes(
            await blockedSubmission.textContent() ?? "",
            "暂时无法确认注册状态",
        );
        assertEquals(registrationPosts, 0);

        await page.getByRole("button", { name: "重新检查" }).click();
        const closedMessage = page.getByText("当前未开放注册", {
            exact: false,
        });
        await closedMessage.waitFor({ state: "visible" });
        assertEquals(await submit.isDisabled(), true);
        await page.locator(".narrow-form form").evaluate((form) => {
            (form as HTMLFormElement).requestSubmit();
        });
        await blockedSubmission.waitFor({ state: "visible" });
        assertStringIncludes(
            await blockedSubmission.textContent() ?? "",
            "当前未开放注册",
        );
        assertEquals(registrationPosts, 0);
        await page.getByRole("button", { name: "重新检查" }).click();
        await page.waitForFunction(() => {
            const button = document.querySelector<HTMLButtonElement>(
                '.narrow-form form button[type="submit"]',
            );
            return button !== null && !button.disabled;
        });

        await submit.click();
        await page.waitForURL(origin + "/");
        assertEquals(availabilityChecks, 3);
        assertEquals(registrationPosts, 1);
    });
});

Deno.test("login hides registration during an unavailable status check", async () => {
    await withPage(async (origin, page) => {
        let availabilityChecks = 0;
        await page.route("**/api/auth/register", async (route) => {
            if (route.request().method() !== "GET") {
                await route.continue();
                return;
            }
            availabilityChecks += 1;
            if (availabilityChecks === 1) {
                await route.fulfill({
                    status: 503,
                    contentType: "application/json",
                    body: JSON.stringify({
                        code: 503,
                        status: false,
                        message: "注册状态暂不可用",
                    }),
                });
                return;
            }
            await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify(registrationAvailability(true)),
            });
        });

        await visit(page, origin, "/login");
        assertEquals(
            await page.getByRole("link", { name: "注册", exact: true }).count(),
            0,
        );
        const unavailableMessage = page.getByText(
            "暂时无法确认注册是否开放",
            { exact: false },
        );
        await unavailableMessage.waitFor({ state: "visible" });
        await page.getByRole("button", { name: "重新检查" }).click();
        await page.getByRole("link", { name: "注册", exact: true }).waitFor({
            state: "visible",
        });
        assertEquals(availabilityChecks, 2);
    });
});

Deno.test("login continues to show the existing invalid-credentials feedback", async () => {
    await withPage(async (origin, page) => {
        await visit(page, origin, "/login");
        assertEquals(
            await page.locator("#auth-username").getAttribute("pattern"),
            null,
        );
        await page.locator("#auth-username").fill("missing_auth_user_199");
        await page.locator("#auth-password").fill("Incorrect-password-199!");
        await page.locator('form button[type="submit"]').click();
        const error = page.getByRole("alert");
        await error.waitFor({ state: "visible" });
        assertStringIncludes(
            await error.textContent() ?? "",
            "用户名或密码错误",
        );
    });
});
