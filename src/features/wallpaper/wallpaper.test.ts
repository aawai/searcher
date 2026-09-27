import { assertEquals } from "@std/assert";
import { STATUS_CODE } from "@std/http";
import { join } from "@std/path";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";
import {
    ManifestCorruptionError,
    MAX_USER_WALLPAPERS,
    WallpaperService,
} from "./service.ts";
import { createApp } from "../../app.ts";
import type { Envelope, UserDto } from "@shared/contracts.ts";
import type { Hono } from "hono";
import type { AppEnv } from "../../serve/env.ts";

const ORIGIN = "http://localhost:8000";

const PNG_HEADER = new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    0x00,
    0x00,
    0x00,
    0x0d,
]);
const JPEG_HEADER = new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
]);
const WEBP_HEADER = new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46,
    0x24,
    0x00,
    0x00,
    0x00,
    0x57,
    0x45,
    0x42,
    0x50,
]);
const AVIF_HEADER = new Uint8Array([
    0x00,
    0x00,
    0x00,
    0x1c,
    0x66,
    0x74,
    0x79,
    0x70,
    0x61,
    0x76,
    0x69,
    0x66,
]);
const SVG_SAMPLE = new TextEncoder().encode(
    "<svg xmlns='http://www.w3.org/2000/svg'><circle r='10'/></svg>",
);

function extractCookie(response: Response, name: string): string | null {
    const header = response.headers.get("set-cookie");
    if (!header) return null;
    const match = header.match(new RegExp(`${name}=([^;]+)`));
    return match ? match[1] : null;
}

async function setupTestApp(
    tempDir: string,
    maxUserWallpapers?: number,
    now: () => number = () => Date.now(),
) {
    const store = openDatabase(":memory:");
    await migrateDatabase(store);
    const auth = new AuthService({
        store,
        origin: ORIGIN,
    });
    const wallpaper = new WallpaperService(tempDir, maxUserWallpapers, now);
    const app = createApp({
        store,
        auth,
        origin: ORIGIN,
        wallpaper,
        now,
    });
    return { store, auth, wallpaper, app };
}

async function createTestUser(
    app: Hono<AppEnv>,
    username: string,
): Promise<{ user: UserDto; token: string }> {
    const regRes = await app.request("/api/auth/register", {
        method: "POST",
        headers: {
            "origin": ORIGIN,
            "content-type": "application/json",
        },
        body: JSON.stringify({
            username,
            displayName: `${username} Display`,
            password: "Password123456!",
        }),
    });
    if (regRes.status !== STATUS_CODE.OK) {
        throw new Error(`Failed to create test user: status ${regRes.status}`);
    }
    const regBody = await regRes.json() as Envelope<{ user: UserDto }>;
    const token = extractCookie(regRes, SESSION_COOKIE_NAME);
    if (!token) {
        throw new Error("No session token");
    }
    return { user: regBody.data!.user, token };
}

Deno.test({
    name: "wallpaper: upload, auth, mime, retrieval, and persistence contract",
    async fn() {
        const tempDir = await Deno.makeTempDir({
            prefix: "searcher_test_wallpapers_",
        });
        try {
            const { store, auth, app } = await setupTestApp(tempDir);
            const alice = await createTestUser(app, "alice_wp");
            const bob = await createTestUser(app, "bob_wp");

            // 1. Unauthenticated upload fails with 401
            const unauthForm = new FormData();
            unauthForm.append(
                "image",
                new Blob([PNG_HEADER], { type: "image/png" }),
                "bg.png",
            );
            const unauthRes = await app.request("/api/wallpaper", {
                method: "POST",
                headers: { origin: ORIGIN },
                body: unauthForm,
            });
            assertEquals(unauthRes.status, STATUS_CODE.Unauthorized);

            // 2. Cross-origin upload fails with 403
            const crossOriginRes = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: "http://malicious.com",
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: unauthForm,
            });
            assertEquals(crossOriginRes.status, STATUS_CODE.Forbidden);

            // 3. Reject non-multipart Content-Type on POST /api/wallpaper
            const jsonRes = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: JSON.stringify({ image: "something" }),
            });
            assertEquals(jsonRes.status, STATUS_CODE.UnsupportedMediaType);

            // 4. Reject SVG upload
            const svgForm = new FormData();
            svgForm.append(
                "image",
                new Blob([SVG_SAMPLE], { type: "image/svg+xml" }),
                "icon.svg",
            );
            const svgRes = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: svgForm,
            });
            assertEquals(svgRes.status, STATUS_CODE.BadRequest);

            // 5. Successful PNG upload by Alice
            const pngContent = new Uint8Array([...PNG_HEADER, 1, 2, 3, 4]);
            const validForm = new FormData();
            validForm.append(
                "image",
                new Blob([pngContent], { type: "image/png" }),
                "alice.png",
            );
            const uploadRes = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: validForm,
            });
            assertEquals(uploadRes.status, STATUS_CODE.OK);
            const uploadBody = await uploadRes.json() as Envelope<
                { url: string }
            >;
            assertEquals(uploadBody.status, true);
            const wallpaperUrl = uploadBody.data?.url;
            assertEquals(typeof wallpaperUrl, "string");

            // 6. Alice retrieves her wallpaper -> 200, exact bytes, correct headers
            const getAliceRes = await app.request(wallpaperUrl!, {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
            });
            assertEquals(getAliceRes.status, STATUS_CODE.OK);
            assertEquals(getAliceRes.headers.get("content-type"), "image/png");
            assertEquals(getAliceRes.headers.get("cache-control"), "no-store");
            assertEquals(
                getAliceRes.headers.get("x-content-type-options"),
                "nosniff",
            );
            const retrievedBytes = new Uint8Array(
                await getAliceRes.arrayBuffer(),
            );
            assertEquals(retrievedBytes, pngContent);

            // 7. Bob attempts to retrieve Alice's wallpaper -> 404 (isolation check)
            const getBobRes = await app.request(wallpaperUrl!, {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${bob.token}`,
                },
            });
            assertEquals(getBobRes.status, STATUS_CODE.NotFound);
            const saveAlicePreference = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: JSON.stringify({ backgroundImage: wallpaperUrl }),
            });
            assertEquals(saveAlicePreference.status, STATUS_CODE.OK);
            const savedPreference = await app.request("/api/preferences", {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${alice.token}` },
            });
            const preferenceBody = await savedPreference.json() as Envelope<
                { backgroundImage: string }
            >;
            assertEquals(preferenceBody.data?.backgroundImage, wallpaperUrl);

            const saveBobPreference = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${bob.token}`,
                },
                body: JSON.stringify({ backgroundImage: wallpaperUrl }),
            });
            assertEquals(saveBobPreference.status, STATUS_CODE.NotFound);

            // 8. Unauthenticated GET -> 401
            const getUnauthRes = await app.request(wallpaperUrl!, {
                method: "GET",
            });
            assertEquals(getUnauthRes.status, STATUS_CODE.Unauthorized);

            // 9. Persistence across app restart
            const restartedWallpaper = new WallpaperService(tempDir);
            const restartedApp = createApp({
                store,
                auth,
                origin: ORIGIN,
                wallpaper: restartedWallpaper,
                now: () => Date.now(),
            });
            const getRestartedRes = await restartedApp.request(wallpaperUrl!, {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
            });
            assertEquals(getRestartedRes.status, STATUS_CODE.OK);
            const restartedBytes = new Uint8Array(
                await getRestartedRes.arrayBuffer(),
            );
            assertEquals(restartedBytes, pngContent);

            // 10. Multi-format support: JPEG, WebP, AVIF
            for (
                const [format, header, mime] of [
                    ["jpeg", JPEG_HEADER, "image/jpeg"],
                    ["webp", WEBP_HEADER, "image/webp"],
                    ["avif", AVIF_HEADER, "image/avif"],
                ] as const
            ) {
                const imgData = new Uint8Array([...header, 99, 88, 77]);
                const f = new FormData();
                f.append(
                    "image",
                    new Blob([imgData], { type: mime }),
                    `test.${format}`,
                );
                const res = await app.request("/api/wallpaper", {
                    method: "POST",
                    headers: {
                        origin: ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                    },
                    body: f,
                });
                assertEquals(res.status, STATUS_CODE.OK);
                const body = await res.json() as Envelope<{ url: string }>;
                const gRes = await app.request(body.data!.url, {
                    headers: {
                        cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                    },
                });
                assertEquals(gRes.status, STATUS_CODE.OK);
                assertEquals(gRes.headers.get("content-type"), mime);
            }

            // 11. Oversized file (> 5 MiB) rejected with 413
            const bigForm = new FormData();
            const bigBlob = new Blob([new Uint8Array(5 * 1024 * 1024 + 10)], {
                type: "image/png",
            });
            bigForm.append("image", bigBlob, "huge.png");
            const overRes = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: bigForm,
            });
            assertEquals(overRes.status, 413);

            // 12. Explicit delete on the latest uploaded wallpaper
            const latestUploadRes = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: validForm,
            });
            assertEquals(latestUploadRes.status, STATUS_CODE.OK);
            const latestBody = await latestUploadRes.json() as Envelope<
                { url: string }
            >;
            const toDeleteUrl = latestBody.data!.url;

            const delRes = await app.request(toDeleteUrl, {
                method: "DELETE",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
            });
            assertEquals(delRes.status, STATUS_CODE.OK);
            const getDeletedRes = await app.request(toDeleteUrl, {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
            });
            assertEquals(getDeletedRes.status, STATUS_CODE.NotFound);

            // The original image is still within the five-image history.
            const getEvictedRes = await app.request(wallpaperUrl!, {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
            });
            assertEquals(getEvictedRes.status, STATUS_CODE.OK);
            await store.close();
        } finally {
            await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        }
    },
});

Deno.test({
    name:
        "wallpaper: concurrent uploads maintain record integrity without dropping",
    async fn() {
        const tempDir = await Deno.makeTempDir({
            prefix: "searcher_test_concurrent_",
        });
        try {
            const { store, app } = await setupTestApp(tempDir, 20);
            const user = await createTestUser(app, "concurrent_user");

            const uploadPromises = Array.from({ length: 6 }).map(
                async (_, idx) => {
                    const data = new Uint8Array([
                        ...PNG_HEADER,
                        idx,
                        10,
                        20,
                        30,
                    ]);
                    const form = new FormData();
                    form.append(
                        "image",
                        new Blob([data], { type: "image/png" }),
                        `c_${idx}.png`,
                    );
                    const res = await app.request("/api/wallpaper", {
                        method: "POST",
                        headers: {
                            origin: ORIGIN,
                            cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                        },
                        body: form,
                    });
                    assertEquals(res.status, STATUS_CODE.OK);
                    const body = await res.json() as Envelope<{ url: string }>;
                    return body.data!.url;
                },
            );

            const urls = await Promise.all(uploadPromises);
            assertEquals(urls.length, 6);

            // Read raw manifest and verify all 6 IDs exist
            const manifestContent = await Deno.readTextFile(
                join(tempDir, "manifest.json"),
            );
            const manifest = JSON.parse(manifestContent);
            assertEquals(manifest.length, 6);

            // Verify each URL returns correct binary
            for (let idx = 0; idx < urls.length; idx++) {
                const getRes = await app.request(urls[idx], {
                    headers: {
                        cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                    },
                });
                assertEquals(getRes.status, STATUS_CODE.OK);
                const bytes = new Uint8Array(await getRes.arrayBuffer());
                assertEquals(bytes[PNG_HEADER.length], idx);
            }

            await store.close();
        } finally {
            await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        }
    },
});

Deno.test({
    name:
        "wallpaper: per-user quota bounds storage and evicts oldest files cleanly",
    async fn() {
        const tempDir = await Deno.makeTempDir({
            prefix: "searcher_test_quota_",
        });
        try {
            // Multiple uploads can share the same timestamp; order must still be newest first.
            const clock = () => 10000;

            const { store, app } = await setupTestApp(
                tempDir,
                MAX_USER_WALLPAPERS,
                clock,
            );
            const user = await createTestUser(app, "quota_user");

            const urls: string[] = [];
            for (let i = 0; i < 6; i++) {
                const imgData = new Uint8Array([
                    ...PNG_HEADER,
                    100 + i,
                    1,
                    2,
                    3,
                ]);
                const form = new FormData();
                form.append(
                    "image",
                    new Blob([imgData], { type: "image/png" }),
                    `wp_${i}.png`,
                );
                const res = await app.request("/api/wallpaper", {
                    method: "POST",
                    headers: {
                        origin: ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                    },
                    body: form,
                });
                assertEquals(res.status, STATUS_CODE.OK);
                const body = await res.json() as Envelope<{ url: string }>;
                urls.push(body.data!.url);
            }

            const history = await app.request("/api/wallpaper", {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${user.token}` },
            });
            assertEquals(history.status, STATUS_CODE.OK);
            const listed = await history.json() as Envelope<{ url: string }[]>;
            assertEquals(
                listed.data,
                urls.slice(1).reverse().map((url) => ({ url })),
            );

            const other = await createTestUser(app, "another_quota_user");
            const otherHistory = await app.request("/api/wallpaper", {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${other.token}` },
            });
            assertEquals(
                (await otherHistory.json() as Envelope<{ url: string }[]>).data,
                [],
            );
            assertEquals(
                (await app.request("/api/wallpaper")).status,
                STATUS_CODE.Unauthorized,
            );

            // Url 0 (oldest) should have been evicted
            const firstId = urls[0].replace("/api/wallpaper/", "");
            const firstFileExists = await Deno.stat(
                join(tempDir, `${firstId}.bin`),
            ).then(() => true).catch(() => false);
            assertEquals(
                firstFileExists,
                false,
                "Oldest wallpaper binary file must be deleted upon quota eviction",
            );

            const getOldestRes = await app.request(urls[0], {
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
            });
            assertEquals(getOldestRes.status, STATUS_CODE.NotFound);

            // The five newest images remain accessible.
            for (let i = 1; i <= 5; i++) {
                const getRes = await app.request(urls[i], {
                    headers: {
                        cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                    },
                });
                assertEquals(getRes.status, STATUS_CODE.OK);
                const id = urls[i].replace("/api/wallpaper/", "");
                const exists = await Deno.stat(join(tempDir, `${id}.bin`)).then(
                    () => true,
                ).catch(() => false);
                assertEquals(exists, true);
            }

            // Manifest retains the five most recent uploads.
            const manifestContent = await Deno.readTextFile(
                join(tempDir, "manifest.json"),
            );
            const manifest = JSON.parse(manifestContent);
            assertEquals(manifest.length, 5);

            await store.close();
        } finally {
            await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        }
    },
});

Deno.test({
    name:
        "wallpaper: malformed manifest fails closed and does not silently wipe",
    async fn() {
        const tempDir = await Deno.makeTempDir({
            prefix: "searcher_test_malformed_",
        });
        try {
            const manifestPath = join(tempDir, "manifest.json");
            // Write corrupt JSON
            await Deno.writeTextFile(manifestPath, "{ corrupt json");

            const service = new WallpaperService(tempDir);
            const data = new Uint8Array([...PNG_HEADER, 1, 2, 3]);

            // Save should fail closed with ManifestCorruptionError
            let threw = false;
            try {
                await service.saveWallpaper("user1", data);
            } catch (err) {
                threw = true;
                assertEquals(err instanceof ManifestCorruptionError, true);
            }
            assertEquals(
                threw,
                true,
                "saveWallpaper must fail closed on malformed manifest",
            );

            // Manifest file content must NOT have been silently replaced with []
            const content = await Deno.readTextFile(manifestPath);
            assertEquals(content, "{ corrupt json");

            // Write malformed schema (missing required fields)
            await Deno.writeTextFile(
                manifestPath,
                JSON.stringify([{ invalid: true }]),
            );
            threw = false;
            try {
                await service.getWallpaper(crypto.randomUUID(), "user1");
            } catch (err) {
                threw = true;
                assertEquals(err instanceof ManifestCorruptionError, true);
            }
            assertEquals(
                threw,
                true,
                "getWallpaper must fail closed on invalid schema",
            );

            const content2 = await Deno.readTextFile(manifestPath);
            assertEquals(content2, JSON.stringify([{ invalid: true }]));
        } finally {
            await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        }
    },
});

Deno.test({
    name: "wallpaper: orphaned payload is deleted if manifest commit fails",
    async fn() {
        const tempDir = await Deno.makeTempDir({
            prefix: "searcher_test_orphan_",
        });
        try {
            const service = new WallpaperService(tempDir);
            // Intentionally sabotage storageDir so manifest rename or tmp file write fails
            // By making manifest.json a directory, write/rename to manifest.json will fail
            const manifestPath = join(tempDir, "manifest.json");
            await Deno.mkdir(manifestPath);

            const data = new Uint8Array([...PNG_HEADER, 5, 6, 7]);
            let threw = false;
            try {
                await service.saveWallpaper("user_orphan", data);
            } catch {
                threw = true;
            }
            assertEquals(threw, true);

            // Verify no .bin files were left orphaned in storageDir
            const dirEntries: string[] = [];
            for await (const entry of Deno.readDir(tempDir)) {
                if (entry.name.endsWith(".bin")) {
                    dirEntries.push(entry.name);
                }
            }
            assertEquals(
                dirEntries.length,
                0,
                "No orphaned .bin files should linger after manifest commit failure",
            );
        } finally {
            await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        }
    },
});
