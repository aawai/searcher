import { layoutThemes } from "./helpers/evidence.ts";
import {
    assert,
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
        let availability: "unavailable" | "closed" | "open" = "unavailable";
        let registrationPosts = 0;
        await page.route("**/api/auth/register", async (route) => {
            if (route.request().method() === "GET") {
                if (availability === "unavailable") {
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
                        registrationAvailability(availability === "open"),
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

        availability = "closed";
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
        availability = "open";
        await page.getByRole("button", { name: "重新检查" }).click();
        await page.waitForFunction(() => {
            const button = document.querySelector<HTMLButtonElement>(
                '.narrow-form form button[type="submit"]',
            );
            return button !== null && !button.disabled;
        });

        await submit.click();
        await page.waitForURL(origin + "/");
        assertEquals(registrationPosts, 1);
    });
});

Deno.test("login keeps the form in place and gates only the register link", async () => {
    await withPage(async (origin, page) => {
        let availability: "unavailable" | "closed" = "closed";
        const check = Promise.withResolvers<void>();
        let pendingCheck = check.promise;
        await page.route("**/api/auth/register", async (route) => {
            if (route.request().method() !== "GET") {
                await route.continue();
                return;
            }
            await pendingCheck;
            if (availability === "unavailable") {
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
                body: JSON.stringify(registrationAvailability(false)),
            });
        });
        const registerLink = page.getByRole("link", {
            name: "注册",
            exact: true,
        });
        const statusMessages = page.locator(
            ".auth-body :is([role=status], [role=alert])",
        );
        const usernameTop = () =>
            page.locator("#auth-username").evaluate((element) =>
                element.getBoundingClientRect().top
            );

        await visit(page, origin, "/login");
        const pendingTop = await usernameTop();
        assertEquals(await registerLink.count(), 0, "pending check");
        assertEquals(await statusMessages.count(), 0, "pending check");
        const closedResponse = page.waitForResponse("**/api/auth/register");
        check.resolve();
        await closedResponse;
        await page.evaluate(() =>
            new Promise((resolve) => requestAnimationFrame(resolve))
        );
        assertEquals(await registerLink.count(), 0, "closed registration");
        assertEquals(await statusMessages.count(), 0, "closed registration");
        assertEquals(await usernameTop(), pendingTop, "form position");

        availability = "unavailable";
        pendingCheck = Promise.resolve();
        await visit(page, origin, "/login");
        await registerLink.waitFor({ state: "visible" });
        assertEquals(await statusMessages.count(), 0, "unknown registration");
        assertEquals(await usernameTop(), pendingTop, "form position");
    });
});

Deno.test("login reports empty fields in their rows without submitting", async () => {
    await withPage(async (origin, page) => {
        let loginPosts = 0;
        await page.route("**/api/auth/login", async (route) => {
            loginPosts += 1;
            await route.continue();
        });
        await visit(page, origin, "/login");
        assertEquals(await page.title(), "登录 · Searcher");
        const username = page.locator("#auth-username");
        const password = page.locator("#auth-password");
        const submit = page.locator('form button[type="submit"]');
        const focusedId = () => page.evaluate(() => document.activeElement?.id);

        await submit.click();
        assertEquals(await focusedId(), "auth-username");
        assertEquals(await username.getAttribute("aria-invalid"), "true");
        assertEquals(
            await page.locator("#auth-username-hint").getByRole("alert")
                .textContent(),
            "请输入用户名",
        );

        await username.fill("someone");
        await submit.click();
        assertEquals(await focusedId(), "auth-password");
        assertEquals(await username.getAttribute("aria-invalid"), null);
        assertEquals(await password.getAttribute("aria-invalid"), "true");
        assertEquals(
            await page.locator("#auth-password-hint").getByRole("alert")
                .textContent(),
            "请输入密码",
        );
        assertEquals(loginPosts, 0);
    });
});

Deno.test("login invalid credentials point to the administrator reset", async () => {
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
        assertEquals(
            await error.textContent(),
            "用户名或密码错误。忘记密码请联系管理员重置。",
        );
    });
});

// Guest-only surfaces with their own fixture, so they run beside the stateful
// navigation journey instead of extending it.
Deno.test("auth surfaces keep responsive geometry and accent switch links in both themes", async (t) => {
    await using cleanup = new AsyncDisposableStack();
    const app = await startProductionApp();
    cleanup.defer(() => app.close());
    const browser = await chromium.launch({
        handleSIGTERM: false,
        headless: true,
        args: ["--no-sandbox"],
    });
    cleanup.defer(() => browser.close());
    await t.step(
        "auth surfaces retain responsive geometry",
        async () => {
            const guest = await browser.newContext();
            try {
                const target = await guest.newPage();
                for (const colorScheme of layoutThemes()) {
                    await target.emulateMedia({
                        colorScheme,
                        reducedMotion: "reduce",
                    });
                    for (const width of [390, 768, 1440]) {
                        await target.setViewportSize({ width, height: 900 });
                        for (const path of ["/login", "/register"]) {
                            await visit(target, app.origin, path);
                            await target.locator("#auth-username").waitFor();
                            await target.waitForFunction(
                                (theme) =>
                                    document.documentElement.dataset.theme ===
                                        theme,
                                colorScheme,
                            );
                            const geometry = await target.locator(
                                ".narrow-form",
                            ).last().evaluate((surface) => {
                                const rect = surface.getBoundingClientRect();
                                const style = getComputedStyle(surface);
                                const max = parseFloat(
                                    style.getPropertyValue("--layout-auth-max"),
                                );
                                const controls = [
                                    ...surface.querySelectorAll(
                                        "input, button[type=submit]",
                                    ),
                                ].map((control) => {
                                    const box = control.getBoundingClientRect();
                                    return { left: box.left, right: box.right };
                                });
                                // The page column shares one axis; field labels
                                // sit on the grouped list's own inner line.
                                const axes = [
                                    ...surface.querySelectorAll(
                                        "h1, form, .settings-card, .auth-footer",
                                    ),
                                ].map((element) =>
                                    element.getBoundingClientRect().left
                                );
                                const labelAxes = [
                                    ...surface.querySelectorAll("form label"),
                                ].map((element) =>
                                    element.getBoundingClientRect().left
                                );
                                return {
                                    width: rect.width,
                                    left: rect.left,
                                    right: rect.right,
                                    max,
                                    controls,
                                    axes,
                                    labelAxes,
                                    overflow:
                                        document.documentElement.scrollWidth >
                                            innerWidth,
                                };
                            });
                            const scenario = path + " " + width + "px " +
                                colorScheme;
                            assert(
                                geometry.width <= geometry.max,
                                scenario + " narrow surface",
                            );
                            assert(
                                !geometry.overflow,
                                scenario + " horizontal overflow",
                            );
                            assert(
                                geometry.left > 0 && geometry.right < width,
                                scenario + " page gutters",
                            );
                            for (const control of geometry.controls) {
                                assert(
                                    control.left >= geometry.left &&
                                        control.right <= geometry.right,
                                    scenario + " control containment",
                                );
                            }
                            assert(
                                geometry.axes.every((left) =>
                                    Math.abs(left - geometry.axes[0]) < 1
                                ),
                                scenario + " content axis",
                            );
                            assert(
                                geometry.labelAxes.length > 0 &&
                                    geometry.labelAxes.every((left) =>
                                        Math.abs(left - geometry.labelAxes[0]) <
                                            1 &&
                                        left > geometry.axes[0]
                                    ),
                                scenario + " field label axis",
                            );
                        }
                    }
                }
            } finally {
                await guest.close();
            }
        },
    );
    await t.step(
        "auth switch links use the accent color and underline on hover",
        async () => {
            const guest = await browser.newContext();
            try {
                const target = await guest.newPage();
                for (const colorScheme of ["light", "dark"] as const) {
                    await target.emulateMedia({ colorScheme });
                    for (
                        const [path, name] of [
                            ["/login", "注册"],
                            ["/register", "登录"],
                        ] as const
                    ) {
                        await visit(target, app.origin, path);
                        await target.waitForFunction(
                            (theme) =>
                                document.documentElement.dataset.theme ===
                                    theme,
                            colorScheme,
                        );
                        const link = target.locator(".auth-footer")
                            .getByRole("link", { name, exact: true });
                        await link.waitFor({ state: "visible" });
                        const accent = await target.evaluate(() => {
                            const probe = document.createElement("span");
                            probe.style.color = "var(--accent)";
                            document.body.append(probe);
                            const color = getComputedStyle(probe).color;
                            probe.remove();
                            return color;
                        });
                        const appearance = () =>
                            link.evaluate((element) => {
                                const style = getComputedStyle(element);
                                return {
                                    color: style.color,
                                    decoration: style.textDecorationLine,
                                };
                            });
                        const scenario = path + " " + colorScheme;
                        assertEquals(
                            (await appearance()).color,
                            accent,
                            scenario + " link color",
                        );
                        assertEquals(
                            (await appearance()).decoration,
                            "none",
                            scenario + " resting link",
                        );
                        await link.hover();
                        assertEquals(
                            (await appearance()).decoration,
                            "underline",
                            scenario + " hovered link",
                        );
                    }
                }
            } finally {
                await guest.close();
            }
        },
    );
});
