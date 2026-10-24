import { assert, assertEquals } from "@std/assert";
import { type Browser, chromium, type Page } from "playwright";
import { documents } from "../../src/db/schema.ts";
import {
    loginAndVisit,
    type ProductionAppInstance,
    startProductionApp,
} from "./helpers/production-app.ts";

type Note = {
    id: string;
    title: string | null;
    body: string;
    isHomeFixed: boolean;
    isFavorite: boolean;
};

async function activeNotes(page: Page, origin: string): Promise<Note[]> {
    const response = await page.request.get(
        `${origin}/api/documents?limit=50`,
    );
    const ids = ((await response.json()).data.items as { id: string }[])
        .map((item) => item.id);
    return await Promise.all(ids.map(async (id) => {
        const detail = await page.request.get(`${origin}/api/documents/${id}`);
        return (await detail.json()).data as Note;
    }));
}

async function storedNoteCount(app: ProductionAppInstance): Promise<number> {
    return (await app.store.run((db) => db.select().from(documents).all()))
        .length;
}

function shareUrl(origin: string, fields: Record<string, string>): string {
    return `${origin}/share?${new URLSearchParams(fields)}`;
}

Deno.test("share target records the shared page as a note #238", async (t) => {
    const app = await startProductionApp();
    const user = await app.seedAskFixtureUser({
        username: "share_target",
        password: "Share-target-pass-238!",
    });
    let browser: Browser | undefined;
    try {
        browser = await chromium.launch({
            handleSIGTERM: false,
            headless: true,
            args: ["--no-sandbox"],
        });

        await t.step("signed in: the note appears with 撤销", async () => {
            const context = await browser!.newContext();
            const page = await context.newPage();
            await loginAndVisit(page, app.origin, "/", user);
            await page.goto(shareUrl(app.origin, {
                title: "Example Domain",
                text: "Worth reading",
                url: "https://example.com/a",
            }));
            await page.getByText("已记录笔记“Example Domain”").waitFor();
            assertEquals(page.url(), app.origin + "/");
            const [note] = await activeNotes(page, app.origin);
            assertEquals(note.title, "Example Domain");
            assertEquals(note.body, "https://example.com/a\n\nWorth reading");
            assertEquals(note.isHomeFixed, false);
            assertEquals(note.isFavorite, false);

            // The share was consumed: a reload records nothing again.
            await page.reload();
            await page.locator("main").waitFor({ state: "visible" });
            await page.getByText("已记录笔记").waitFor({ state: "detached" });
            assertEquals((await activeNotes(page, app.origin)).length, 1);

            await page.goto(shareUrl(app.origin, {
                title: "Second share",
                url: "https://example.com/b",
            }));
            await page.getByText("已记录笔记“Second share”").waitFor();
            await page.getByRole("button", { name: "撤销", exact: true })
                .click();
            await page.getByText("已记录笔记“Second share”").waitFor({
                state: "detached",
            });
            const remaining = await activeNotes(page, app.origin);
            assertEquals(remaining.map((item) => item.title), [
                "Example Domain",
            ]);
            await context.close();
        });

        await t.step(
            "guest: nothing reaches the server until sign-in, then it is recorded",
            async () => {
                const before = await storedNoteCount(app);
                const context = await browser!.newContext();
                const page = await context.newPage();
                const leaks: string[] = [];
                page.on("request", (request) => {
                    const sent = [
                        request.url(),
                        request.postData() ?? "",
                        request.headers()["referer"] ?? "",
                    ].join(" ");
                    if (
                        sent.includes("guest-secret-238") &&
                        new URL(request.url()).pathname !== "/share"
                    ) leaks.push(`${request.method()} ${request.url()}`);
                });
                await page.goto(shareUrl(app.origin, {
                    title: "Guest share",
                    text: "guest-secret-238",
                    url: "https://example.com/g",
                }));
                await page.waitForURL(`${app.origin}/login?next=%2Fshare`);
                await page.locator("#auth-username").waitFor();
                assertEquals(await storedNoteCount(app), before);

                await page.locator("#auth-username").fill(user.username);
                await page.locator("#auth-password").fill(user.password);
                await page.locator('form button[type="submit"]').click();
                await page.getByText("已记录笔记“Guest share”").waitFor();
                assertEquals(page.url(), app.origin + "/");
                const note = (await activeNotes(page, app.origin)).find((
                    item,
                ) => item.title === "Guest share");
                assert(note, "guest share recorded after sign-in");
                assertEquals(
                    note.body,
                    "https://example.com/g\n\nguest-secret-238",
                );
                assertEquals(
                    leaks.filter((leak) =>
                        !leak.startsWith("POST ") ||
                        !leak.endsWith("/api/documents")
                    ),
                    [],
                    "only the sign-in's note creation carries the share",
                );
                assertEquals(
                    await page.evaluate(() => sessionStorage.length),
                    0,
                );
                await context.close();
            },
        );
    } finally {
        if (browser) await browser.close();
        await app.close();
    }
});
