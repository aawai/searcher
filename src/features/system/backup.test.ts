import { assertEquals, assertMatch, assertRejects } from "@std/assert";
import * as fflate from "fflate";
import { DatabaseSync } from "node:sqlite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { DatabaseStore, openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { preferences, users } from "../../db/schema.ts";
import { SystemService } from "./service.ts";
import { SystemSettingsStore } from "./settings-store.ts";
import { WallpaperService } from "../wallpaper/service.ts";
import { WebAppIconService } from "../webapp-icons/service.ts";
import { DocumentsService } from "../documents/service.ts";
import { DocumentAssetsService } from "../documents/assets.ts";

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

Deno.test("backup prevalidation: valid backup zip with wallpapers and settings passes", async () => {
    const dir = await Deno.makeTempDir({ prefix: "searcher_test_backup_" });
    const wallpaperDir = `${dir}/wallpapers`;
    const iconDir = `${dir}/icons`;
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const settingsStore = new SystemSettingsStore(`${dir}/settings.json`);
        const wallpaperService = new WallpaperService(wallpaperDir);
        const iconService = new WebAppIconService(iconDir);

        const userId = crypto.randomUUID();
        const now = Date.now();
        await store.run(async (db) => {
            await db.insert(users).values({
                id: userId,
                username: "testuser",
                displayName: "Test User",
                passwordHash: "dummyhash",
                role: "user",
                disabled: false,
                authVersion: 1,
                createdAt: now,
                updatedAt: now,
            });
        });

        // Save a valid wallpaper for user
        const { id: wallpaperId } = await wallpaperService.saveWallpaper(
            userId,
            PNG_HEADER,
        );

        // Update user preference to reference this wallpaper
        await store.run(async (db) => {
            await db.insert(preferences).values({
                userId,
                backgroundImage: `/api/wallpaper/${wallpaperId}`,
            });
        });

        const systemService = new SystemService({
            store,
            settingsStore,
            wallpaperService,
            iconService,
            now: () => now,
        });

        const zipBytes = await systemService.createFullBackupZip();

        // Validate backup zip
        const validation = await systemService.validateBackupZip(zipBytes);
        assertEquals(validation.valid, true);
        assertEquals(validation.manifest?.assets.wallpapersCount, 1);
    } finally {
        await store.close();
        await Deno.remove(dir, { recursive: true });
    }
});

Deno.test("backup prevalidation: focal handling supports old manifest and validates new 0..1", async () => {
    const dir = await Deno.makeTempDir({
        prefix: "searcher_test_backup_focal_",
    });
    const wallpaperDir = `${dir}/wallpapers`;
    const iconDir = `${dir}/icons`;
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const settingsStore = new SystemSettingsStore(`${dir}/settings.json`);
        const wallpaperService = new WallpaperService(wallpaperDir);
        const iconService = new WebAppIconService(iconDir);
        const userId = crypto.randomUUID();
        const now = Date.now();
        await store.run(async (db) => {
            await db.insert(users).values({
                id: userId,
                username: "focaluser",
                displayName: "Focal User",
                passwordHash: "dummyhash",
                role: "user",
                disabled: false,
                authVersion: 1,
                createdAt: now,
                updatedAt: now,
            });
        });

        const { id: wallpaperId } = await wallpaperService.saveWallpaper(
            userId,
            PNG_HEADER,
        );
        const systemService = new SystemService({
            store,
            settingsStore,
            wallpaperService,
            iconService,
            now: () => now,
        });

        const zipBytes = await systemService.createFullBackupZip();
        const unzipped = fflate.unzipSync(zipBytes);

        // Case 1: Old manifest without focal coordinates (missing focalX, focalY)
        const oldManifest = [
            {
                id: wallpaperId,
                userId,
                contentType: "image/png",
                size: PNG_HEADER.length,
                createdAt: now,
            },
        ];
        const oldZip = fflate.zipSync({
            ...unzipped,
            "assets/wallpapers/manifest.json": new TextEncoder().encode(
                JSON.stringify(oldManifest),
            ),
        });
        const oldValidation = await systemService.validateBackupZip(oldZip);
        assertEquals(oldValidation.valid, true);

        // Case 2: New manifest with valid focal coordinates (0.2, 0.8)
        const newManifest = [
            {
                id: wallpaperId,
                userId,
                contentType: "image/png",
                size: PNG_HEADER.length,
                createdAt: now,
                focalX: 0.2,
                focalY: 0.8,
            },
        ];
        const newZip = fflate.zipSync({
            ...unzipped,
            "assets/wallpapers/manifest.json": new TextEncoder().encode(
                JSON.stringify(newManifest),
            ),
        });
        const newValidation = await systemService.validateBackupZip(newZip);
        assertEquals(newValidation.valid, true);

        // Case 3: Invalid focal coordinates (focalX > 1)
        const invalidFocalZip = fflate.zipSync({
            ...unzipped,
            "assets/wallpapers/manifest.json": new TextEncoder().encode(
                JSON.stringify([
                    {
                        ...newManifest[0],
                        focalX: 1.5,
                    },
                ]),
            ),
        });
        const invalidValidation = await systemService.validateBackupZip(
            invalidFocalZip,
        );
        assertEquals(invalidValidation.valid, false);
        assertMatch(invalidValidation.error ?? "", /非法记录|字段缺失/);

        // Case 4: Partial focal coordinates (focalX present but focalY missing)
        const partialFocalZip = fflate.zipSync({
            ...unzipped,
            "assets/wallpapers/manifest.json": new TextEncoder().encode(
                JSON.stringify([
                    {
                        id: wallpaperId,
                        userId,
                        contentType: "image/png",
                        size: PNG_HEADER.length,
                        createdAt: now,
                        focalX: 0.5,
                        focalY: -0.2,
                    },
                ]),
            ),
        });
        const partialValidation = await systemService.validateBackupZip(
            partialFocalZip,
        );
        assertEquals(partialValidation.valid, false);
        assertMatch(partialValidation.error ?? "", /非法记录|字段缺失/);
    } finally {
        await store.close();
        await Deno.remove(dir, { recursive: true });
    }
});

Deno.test("backup prevalidation: payload presence and rejects extra unmanifested payloads", async () => {
    const dir = await Deno.makeTempDir({
        prefix: "searcher_test_backup_payload_",
    });
    const wallpaperDir = `${dir}/wallpapers`;
    const iconDir = `${dir}/icons`;
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const settingsStore = new SystemSettingsStore(`${dir}/settings.json`);
        const wallpaperService = new WallpaperService(wallpaperDir);
        const iconService = new WebAppIconService(iconDir);
        const userId = crypto.randomUUID();
        const now = Date.now();
        await store.run(async (db) => {
            await db.insert(users).values({
                id: userId,
                username: "payloaduser",
                displayName: "Payload User",
                passwordHash: "dummyhash",
                role: "user",
                disabled: false,
                authVersion: 1,
                createdAt: now,
                updatedAt: now,
            });
        });

        const { id: wallpaperId } = await wallpaperService.saveWallpaper(
            userId,
            PNG_HEADER,
        );
        const systemService = new SystemService({
            store,
            settingsStore,
            wallpaperService,
            iconService,
            now: () => now,
        });

        const zipBytes = await systemService.createFullBackupZip();
        const unzipped = fflate.unzipSync(zipBytes);

        // Case 1: Payload missing for declared record
        const missingPayloadFiles = { ...unzipped };
        delete missingPayloadFiles[`assets/wallpapers/${wallpaperId}.bin`];
        const missingPayloadZip = fflate.zipSync(missingPayloadFiles);
        const missingRes = await systemService.validateBackupZip(
            missingPayloadZip,
        );
        assertEquals(missingRes.valid, false);
        assertMatch(missingRes.error ?? "", /资源文件不存在/);

        // Case 2: Extra unmanifested payload in assets/wallpapers
        const extraPayloadFiles = {
            ...unzipped,
            "assets/wallpapers/extra-unmanifested.bin": PNG_HEADER,
        };
        const extraPayloadZip = fflate.zipSync(extraPayloadFiles);
        const extraRes = await systemService.validateBackupZip(extraPayloadZip);
        assertEquals(extraRes.valid, false);
        assertMatch(extraRes.error ?? "", /多余文件/);

        // Case 3: Wallpaper payloads present but manifest.json missing
        const noManifestFiles = { ...unzipped };
        delete noManifestFiles["assets/wallpapers/manifest.json"];
        const noManifestZip = fflate.zipSync(noManifestFiles);
        const noManifestRes = await systemService.validateBackupZip(
            noManifestZip,
        );
        assertEquals(noManifestRes.valid, false);
        assertMatch(noManifestRes.error ?? "", /缺少 manifest\.json 清单/);
    } finally {
        await store.close();
        await Deno.remove(dir, { recursive: true });
    }
});

Deno.test("backup prevalidation: enforces payload size and magic bytes content-type consistency", async () => {
    const dir = await Deno.makeTempDir({
        prefix: "searcher_test_backup_magic_",
    });
    const wallpaperDir = `${dir}/wallpapers`;
    const iconDir = `${dir}/icons`;
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const settingsStore = new SystemSettingsStore(`${dir}/settings.json`);
        const wallpaperService = new WallpaperService(wallpaperDir);
        const iconService = new WebAppIconService(iconDir);
        const userId = crypto.randomUUID();
        const now = Date.now();
        await store.run(async (db) => {
            await db.insert(users).values({
                id: userId,
                username: "magicuser",
                displayName: "Magic User",
                passwordHash: "dummyhash",
                role: "user",
                disabled: false,
                authVersion: 1,
                createdAt: now,
                updatedAt: now,
            });
        });

        const { id: wallpaperId } = await wallpaperService.saveWallpaper(
            userId,
            PNG_HEADER,
        );
        const systemService = new SystemService({
            store,
            settingsStore,
            wallpaperService,
            iconService,
            now: () => now,
        });

        const zipBytes = await systemService.createFullBackupZip();
        const unzipped = fflate.unzipSync(zipBytes);

        // Case 1: Size mismatch (manifest size 99999 vs actual PNG_HEADER.length)
        const sizeMismatchManifest = [
            {
                id: wallpaperId,
                userId,
                contentType: "image/png",
                size: 99999,
                createdAt: now,
            },
        ];
        const sizeMismatchZip = fflate.zipSync({
            ...unzipped,
            "assets/wallpapers/manifest.json": new TextEncoder().encode(
                JSON.stringify(sizeMismatchManifest),
            ),
        });
        const sizeRes = await systemService.validateBackupZip(sizeMismatchZip);
        assertEquals(sizeRes.valid, false);
        assertMatch(sizeRes.error ?? "", /大小/);

        // Case 2: SVG / non-raster payload
        const svgPayload = new TextEncoder().encode(
            "<svg xmlns='http://www.w3.org/2000/svg'><circle/></svg>",
        );
        const svgManifest = [
            {
                id: wallpaperId,
                userId,
                contentType: "image/png",
                size: svgPayload.length,
                createdAt: now,
            },
        ];
        const svgZip = fflate.zipSync({
            ...unzipped,
            [`assets/wallpapers/${wallpaperId}.bin`]: svgPayload,
            "assets/wallpapers/manifest.json": new TextEncoder().encode(
                JSON.stringify(svgManifest),
            ),
        });
        const svgRes = await systemService.validateBackupZip(svgZip);
        assertEquals(svgRes.valid, false);
        assertMatch(svgRes.error ?? "", /不是合法的栅格图片/);

        // Case 3: Content-Type mismatch (manifest says image/jpeg, but payload has PNG magic bytes)
        const mismatchManifest = [
            {
                id: wallpaperId,
                userId,
                contentType: "image/jpeg",
                size: PNG_HEADER.length,
                createdAt: now,
            },
        ];
        const mismatchZip = fflate.zipSync({
            ...unzipped,
            "assets/wallpapers/manifest.json": new TextEncoder().encode(
                JSON.stringify(mismatchManifest),
            ),
        });
        const mismatchRes = await systemService.validateBackupZip(mismatchZip);
        assertEquals(mismatchRes.valid, false);
        assertMatch(mismatchRes.error ?? "", /实际内容类型/);
    } finally {
        await store.close();
        await Deno.remove(dir, { recursive: true });
    }
});

Deno.test("backup prevalidation: enforces per-user quota limit (max 5 wallpapers)", async () => {
    const dir = await Deno.makeTempDir({
        prefix: "searcher_test_backup_quota_",
    });
    const wallpaperDir = `${dir}/wallpapers`;
    const iconDir = `${dir}/icons`;
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const settingsStore = new SystemSettingsStore(`${dir}/settings.json`);
        const wallpaperService = new WallpaperService(wallpaperDir);
        const iconService = new WebAppIconService(iconDir);
        const userId = crypto.randomUUID();
        const now = Date.now();
        await store.run(async (db) => {
            await db.insert(users).values({
                id: userId,
                username: "quotauser",
                displayName: "Quota User",
                passwordHash: "dummyhash",
                role: "user",
                disabled: false,
                authVersion: 1,
                createdAt: now,
                updatedAt: now,
            });
        });

        const systemService = new SystemService({
            store,
            settingsStore,
            wallpaperService,
            iconService,
            now: () => now,
        });

        const zipBytes = await systemService.createFullBackupZip();
        const unzipped = fflate.unzipSync(zipBytes);

        // Create 6 wallpapers for the same user
        const records = [];
        const extraFiles: Record<string, Uint8Array> = {};
        for (let i = 0; i < 6; i++) {
            const id = crypto.randomUUID();
            records.push({
                id,
                userId,
                contentType: "image/png",
                size: PNG_HEADER.length,
                createdAt: now + i,
            });
            extraFiles[`assets/wallpapers/${id}.bin`] = PNG_HEADER;
        }

        const quotaZip = fflate.zipSync({
            ...unzipped,
            ...extraFiles,
            "assets/wallpapers/manifest.json": new TextEncoder().encode(
                JSON.stringify(records),
            ),
            "manifest.json": new TextEncoder().encode(
                JSON.stringify({
                    ...JSON.parse(
                        new TextDecoder().decode(unzipped["manifest.json"]),
                    ),
                    assets: { wallpapersCount: 6, iconsCount: 0 },
                }),
            ),
        });

        const quotaRes = await systemService.validateBackupZip(quotaZip);
        assertEquals(quotaRes.valid, false);
        assertMatch(quotaRes.error ?? "", /配额限制/);
    } finally {
        await store.close();
        await Deno.remove(dir, { recursive: true });
    }
});

Deno.test("backup prevalidation: enforces preference local refs exist AND are owned", async () => {
    const dir = await Deno.makeTempDir({
        prefix: "searcher_test_backup_pref_",
    });
    const wallpaperDir = `${dir}/wallpapers`;
    const iconDir = `${dir}/icons`;
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const settingsStore = new SystemSettingsStore(`${dir}/settings.json`);
        const wallpaperService = new WallpaperService(wallpaperDir);
        const iconService = new WebAppIconService(iconDir);
        const userAlice = crypto.randomUUID();
        const userBob = crypto.randomUUID();
        const now = Date.now();
        await store.run(async (db) => {
            await db.insert(users).values({
                id: userAlice,
                username: "alice",
                displayName: "Alice",
                passwordHash: "dummyhash",
                role: "user",
                disabled: false,
                authVersion: 1,
                createdAt: now,
                updatedAt: now,
            });
            await db.insert(users).values({
                id: userBob,
                username: "bob",
                displayName: "Bob",
                passwordHash: "dummyhash",
                role: "user",
                disabled: false,
                authVersion: 1,
                createdAt: now,
                updatedAt: now,
            });
        });

        // Alice and Bob each have a wallpaper
        const { id: aliceWallpaperId } = await wallpaperService.saveWallpaper(
            userAlice,
            PNG_HEADER,
        );
        const { id: bobWallpaperId } = await wallpaperService.saveWallpaper(
            userBob,
            PNG_HEADER,
        );

        // Alice legitimately uses her own wallpaper
        await store.run(async (db) => {
            await db.insert(preferences).values({
                userId: userAlice,
                backgroundImage: `/api/wallpaper/${aliceWallpaperId}`,
            });
        });

        const systemService = new SystemService({
            store,
            settingsStore,
            wallpaperService,
            iconService,
            now: () => now,
        });

        const zipBytes = await systemService.createFullBackupZip();
        const validCheck = await systemService.validateBackupZip(zipBytes);
        assertEquals(validCheck.valid, true);

        // Case 1: Preference references dangling non-existent wallpaper ID
        const danglingId = crypto.randomUUID();
        await store.run(async (db) => {
            await db.update(preferences)
                .set({ backgroundImage: `/api/wallpaper/${danglingId}` })
                .where(users ? undefined : undefined); // update all
        });
        const danglingZip = await systemService.createFullBackupZip();
        const danglingCheck = await systemService.validateBackupZip(
            danglingZip,
        );
        assertEquals(danglingCheck.valid, false);
        assertMatch(danglingCheck.error ?? "", /不存在/);

        // Case 2: Alice references Bob's wallpaper (unowned cross-user reference)
        await store.run(async (db) => {
            await db.update(preferences)
                .set({ backgroundImage: `/api/wallpaper/${bobWallpaperId}` });
        });
        const unownedZip = await systemService.createFullBackupZip();
        const unownedCheck = await systemService.validateBackupZip(unownedZip);
        assertEquals(unownedCheck.valid, false);
        assertMatch(unownedCheck.error ?? "", /不属于该用户/);

        // Case 3: Alice references an external HTTPS image or CSS gradient (not a local wallpaper)
        await store.run(async (db) => {
            await db.update(preferences)
                .set({ backgroundImage: "https://example.com/pic.jpg" });
        });
        const externalZip = await systemService.createFullBackupZip();
        const externalCheck = await systemService.validateBackupZip(
            externalZip,
        );
        assertEquals(externalCheck.valid, true);
    } finally {
        await store.close();
        await Deno.remove(dir, { recursive: true });
    }
});

Deno.test("backup restore: validates before restore and fails closed on corrupted backup", async () => {
    const dir = await Deno.makeTempDir({
        prefix: "searcher_test_restore_fail_",
    });
    const wallpaperDir = `${dir}/wallpapers`;
    const iconDir = `${dir}/icons`;
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const settingsStore = new SystemSettingsStore(`${dir}/settings.json`);
        const wallpaperService = new WallpaperService(wallpaperDir);
        const iconService = new WebAppIconService(iconDir);
        const userId = crypto.randomUUID();
        const now = Date.now();
        await store.run(async (db) => {
            await db.insert(users).values({
                id: userId,
                username: "restoreuser",
                displayName: "Restore User",
                passwordHash: "dummyhash",
                role: "user",
                disabled: false,
                authVersion: 1,
                createdAt: now,
                updatedAt: now,
            });
        });

        const { id: wallpaperId } = await wallpaperService.saveWallpaper(
            userId,
            PNG_HEADER,
        );
        const systemService = new SystemService({
            store,
            settingsStore,
            wallpaperService,
            iconService,
            now: () => now,
        });

        const zipBytes = await systemService.createFullBackupZip();
        const unzipped = fflate.unzipSync(zipBytes);

        // Corrupt by removing wallpaper payload
        const corruptedFiles = { ...unzipped };
        delete corruptedFiles[`assets/wallpapers/${wallpaperId}.bin`];
        const corruptedZip = fflate.zipSync(corruptedFiles);

        // Attempt restore - MUST throw before restore/snapshot
        await assertRejects(
            async () => {
                await systemService.restoreFromBackupZip(corruptedZip);
            },
            Error,
            "资源文件不存在",
        );
    } finally {
        await store.close();
        await Deno.remove(dir, { recursive: true });
    }
});

Deno.test("backup smoke: roundtrip full backup and restore preserves wallpaper files and database", async () => {
    const dir = await Deno.makeTempDir({ prefix: "searcher_test_smoke_" });
    const dbFile = `${dir}/searcher.sqlite`;
    const wallpaperDir = `${dir}/wallpapers`;
    const iconDir = `${dir}/icons`;
    const store = openDatabase(dbFile);
    try {
        await migrateDatabase(store);
        const settingsStore = new SystemSettingsStore(`${dir}/settings.json`);
        const wallpaperService = new WallpaperService(wallpaperDir);
        const iconService = new WebAppIconService(iconDir);
        const userId = crypto.randomUUID();
        const now = Date.now();

        await store.run(async (db) => {
            await db.insert(users).values({
                id: userId,
                username: "smokeuser",
                displayName: "Smoke User",
                passwordHash: "dummyhash",
                role: "user",
                disabled: false,
                authVersion: 1,
                createdAt: now,
                updatedAt: now,
            });
        });

        // Save uploaded wallpaper
        const { id: wallpaperId } = await wallpaperService.saveWallpaper(
            userId,
            PNG_HEADER,
        );
        await store.run(async (db) => {
            await db.insert(preferences).values({
                userId,
                backgroundImage: `/api/wallpaper/${wallpaperId}`,
            });
        });

        const systemService = new SystemService({
            store,
            settingsStore,
            wallpaperService,
            iconService,
            now: () => now,
        });

        const documentsService = new DocumentsService(store);
        const assetsService = new DocumentAssetsService(store);
        const document = await documentsService.create(userId, {
            title: "Backup document",
            body: "Original body",
        });
        const asset = await assetsService.upload(userId, document.id, {
            bytes: PNG_HEADER,
            mimeType: "image/png",
            originalName: "backup.png",
        });
        const saved = await documentsService.update(userId, document.id, {
            version: document.version,
            body: `![backup](asset://${asset.assetId})`,
            origin: "manual",
        });
        // 1. Create full backup
        const zipBytes = await systemService.createFullBackupZip();

        // 2. Validate backup
        const validation = await systemService.validateBackupZip(zipBytes);
        assertEquals(validation.valid, true);
        assertEquals(validation.manifest?.assets.wallpapersCount, 1);

        // 3. Mutate current state: delete wallpaper and modify preference
        await wallpaperService.deleteWallpaper(wallpaperId, userId);
        await store.run(async (db) => {
            await db.update(preferences)
                .set({ backgroundImage: null })
                .where(users ? undefined : undefined);
        });
        await documentsService.permanentDelete(
            userId,
            document.id,
            saved.version,
        );

        // Verify wallpaper was deleted
        const deletedCheck = await wallpaperService.getWallpaper(
            wallpaperId,
            userId,
        );
        assertEquals(deletedCheck, null);

        // 4. Restore from backup
        const restoreResult = await systemService.restoreFromBackupZip(
            zipBytes,
        );
        assertEquals(restoreResult.snapshotCreated, true);
        assertEquals(restoreResult.manifest.appName, "Searcher");
        assertEquals(restoreResult.warnings, []);

        // 5. Verify restored state: wallpaper file is back and readable
        const restoredWallpaper = await wallpaperService.getWallpaper(
            wallpaperId,
            userId,
        );
        assertEquals(restoredWallpaper !== null, true);
        assertEquals(restoredWallpaper?.bytes, PNG_HEADER);

        // 6. Verify restored preference in database
        const restoredPrefs = await store.run(async (db) =>
            await db.select({ bg: preferences.backgroundImage })
                .from(preferences)
                .all()
        );
        assertEquals(restoredPrefs[0]?.bg, `/api/wallpaper/${wallpaperId}`);
        assertEquals(
            (await documentsService.get(userId, document.id)).body,
            saved.body,
        );
        assertEquals(
            (await assetsService.read(userId, document.id, asset.assetId))
                .bytes,
            PNG_HEADER,
        );
        assertEquals(
            (await documentsService.versions(userId, document.id)).map(
                (version) => version.reason,
            ),
            ["manual", "snapshot"],
        );
    } finally {
        await store.close();
        await Deno.remove(dir, { recursive: true });
    }
});

Deno.test("backup prevalidation: validates wallpaperCompositions local references and ownership", async () => {
    const dir = await Deno.makeTempDir({
        prefix: "searcher_test_backup_comp_",
    });
    const wallpaperDir = `${dir}/wallpapers`;
    const iconDir = `${dir}/icons`;
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const settingsStore = new SystemSettingsStore(`${dir}/settings.json`);
        const wallpaperService = new WallpaperService(wallpaperDir);
        const iconService = new WebAppIconService(iconDir);
        const userAlice = crypto.randomUUID();
        const userBob = crypto.randomUUID();
        const now = Date.now();

        await store.run(async (db) => {
            await db.insert(users).values({
                id: userAlice,
                username: "alice_comp",
                displayName: "Alice Comp",
                passwordHash: "dummyhash",
                role: "user",
                disabled: false,
                authVersion: 1,
                createdAt: now,
                updatedAt: now,
            });
            await db.insert(users).values({
                id: userBob,
                username: "bob_comp",
                displayName: "Bob Comp",
                passwordHash: "dummyhash",
                role: "user",
                disabled: false,
                authVersion: 1,
                createdAt: now,
                updatedAt: now,
            });
        });

        const { id: aliceWallpaperId } = await wallpaperService.saveWallpaper(
            userAlice,
            PNG_HEADER,
        );
        const { id: bobWallpaperId } = await wallpaperService.saveWallpaper(
            userBob,
            PNG_HEADER,
        );

        // Alice legitimately uses her own wallpaper in compositions
        await store.run(async (db) => {
            await db.insert(preferences).values({
                userId: userAlice,
                wallpaperCompositions: JSON.stringify({
                    [`/api/wallpaper/${aliceWallpaperId}`]: {
                        focalX: 0.3,
                        focalY: 0.7,
                    },
                    "https://example.com/remote.jpg": {
                        focalX: 0.5,
                        focalY: 0.5,
                    },
                }),
            });
        });

        const systemService = new SystemService({
            store,
            settingsStore,
            wallpaperService,
            iconService,
            now: () => now,
        });

        // Case 1: Valid composition passes
        const validZip = await systemService.createFullBackupZip();
        const validRes = await systemService.validateBackupZip(validZip);
        assertEquals(validRes.valid, true);

        // Case 2: Alice references Bob's wallpaper in compositions (unowned)
        await store.run(async (db) => {
            await db.update(preferences)
                .set({
                    wallpaperCompositions: JSON.stringify({
                        [`/api/wallpaper/${bobWallpaperId}`]: {
                            focalX: 0.1,
                            focalY: 0.9,
                        },
                    }),
                })
                .where(users ? undefined : undefined);
        });
        const unownedZip = await systemService.createFullBackupZip();
        const unownedRes = await systemService.validateBackupZip(unownedZip);
        assertEquals(unownedRes.valid, false);
        assertMatch(unownedRes.error ?? "", /不属于该用户/);

        // Case 3: Alice references a dangling non-existent wallpaper in compositions
        const danglingId = crypto.randomUUID();
        await store.run(async (db) => {
            await db.update(preferences)
                .set({
                    wallpaperCompositions: JSON.stringify({
                        [`/api/wallpaper/${danglingId}`]: {
                            focalX: 0.5,
                            focalY: 0.5,
                        },
                    }),
                })
                .where(users ? undefined : undefined);
        });
        const danglingZip = await systemService.createFullBackupZip();
        const danglingRes = await systemService.validateBackupZip(danglingZip);
        assertEquals(danglingRes.valid, false);
        assertMatch(danglingRes.error ?? "", /不存在/);
    } finally {
        await store.close();
        await Deno.remove(dir, { recursive: true });
    }
});

Deno.test("backup concurrency: concurrent backup and delete produces consistent valid backup and ignores transient .deleting files", async () => {
    const dir = await Deno.makeTempDir({
        prefix: "searcher_test_backup_concurrent_",
    });
    const wallpaperDir = `${dir}/wallpapers`;
    const iconDir = `${dir}/icons`;
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        const settingsStore = new SystemSettingsStore(`${dir}/settings.json`);
        const wallpaperService = new WallpaperService(wallpaperDir);
        const iconService = new WebAppIconService(iconDir);
        const userId = crypto.randomUUID();
        const now = Date.now();

        await store.run(async (db) => {
            await db.insert(users).values({
                id: userId,
                username: "concurrent_user",
                displayName: "Concurrent User",
                passwordHash: "dummyhash",
                role: "user",
                disabled: false,
                authVersion: 1,
                createdAt: now,
                updatedAt: now,
            });
        });

        // Save 2 wallpapers
        const { id: wp1 } = await wallpaperService.saveWallpaper(
            userId,
            PNG_HEADER,
        );
        const { id: wp2 } = await wallpaperService.saveWallpaper(
            userId,
            PNG_HEADER,
        );

        // Simulate a transient .deleting or .tmp file in the wallpaper directory
        await Deno.writeTextFile(
            `${wallpaperDir}/${wp1}.bin.deleting`,
            "transient-deleting",
        );
        await Deno.writeTextFile(
            `${wallpaperDir}/staging-upload.tmp`,
            "transient-upload",
        );

        const systemService = new SystemService({
            store,
            settingsStore,
            wallpaperService,
            iconService,
            now: () => now,
        });

        // Run concurrent backup and delete operations
        const [backupZip, deleteResult] = await Promise.all([
            systemService.createFullBackupZip(),
            wallpaperService.deleteWallpaper(wp2, userId),
        ]);

        assertEquals(deleteResult, true);

        // Validate that the created backup is completely consistent and not corrupted
        const validation = await systemService.validateBackupZip(backupZip);
        assertEquals(validation.valid, true);

        // Check that transient .deleting / .tmp files were NOT included in the archive
        const unzipped = fflate.unzipSync(backupZip);
        const paths = Object.keys(unzipped);
        assertEquals(paths.some((p) => p.includes(".deleting")), false);
        assertEquals(paths.some((p) => p.includes(".tmp")), false);
    } finally {
        await store.close();
        await Deno.remove(dir, { recursive: true });
    }
});

Deno.test("legacy backup: accepts old tables, preserves documents and ignores sticky data with warnings", async () => {
    const dir = await Deno.makeTempDir({ prefix: "searcher_legacy_backup_" });
    const store = openDatabase(":memory:");
    const legacyPath = `${dir}/legacy.sqlite`;
    const legacyNative = new DatabaseSync(legacyPath);
    const legacyStore = new DatabaseStore(legacyNative);
    try {
        await migrateDatabase(store);
        // The last pre-unification release ends at migration 0023.
        const migrations = readMigrationFiles({ migrationsFolder: "./drizzle" })
            .slice(0, 24);
        legacyNative.exec(
            "CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at NUMERIC)",
        );
        for (const migration of migrations) {
            legacyStore.migrate(migration.sql);
            legacyNative.prepare(
                "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
            ).run(migration.hash, migration.folderMillis);
        }
        legacyNative.exec(`
            INSERT INTO users (id, username, display_name, password_hash, created_at, updated_at)
                VALUES ('owner', 'owner', 'Owner', 'hash', 1, 1);
            INSERT INTO documents (id, user_id, title, current_body, created_at, updated_at)
                VALUES ('kept', 'owner', 'Preserved document', 'quartz reference', 1, 1);
            INSERT INTO document_versions (id, document_id, user_id, version, title, body, reason, created_at)
                VALUES ('version', 'kept', 'owner', 1, 'Preserved document', 'quartz reference', 'snapshot', 1);
            INSERT INTO notes (id, user_id, title, current_body, content, created_at, updated_at)
                VALUES ('discarded', 'owner', 'Legacy paper', 'must not migrate', 'must not migrate', 1, 1);
            INSERT INTO note_versions (id, note_id, user_id, version, body, created_at)
                VALUES ('legacy-version', 'discarded', 'owner', 1, 'must not migrate', 1);
            INSERT INTO note_layouts (id, note_id, user_id, device_class, x, y, updated_at)
                VALUES ('legacy-layout', 'discarded', 'owner', 'desktop', 10, 20, 1);
        `);
        const service = new SystemService({
            store,
            settingsStore: new SystemSettingsStore(`${dir}/settings.json`),
        });
        const files = fflate.unzipSync(await service.createFullBackupZip());
        files["database.sqlite"] = await Deno.readFile(legacyPath);
        files["manifest.json"] = new TextEncoder().encode(JSON.stringify({
            version: "1.0.0",
            createdAt: 1,
            appName: "Searcher",
            counts: {
                users: 1,
                webapps: 0,
                notes: 1,
                auditLogs: 0,
                aiProviders: 0,
                aiModels: 0,
            },
            assets: { wallpapersCount: 0, iconsCount: 0 },
        }));
        const zip = fflate.zipSync(files);
        const validation = await service.validateBackupZip(zip);
        assertEquals(validation.valid, true);
        assertEquals(validation.manifest?.counts.documents, 1);
        assertEquals(validation.warnings?.length, 1);
        assertMatch(validation.warnings?.[0] ?? "", /便签.*已忽略.*不会恢复/);
        legacyNative.exec(
            "UPDATE __drizzle_migrations SET hash='unknown-release' WHERE id=(SELECT max(id) FROM __drizzle_migrations)",
        );
        const incompatible = fflate.zipSync({
            ...files,
            "database.sqlite": await Deno.readFile(legacyPath),
        });
        const rejected = await service.validateBackupZip(incompatible);
        assertEquals(rejected.valid, false);
        assertMatch(rejected.error ?? "", /迁移版本.*不兼容/);
        await assertRejects(
            () => service.restoreFromBackupZip(incompatible),
            Error,
            "迁移版本与当前服务不兼容",
        );
        assertEquals((await service.getOverview()).totalDocuments, 0);
        const restored = await service.restoreFromBackupZip(zip);
        assertEquals(restored.warnings, validation.warnings);
        const document = await new DocumentsService(store).get("owner", "kept");
        assertEquals(document.body, "quartz reference");
        assertEquals(document.displayTitle, "Preserved document");
        assertEquals((await service.getOverview()).totalDocuments, 1);
        await store.exclusiveNative((native) => {
            assertEquals(
                native.prepare(
                    "SELECT name FROM sqlite_master WHERE name IN ('notes', 'note_versions', 'note_layouts', 'notes_fts')",
                ).all(),
                [],
            );
            assertEquals(
                native.prepare("SELECT id FROM documents").all(),
                [{ id: "kept" }],
            );
            assertEquals(
                native.prepare("SELECT body FROM document_versions").all(),
                [{ body: "quartz reference" }],
            );
            return Promise.resolve();
        });
    } finally {
        await legacyStore.close();
        await store.close();
        await Deno.remove(dir, { recursive: true });
    }
});

Deno.test("system overview and backup count only unified documents", async () => {
    const dir = await Deno.makeTempDir({ prefix: "searcher_document_stats_" });
    const store = openDatabase(":memory:");
    try {
        await migrateDatabase(store);
        await store.run(async (db) => {
            await db.insert(users).values({
                id: "owner",
                username: "owner",
                displayName: "Owner",
                passwordHash: "hash",
                createdAt: 1,
                updatedAt: 1,
            });
        });
        const documents = new DocumentsService(store);
        await documents.create("owner", {
            title: null,
            body: "Home paper",
            isHomeFixed: true,
        });
        await documents.create("owner", {
            title: "Library document",
            body: "",
        });
        const deleted = await documents.create("owner", {
            title: "Deleted",
            body: "",
        });
        await documents.softDelete("owner", deleted.id, deleted.version);
        const service = new SystemService({
            store,
            settingsStore: new SystemSettingsStore(`${dir}/settings.json`),
        });
        assertEquals((await service.getOverview()).totalDocuments, 2);
        const validation = await service.validateBackupZip(
            await service.createFullBackupZip(),
        );
        assertEquals(validation.valid, true);
        assertEquals(validation.manifest?.counts.documents, 3);
        assertEquals(validation.warnings, []);
    } finally {
        await store.close();
        await Deno.remove(dir, { recursive: true });
    }
});
