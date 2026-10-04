import { assertEquals, assertRejects } from "@std/assert";
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
import type { Envelope, PreferencesDto, UserDto } from "@shared/contracts.ts";
import type { Hono } from "hono";
import type { AppEnv } from "../../serve/env.ts";

Deno.test("wallpaper: failed deletion compensation retains staged bytes for recovery", async () => {
    const dir = await Deno.makeTempDir({ prefix: "wallpaper-compensation-" });
    const service = new WallpaperService(dir);
    const owner = crypto.randomUUID();
    const asset = await service.saveWallpaper(owner, PNG_HEADER);
    const staged = join(dir, asset.id + ".bin.deleting");
    const original = join(dir, asset.id + ".bin");
    const remove = Deno.remove;
    const rename = Deno.rename;
    try {
        Deno.remove = (path, options) =>
            String(path) === staged
                ? Promise.reject(
                    new Deno.errors.PermissionDenied("unlink denied"),
                )
                : remove(path, options);
        Deno.rename = (from, to) =>
            String(from) === staged && String(to) === original
                ? Promise.reject(
                    new Deno.errors.PermissionDenied("restore denied"),
                )
                : rename(from, to);
        const error = await assertRejects(
            () => service.deleteWallpaper(asset.id, owner),
            AggregateError,
        );
        assertEquals(error.errors.map((failure: Error) => failure.message), [
            "unlink denied",
            "restore denied",
        ]);
        assertEquals(await Deno.readFile(staged), PNG_HEADER);
    } finally {
        Deno.remove = remove;
        Deno.rename = rename;
        await Deno.remove(dir, { recursive: true });
    }
});
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
            assertEquals(
                getAliceRes.headers.get("cache-control"),
                "private, no-cache",
            );
            const etag = getAliceRes.headers.get("etag");
            assertEquals(typeof etag, "string");

            // 6b. ETag 304 revalidation
            const conditionalRes = await app.request(wallpaperUrl!, {
                method: "GET",
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                    "if-none-match": etag!,
                },
            });
            assertEquals(conditionalRes.status, 304);
            assertEquals(
                conditionalRes.headers.get("cache-control"),
                "private, no-cache",
            );
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
            const listed = await history.json() as Envelope<
                { id: string; url: string; focalX: number; focalY: number }[]
            >;
            assertEquals(
                listed.data,
                urls.slice(1).reverse().map((url) => ({
                    id: url.replace("/api/wallpaper/", ""),
                    url,
                    focalX: 0.5,
                    focalY: 0.5,
                })),
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

Deno.test({
    name:
        "wallpaper: asset record focal defaults from old manifest and updates via API",
    async fn() {
        const tempDir = await Deno.makeTempDir({
            prefix: "searcher_test_focal_",
        });
        try {
            const { store, app } = await setupTestApp(tempDir);
            const user = await createTestUser(app, "focal_user");
            const otherUser = await createTestUser(app, "other_focal_user");

            // 1. Simulate legacy manifest without focalX / focalY fields
            const legacyId = "11111111-2222-3333-4444-555555555555";
            const legacyManifest = [
                {
                    id: legacyId,
                    userId: user.user.id,
                    contentType: "image/png",
                    size: 100,
                    createdAt: 1000,
                },
            ];
            await Deno.writeTextFile(
                join(tempDir, "manifest.json"),
                JSON.stringify(legacyManifest),
            );
            await Deno.writeFile(
                join(tempDir, `${legacyId}.bin`),
                new Uint8Array([...PNG_HEADER, 1]),
            );

            // History API returns legacy wallpaper with default focalX=0.5, focalY=0.5
            const historyRes = await app.request("/api/wallpaper", {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${user.token}` },
            });
            assertEquals(historyRes.status, STATUS_CODE.OK);
            const historyBody = await historyRes.json() as Envelope<
                { id: string; url: string; focalX: number; focalY: number }[]
            >;
            assertEquals(historyBody.data?.length, 1);
            assertEquals(historyBody.data?.[0].focalX, 0.5);
            assertEquals(historyBody.data?.[0].focalY, 0.5);

            // 2. Upload with valid custom focalX and focalY
            const form = new FormData();
            form.append(
                "image",
                new Blob([new Uint8Array([...PNG_HEADER, 2])], {
                    type: "image/png",
                }),
                "focal.png",
            );
            form.append("focalX", "0.25");
            form.append("focalY", "0.75");
            const uploadRes = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: form,
            });
            assertEquals(uploadRes.status, STATUS_CODE.OK);
            const uploadBody = await uploadRes.json() as Envelope<
                { id: string; url: string; focalX: number; focalY: number }
            >;
            assertEquals(uploadBody.data?.focalX, 0.25);
            assertEquals(uploadBody.data?.focalY, 0.75);
            const newId = uploadBody.data!.id;

            // 3. Upload with invalid focal coordinates rejected with 400
            const badForm1 = new FormData();
            badForm1.append(
                "image",
                new Blob([new Uint8Array([...PNG_HEADER, 3])], {
                    type: "image/png",
                }),
                "bad1.png",
            );
            badForm1.append("focalX", "1.5");
            const badRes1 = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: badForm1,
            });
            assertEquals(badRes1.status, STATUS_CODE.BadRequest);

            const badForm2 = new FormData();
            badForm2.append(
                "image",
                new Blob([new Uint8Array([...PNG_HEADER, 4])], {
                    type: "image/png",
                }),
                "bad2.png",
            );
            badForm2.append("focalY", "-0.1");
            const badRes2 = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: badForm2,
            });
            assertEquals(badRes2.status, STATUS_CODE.BadRequest);

            // 4. PATCH /api/wallpaper/:id updates focal composition
            const patchRes = await app.request(`/api/wallpaper/${newId}`, {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: JSON.stringify({ focalX: 0.1, focalY: 0.9 }),
            });
            assertEquals(patchRes.status, STATUS_CODE.OK);
            const patchBody = await patchRes.json() as Envelope<
                { id: string; url: string; focalX: number; focalY: number }
            >;
            assertEquals(patchBody.data?.focalX, 0.1);
            assertEquals(patchBody.data?.focalY, 0.9);

            // Verify preferences.wallpaperCompositions is synchronized
            const prefRes = await app.request("/api/preferences", {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${user.token}` },
            });
            const prefBody = await prefRes.json() as Envelope<PreferencesDto>;
            assertEquals(
                prefBody.data?.wallpaperPresentations
                    ?.[`/api/wallpaper/${newId}`]
                    ?.composition,
                { focalX: 0.1, focalY: 0.9 },
            );
            assertEquals(
                prefBody.data?.wallpaperPresentations
                    ?.[`/api/wallpaper/${newId}`]
                    ?.composition,
                { focalX: 0.1, focalY: 0.9 },
            );

            // 5. Non-owner cannot PATCH another user's wallpaper (404)
            const unauthorizedPatch = await app.request(
                `/api/wallpaper/${newId}`,
                {
                    method: "PATCH",
                    headers: {
                        origin: ORIGIN,
                        "content-type": "application/json",
                        cookie: `${SESSION_COOKIE_NAME}=${otherUser.token}`,
                    },
                    body: JSON.stringify({ focalX: 0.5, focalY: 0.5 }),
                },
            );
            assertEquals(unauthorizedPatch.status, STATUS_CODE.NotFound);

            // 6. Out-of-bounds PATCH coordinates rejected (400)
            const oobPatch = await app.request(`/api/wallpaper/${newId}`, {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: JSON.stringify({ focalX: 2.0 }),
            });
            assertEquals(oobPatch.status, STATUS_CODE.BadRequest);

            await store.close();
        } finally {
            await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        }
    },
});

Deno.test({
    name:
        "wallpaper: private no-cache ETag and conditional 304 vs auth isolation",
    async fn() {
        const tempDir = await Deno.makeTempDir({
            prefix: "searcher_test_cache_",
        });
        try {
            const { store, app } = await setupTestApp(tempDir);
            const alice = await createTestUser(app, "cache_alice");
            const bob = await createTestUser(app, "cache_bob");

            const form = new FormData();
            form.append(
                "image",
                new Blob([new Uint8Array([...PNG_HEADER, 42])], {
                    type: "image/png",
                }),
                "cached.png",
            );
            const uploadRes = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: form,
            });
            assertEquals(uploadRes.status, STATUS_CODE.OK);
            const { url } =
                (await uploadRes.json() as Envelope<{ url: string }>)
                    .data!;

            // 1. Owner GET -> 200 with private, no-cache and ETag
            const getRes = await app.request(url, {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${alice.token}` },
            });
            assertEquals(getRes.status, STATUS_CODE.OK);
            assertEquals(
                getRes.headers.get("cache-control"),
                "private, no-cache",
            );
            const etag = getRes.headers.get("etag");
            assertEquals(typeof etag, "string");

            // 2. Owner with matching If-None-Match -> 304 Not Modified
            const revalidateRes = await app.request(url, {
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                    "if-none-match": etag!,
                },
            });
            assertEquals(revalidateRes.status, 304);
            assertEquals(
                revalidateRes.headers.get("cache-control"),
                "private, no-cache",
            );
            assertEquals(await revalidateRes.text(), "");

            // 3. Different user attempting conditional GET -> 404 (no leak)
            const bobRes = await app.request(url, {
                headers: {
                    cookie: `${SESSION_COOKIE_NAME}=${bob.token}`,
                    "if-none-match": etag!,
                },
            });
            assertEquals(bobRes.status, STATUS_CODE.NotFound);

            // 4. Unauthenticated conditional GET -> 401 (no leak)
            const unauthRes = await app.request(url, {
                headers: {
                    "if-none-match": etag!,
                },
            });
            assertEquals(unauthRes.status, STATUS_CODE.Unauthorized);

            await store.close();
        } finally {
            await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        }
    },
});

Deno.test({
    name:
        "wallpaper: deletion referential integrity and recoverable rollback on failure",
    async fn() {
        const tempDir = await Deno.makeTempDir({
            prefix: "searcher_test_delete_",
        });
        try {
            const { store, app } = await setupTestApp(tempDir);
            const user = await createTestUser(app, "delete_user");

            // Upload 2 wallpapers
            const form1 = new FormData();
            form1.append(
                "image",
                new Blob([new Uint8Array([...PNG_HEADER, 1])], {
                    type: "image/png",
                }),
                "w1.png",
            );
            const up1 = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: form1,
            });
            const url1 = (await up1.json() as Envelope<{ url: string }>).data!
                .url;

            const form2 = new FormData();
            form2.append(
                "image",
                new Blob([new Uint8Array([...PNG_HEADER, 2])], {
                    type: "image/png",
                }),
                "w2.png",
            );
            const up2 = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: form2,
            });
            const url2 = (await up2.json() as Envelope<{ url: string }>).data!
                .url;

            // Set url1 as active backgroundImage
            const patchPref = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: JSON.stringify({ backgroundImage: url1 }),
            });
            assertEquals(patchPref.status, STATUS_CODE.OK);

            // 1. Delete non-active wallpaper (url2) -> url1 remains as backgroundImage
            const delUrl2 = await app.request(url2, {
                method: "DELETE",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
            });
            assertEquals(delUrl2.status, STATUS_CODE.OK);

            const checkPref1 = await app.request("/api/preferences", {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${user.token}` },
            });
            const prefBody1 = await checkPref1.json() as Envelope<
                PreferencesDto
            >;
            assertEquals(prefBody1.data?.backgroundImage, url1);

            // 2. Delete active wallpaper (url1) -> backgroundImage cleared to null
            const delUrl1 = await app.request(url1, {
                method: "DELETE",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
            });
            assertEquals(delUrl1.status, STATUS_CODE.OK);

            const checkPref2 = await app.request("/api/preferences", {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${user.token}` },
            });
            const prefBody2 = await checkPref2.json() as Envelope<
                PreferencesDto
            >;
            assertEquals(prefBody2.data?.backgroundImage, null);

            // 3. Test failure rollback: if manifest update fails, DB preference is rolled back
            // Upload another wallpaper and set as active
            const form3 = new FormData();
            form3.append(
                "image",
                new Blob([new Uint8Array([...PNG_HEADER, 3])], {
                    type: "image/png",
                }),
                "w3.png",
            );
            const up3 = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: form3,
            });
            const url3 = (await up3.json() as Envelope<{ url: string }>).data!
                .url;

            await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: JSON.stringify({ backgroundImage: url3 }),
            });

            // Make manifest.json a directory to cause atomicWriteManifest to fail during delete
            const manifestPath = join(tempDir, "manifest.json");
            const originalManifestContent = await Deno.readTextFile(
                manifestPath,
            );
            await Deno.remove(manifestPath);
            await Deno.mkdir(manifestPath);

            // Attempt to delete -> should fail with error
            const failDel = await app.request(url3, {
                method: "DELETE",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
            });
            assertEquals(failDel.status, 500);

            // Restore manifest so we can read preferences and manifest
            await Deno.remove(manifestPath);
            await Deno.writeTextFile(manifestPath, originalManifestContent);

            // Verify preference was rolled back and still points to url3 (no dangling / half-completed state)
            const checkRollback = await app.request("/api/preferences", {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${user.token}` },
            });
            const prefRollback = await checkRollback.json() as Envelope<
                PreferencesDto
            >;
            assertEquals(prefRollback.data?.backgroundImage, url3);

            await store.close();
        } finally {
            await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        }
    },
});

Deno.test({
    name:
        "wallpaper: quota eviction prioritizes non-active wallpapers and clears preference if active is evicted",
    async fn() {
        const tempDir = await Deno.makeTempDir({
            prefix: "searcher_test_quota_evict_",
        });
        try {
            // max 3 wallpapers for this test
            const { store, app } = await setupTestApp(tempDir, 3);
            const user = await createTestUser(app, "quota_evict_user");

            // Upload 3 wallpapers: w1, w2, w3
            const urls: string[] = [];
            for (let i = 1; i <= 3; i++) {
                const f = new FormData();
                f.append(
                    "image",
                    new Blob([new Uint8Array([...PNG_HEADER, i])], {
                        type: "image/png",
                    }),
                    `w${i}.png`,
                );
                const res = await app.request("/api/wallpaper", {
                    method: "POST",
                    headers: {
                        origin: ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                    },
                    body: f,
                });
                const body = await res.json() as Envelope<{ url: string }>;
                urls.push(body.data!.url);
            }

            // Set w1 (the oldest!) as active backgroundImage
            const patchPref = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: JSON.stringify({ backgroundImage: urls[0] }),
            });
            assertEquals(patchPref.status, STATUS_CODE.OK);

            // Upload 4th wallpaper (w4) -> quota exceeded (limit is 3)
            // FIFO eviction strictly evicts oldest wallpaper (w1), clearing current preference & composition!
            const f4 = new FormData();
            f4.append(
                "image",
                new Blob([new Uint8Array([...PNG_HEADER, 4])], {
                    type: "image/png",
                }),
                "w4.png",
            );
            const res4 = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: f4,
            });
            assertEquals(res4.status, STATUS_CODE.OK);

            // w1 (oldest, was active) must have been evicted -> 404
            const checkW1 = await app.request(urls[0], {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${user.token}` },
            });
            assertEquals(checkW1.status, STATUS_CODE.NotFound);

            // w2 and w3 remain accessible -> 200
            const checkW2 = await app.request(urls[1], {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${user.token}` },
            });
            assertEquals(checkW2.status, STATUS_CODE.OK);

            // Preferences backgroundImage was referencing w1, so it is cleared to null
            const prefRes = await app.request("/api/preferences", {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${user.token}` },
            });
            const prefBody = await prefRes.json() as Envelope<PreferencesDto>;
            assertEquals(prefBody.data?.backgroundImage, null);
            assertEquals(
                prefBody.data?.wallpaperPresentations?.[urls[0]],
                undefined,
            );
            await store.close();
        } finally {
            await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        }
    },
});

Deno.test({
    name:
        "wallpaper: source validation for HTTPS, uploaded owner, and CSS gradient whitelist",
    async fn() {
        const tempDir = await Deno.makeTempDir({
            prefix: "searcher_test_sources_",
        });
        try {
            const { store, app } = await setupTestApp(tempDir);
            const alice = await createTestUser(app, "source_alice");
            const bob = await createTestUser(app, "source_bob");

            // Alice uploads a wallpaper
            const form = new FormData();
            form.append(
                "image",
                new Blob([new Uint8Array([...PNG_HEADER, 1])], {
                    type: "image/png",
                }),
                "alice_bg.png",
            );
            const uploadRes = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: form,
            });
            const aliceWpUrl = (await uploadRes.json() as Envelope<
                { url: string }
            >).data!.url;

            // 1. Legal sources
            // A. Alice's own uploaded wallpaper
            const patchOwnWp = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: JSON.stringify({ backgroundImage: aliceWpUrl }),
            });
            assertEquals(patchOwnWp.status, STATUS_CODE.OK);

            // B. Remote HTTPS URL
            const patchHttps = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: JSON.stringify({
                    backgroundImage: "https://example.com/wallpaper.jpg",
                }),
            });
            assertEquals(patchHttps.status, STATUS_CODE.OK);

            // C. CSS linear gradient
            const linearGrad =
                "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)";
            const patchLinear = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: JSON.stringify({ backgroundImage: linearGrad }),
            });
            assertEquals(patchLinear.status, STATUS_CODE.OK);
            const prefLinear = await (await app.request("/api/preferences", {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${alice.token}` },
            })).json() as Envelope<PreferencesDto>;
            assertEquals(prefLinear.data?.backgroundImage, linearGrad);

            // D. CSS radial gradient
            const radialGrad =
                "radial-gradient(circle at 50% 50%, rgb(59, 130, 246) 0%, transparent 70%)";
            const patchRadial = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: JSON.stringify({ backgroundImage: radialGrad }),
            });
            assertEquals(patchRadial.status, STATUS_CODE.OK);

            // E. Setting wallpaperCompositions with valid keys
            const patchComps = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: JSON.stringify({
                    wallpaperCompositions: {
                        [aliceWpUrl]: { focalX: 0.3, focalY: 0.7 },
                        [linearGrad]: { focalX: 0.4, focalY: 0.6 },
                    },
                }),
            });
            assertEquals(patchComps.status, STATUS_CODE.OK);

            // 2. Illegal sources rejected
            // A. Bob trying to set Alice's uploaded wallpaper -> 404
            const bobBadUpload = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${bob.token}`,
                },
                body: JSON.stringify({ backgroundImage: aliceWpUrl }),
            });
            assertEquals(bobBadUpload.status, STATUS_CODE.NotFound);

            // B. Bob trying to set wallpaperCompositions keyed by Alice's wallpaper -> 404
            const bobBadComps = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${bob.token}`,
                },
                body: JSON.stringify({
                    wallpaperCompositions: {
                        [aliceWpUrl]: { focalX: 0.5, focalY: 0.5 },
                    },
                }),
            });
            assertEquals(bobBadComps.status, STATUS_CODE.NotFound);

            // C. HTTP URL rejected -> 400
            const badHttp = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: JSON.stringify({
                    backgroundImage: "http://example.com/wp.jpg",
                }),
            });
            assertEquals(badHttp.status, STATUS_CODE.BadRequest);

            // D. HTTPS with credentials rejected -> 400
            const badCreds = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: JSON.stringify({
                    backgroundImage: "https://user:pass@example.com/wp.jpg",
                }),
            });
            assertEquals(badCreds.status, STATUS_CODE.BadRequest);

            // E. Dangerous gradient with url() rejected -> 400
            const badGradUrl = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: JSON.stringify({
                    backgroundImage:
                        "linear-gradient(url('https://evil.com/leak'))",
                }),
            });
            assertEquals(badGradUrl.status, STATUS_CODE.BadRequest);

            // F. Dangerous gradient with var() rejected -> 400
            const badGradVar = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: JSON.stringify({
                    backgroundImage: "linear-gradient(var(--evil))",
                }),
            });
            assertEquals(badGradVar.status, STATUS_CODE.BadRequest);

            // G. Data URL rejected on server -> 400
            const badDataUrl = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: JSON.stringify({
                    backgroundImage:
                        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
                }),
            });
            assertEquals(badDataUrl.status, STATUS_CODE.BadRequest);

            // H. Invalid gradient grammar (empty, garbage, single stop, junk suffix, etc.) rejected -> 400
            for (
                const invalidGrad of [
                    "linear-gradient()",
                    "linear-gradient(garbage)",
                    "linear-gradient(red)",
                    "linear-gradient(red, blue) junk",
                    "linear-gradient(135deg, red)",
                    "linear-gradient(red,,blue)",
                ]
            ) {
                const res = await app.request("/api/preferences", {
                    method: "PATCH",
                    headers: {
                        origin: ORIGIN,
                        "content-type": "application/json",
                        cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                    },
                    body: JSON.stringify({ backgroundImage: invalidGrad }),
                });
                assertEquals(
                    res.status,
                    STATUS_CODE.BadRequest,
                    `Expected 400 for invalid gradient: ${invalidGrad}`,
                );
            }

            // I. Minimal 2-stop valid gradient accepted -> 200
            const valid2Stop = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: JSON.stringify({
                    backgroundImage: "linear-gradient(red, blue)",
                }),
            });
            assertEquals(valid2Stop.status, STATUS_CODE.OK);

            await store.close();
        } finally {
            await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        }
    },
});

Deno.test({
    name:
        "wallpaper: concurrent select and delete race condition avoids dangling reference",
    async fn() {
        const tempDir = await Deno.makeTempDir({
            prefix: "searcher_test_race_",
        });
        try {
            const { store, app } = await setupTestApp(tempDir);
            const user = await createTestUser(app, "race_user");

            // Upload a wallpaper
            const form = new FormData();
            form.append(
                "image",
                new Blob([new Uint8Array([...PNG_HEADER, 99])], {
                    type: "image/png",
                }),
                "race.png",
            );
            const upRes = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: form,
            });
            assertEquals(upRes.status, STATUS_CODE.OK);
            const wpUrl =
                (await upRes.json() as Envelope<{ url: string }>).data!
                    .url;

            // Fire concurrent DELETE and PATCH preference referencing the wallpaper
            const [delRes, _patchRes] = await Promise.all([
                app.request(wpUrl, {
                    method: "DELETE",
                    headers: {
                        origin: ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                    },
                }),
                app.request("/api/preferences", {
                    method: "PATCH",
                    headers: {
                        origin: ORIGIN,
                        "content-type": "application/json",
                        cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                    },
                    body: JSON.stringify({ backgroundImage: wpUrl }),
                }),
            ]);

            // Regardless of interleaving, the asset is deleted
            assertEquals(delRes.status, STATUS_CODE.OK);

            // And preferences.backgroundImage MUST NEVER be left pointing to the deleted wallpaper!
            const checkPref = await app.request("/api/preferences", {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${user.token}` },
            });
            const prefBody = await checkPref.json() as Envelope<PreferencesDto>;
            assertEquals(
                prefBody.data?.backgroundImage,
                null,
                "Preferences backgroundImage must never reference a deleted wallpaper after concurrent race",
            );

            await store.close();
        } finally {
            await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        }
    },
});

Deno.test({
    name:
        "wallpaper: file deletion failure rolls back manifest, preferences, and staged file",
    async fn() {
        const tempDir = await Deno.makeTempDir({
            prefix: "searcher_test_rollback_",
        });
        const origRemove = Deno.remove;
        try {
            const { store, app } = await setupTestApp(tempDir);
            const user = await createTestUser(app, "rollback_user");

            // Upload wallpaper
            const form = new FormData();
            form.append(
                "image",
                new Blob([new Uint8Array([...PNG_HEADER, 77])], {
                    type: "image/png",
                }),
                "rollback.png",
            );
            const upRes = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: form,
            });
            assertEquals(upRes.status, STATUS_CODE.OK);
            const wpUrl =
                (await upRes.json() as Envelope<{ url: string }>).data!
                    .url;
            const id = wpUrl.replace("/api/wallpaper/", "");

            // Set as active backgroundImage and in compositions
            await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: JSON.stringify({
                    backgroundImage: wpUrl,
                    wallpaperCompositions: {
                        [wpUrl]: { focalX: 0.3, focalY: 0.7 },
                    },
                }),
            });

            // Simulate file deletion failure when removing the staged .deleting file
            let failOnce = true;
            // @ts-ignore: stub Deno.remove for failure testing
            Deno.remove = async (
                path: string | URL,
                options?: Deno.RemoveOptions,
            ) => {
                if (
                    failOnce && typeof path === "string" &&
                    path.endsWith(".deleting")
                ) {
                    failOnce = false;
                    throw new Error("Simulated disk error during unlink");
                }
                return await origRemove(path, options);
            };

            // Attempt to DELETE -> should fail with 500 due to file deletion error
            const delRes = await app.request(wpUrl, {
                method: "DELETE",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
            });
            assertEquals(delRes.status, 500);

            // Restore Deno.remove
            Deno.remove = origRemove;

            // Verify full rollback:
            // 1. Staged file was renamed back to original .bin
            const fileStat = await Deno.stat(join(tempDir, `${id}.bin`));
            assertEquals(fileStat.isFile, true);

            // 2. Manifest record was restored
            const manifestContent = await Deno.readTextFile(
                join(tempDir, "manifest.json"),
            );
            const manifest = JSON.parse(manifestContent);
            assertEquals(
                manifest.some((r: { id: string }) => r.id === id),
                true,
            );

            // 3. DB preferences were rolled back and still reference the wallpaper
            const prefRes = await app.request("/api/preferences", {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${user.token}` },
            });
            const prefBody = await prefRes.json() as Envelope<PreferencesDto>;
            assertEquals(prefBody.data?.backgroundImage, wpUrl);
            assertEquals(
                prefBody.data?.wallpaperPresentations?.[wpUrl]?.composition,
                { focalX: 0.3, focalY: 0.7 },
            );

            // 4. Wallpaper is still accessible by the user
            const getRes = await app.request(wpUrl, {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${user.token}` },
            });
            assertEquals(getRes.status, STATUS_CODE.OK);

            await store.close();
        } finally {
            Deno.remove = origRemove;
            await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        }
    },
});

Deno.test({
    name:
        "wallpaper: preferences PATCH persists canonical sources and clears legacy raw/uppercase keys on delete",
    async fn() {
        const tempDir = await Deno.makeTempDir({
            prefix: "searcher_test_canonical_",
        });
        try {
            const { store, app } = await setupTestApp(tempDir);
            const user = await createTestUser(app, "canonical_user");

            // Upload wallpaper
            const form = new FormData();
            form.append(
                "image",
                new Blob([new Uint8Array([...PNG_HEADER, 1])], {
                    type: "image/png",
                }),
                "canon.png",
            );
            const upRes = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: form,
            });
            const { id } = (await upRes.json() as Envelope<
                { id: string; url: string }
            >).data!;

            // 1. PATCH preferences with uppercase UUID and untrimmed spaces
            const upperUrl = ` /api/wallpaper/${id.toUpperCase()} `;
            const patchRes = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: JSON.stringify({
                    backgroundImage: upperUrl,
                    wallpaperCompositions: {
                        [upperUrl]: { focalX: 0.2, focalY: 0.8 },
                    },
                }),
            });
            assertEquals(patchRes.status, STATUS_CODE.OK);

            // Verify stored preferences use lowercase canonical keys
            const prefRes = await app.request("/api/preferences", {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${user.token}` },
            });
            const prefBody = await prefRes.json() as Envelope<PreferencesDto>;
            const canonicalUrl = `/api/wallpaper/${id.toLowerCase()}`;
            assertEquals(prefBody.data?.backgroundImage, canonicalUrl);
            assertEquals(
                prefBody.data?.wallpaperPresentations?.[canonicalUrl]
                    ?.composition,
                { focalX: 0.2, focalY: 0.8 },
            );

            // 2. Delete wallpaper using lowercase URL -> clears reference & composition
            const delRes = await app.request(canonicalUrl, {
                method: "DELETE",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
            });
            assertEquals(delRes.status, STATUS_CODE.OK);

            const postDelPref = await app.request("/api/preferences", {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${user.token}` },
            });
            const postDelBody = await postDelPref.json() as Envelope<
                PreferencesDto
            >;
            assertEquals(postDelBody.data?.backgroundImage, null);
            assertEquals(
                postDelBody.data?.wallpaperPresentations?.[canonicalUrl],
                undefined,
            );

            await store.close();
        } finally {
            await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        }
    },
});

Deno.test({
    name:
        "wallpaper: preferences PATCH validates all keys before mutation (zero partial updates)",
    async fn() {
        const tempDir = await Deno.makeTempDir({
            prefix: "searcher_test_atomic_patch_",
        });
        try {
            const { store, app, wallpaper } = await setupTestApp(tempDir);
            const alice = await createTestUser(app, "atomic_alice");
            const bob = await createTestUser(app, "atomic_bob");

            // Alice uploads a wallpaper (A)
            const formA = new FormData();
            formA.append(
                "image",
                new Blob([new Uint8Array([...PNG_HEADER, 1])], {
                    type: "image/png",
                }),
                "alice.png",
            );
            const upA = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: formA,
            });
            const urlA = (await upA.json() as Envelope<{ url: string }>).data!
                .url;
            const idA = urlA.replace("/api/wallpaper/", "");

            // Bob uploads a wallpaper (B)
            const formB = new FormData();
            formB.append(
                "image",
                new Blob([new Uint8Array([...PNG_HEADER, 2])], {
                    type: "image/png",
                }),
                "bob.png",
            );
            const upB = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${bob.token}`,
                },
                body: formB,
            });
            const urlB = (await upB.json() as Envelope<{ url: string }>).data!
                .url;

            // Alice attempts to PATCH preferences with A (owned, new focal 0.1/0.9) AND B (unowned)
            const patchRes = await app.request("/api/preferences", {
                method: "PATCH",
                headers: {
                    origin: ORIGIN,
                    "content-type": "application/json",
                    cookie: `${SESSION_COOKIE_NAME}=${alice.token}`,
                },
                body: JSON.stringify({
                    wallpaperCompositions: {
                        [urlA]: { focalX: 0.1, focalY: 0.9 },
                        [urlB]: { focalX: 0.3, focalY: 0.7 },
                    },
                }),
            });
            // Must fail with 404 because urlB is not owned
            assertEquals(patchRes.status, STATUS_CODE.NotFound);

            // Verify Alice's wallpaper A in manifest was NOT partially mutated
            const getA = await wallpaper.getWallpaper(idA, alice.user.id);
            assertEquals(getA?.record.focalX, 0.5);
            assertEquals(getA?.record.focalY, 0.5);

            await store.close();
        } finally {
            await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        }
    },
});

Deno.test({
    name:
        "wallpaper: updateWallpaperComposition rolls back manifest on DB preferences failure",
    async fn() {
        const tempDir = await Deno.makeTempDir({
            prefix: "searcher_test_comp_rollback_",
        });
        try {
            const { store, app, wallpaper } = await setupTestApp(tempDir);
            const user = await createTestUser(app, "comp_rb_user");

            const form = new FormData();
            form.append(
                "image",
                new Blob([new Uint8Array([...PNG_HEADER, 1])], {
                    type: "image/png",
                }),
                "comp.png",
            );
            const upRes = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: form,
            });
            const { id } = (await upRes.json() as Envelope<
                { id: string; url: string }
            >).data!;

            // Verify initial focal is 0.5, 0.5
            const initial = await wallpaper.getWallpaper(id, user.user.id);
            assertEquals(initial?.record.focalX, 0.5);
            assertEquals(initial?.record.focalY, 0.5);

            // Intercept store.run to simulate a database failure during update
            const origRun = store.run.bind(store);
            let failNextDb = true;
            // @ts-ignore: mock store.run for testing DB failure
            store.run = async (fn: unknown) => {
                if (failNextDb) {
                    failNextDb = false;
                    throw new Error("Simulated DB connection failure");
                }
                return await origRun(fn as Parameters<typeof origRun>[0]);
            };

            // Attempt to update composition -> must throw error due to DB failure
            let threw = false;
            try {
                await wallpaper.updateWallpaperComposition(id, user.user.id, {
                    focalX: 0.1,
                    focalY: 0.9,
                });
            } catch {
                threw = true;
            }
            assertEquals(
                threw,
                true,
                "updateWallpaperComposition must throw when DB update fails",
            );

            // Restore store.run
            store.run = origRun;

            // Verify manifest was rolled back to initial focal 0.5, 0.5
            const postFailure = await wallpaper.getWallpaper(id, user.user.id);
            assertEquals(
                postFailure?.record.focalX,
                0.5,
                "FocalX must be rolled back on DB failure",
            );
            assertEquals(
                postFailure?.record.focalY,
                0.5,
                "FocalY must be rolled back on DB failure",
            );

            await store.close();
        } finally {
            await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        }
    },
});

Deno.test({
    name:
        "wallpaper: multi-payload eviction rollback restores unlinked files from in-memory bytes",
    async fn() {
        const tempDir = await Deno.makeTempDir({
            prefix: "searcher_test_multi_evict_rb_",
        });
        const origRemove = Deno.remove;
        try {
            // max 2 wallpapers
            const { store, app } = await setupTestApp(tempDir, 2);
            const user = await createTestUser(app, "multi_evict_user");

            // Upload 2 wallpapers: w1 and w2
            const urls: string[] = [];
            for (let i = 1; i <= 2; i++) {
                const f = new FormData();
                f.append(
                    "image",
                    new Blob([new Uint8Array([...PNG_HEADER, i, 10, 20])], {
                        type: "image/png",
                    }),
                    `w${i}.png`,
                );
                const res = await app.request("/api/wallpaper", {
                    method: "POST",
                    headers: {
                        origin: ORIGIN,
                        cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                    },
                    body: f,
                });
                urls.push(
                    (await res.json() as Envelope<{ url: string }>).data!.url,
                );
            }

            // Simulate failure during unlink of evicted payload
            let failUnlink = true;
            // @ts-ignore: mock Deno.remove
            Deno.remove = async (
                path: string | URL,
                options?: Deno.RemoveOptions,
            ) => {
                if (
                    failUnlink && typeof path === "string" &&
                    path.endsWith(".deleting")
                ) {
                    failUnlink = false;
                    throw new Error(
                        "Simulated disk error during eviction unlink",
                    );
                }
                return await origRemove(path, options);
            };

            // Upload w3 -> causes w1 to be evicted, but unlink fails!
            const f3 = new FormData();
            f3.append(
                "image",
                new Blob([new Uint8Array([...PNG_HEADER, 3, 30, 40])], {
                    type: "image/png",
                }),
                "w3.png",
            );
            const res3 = await app.request("/api/wallpaper", {
                method: "POST",
                headers: {
                    origin: ORIGIN,
                    cookie: `${SESSION_COOKIE_NAME}=${user.token}`,
                },
                body: f3,
            });
            // Must return 500 or error
            assertEquals(res3.status, 500);

            // Restore Deno.remove
            Deno.remove = origRemove;

            // Verify rollback: w1's file was restored on disk from in-memory bytes and is still accessible!
            const w1Id = urls[0].replace("/api/wallpaper/", "");
            const w1Stat = await Deno.stat(join(tempDir, `${w1Id}.bin`));
            assertEquals(w1Stat.isFile, true);

            // w1 is still accessible via GET
            const getW1 = await app.request(urls[0], {
                headers: { cookie: `${SESSION_COOKIE_NAME}=${user.token}` },
            });
            assertEquals(getW1.status, STATUS_CODE.OK);

            await store.close();
        } finally {
            Deno.remove = origRemove;
            await Deno.remove(tempDir, { recursive: true }).catch(() => {});
        }
    },
});
