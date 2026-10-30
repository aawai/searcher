import { assertEquals } from "@std/assert";
import { STATUS_CODE } from "@std/http";
import { openDatabase } from "../../db/database.ts";
import { migrateDatabase } from "../../db/migrate.ts";
import { AuthService, SESSION_COOKIE_NAME } from "../auth/service.ts";
import { createApp } from "../../app.ts";
import { users } from "../../db/schema.ts";
import { WallpaperService } from "../wallpaper/service.ts";
import { WebAppIconService } from "../webapp-icons/service.ts";
import { SystemService } from "./service.ts";
import { SystemSettingsStore } from "./settings-store.ts";
import * as fflate from "fflate";
import type { Envelope } from "@shared/contracts.ts";
import type {
    BackupManifest,
    ConfigExportDto,
    SystemOverviewDto,
    SystemSettingsDto,
} from "./types.ts";

const ORIGIN = "http://localhost:8000";
const PNG_BYTES = new Uint8Array([
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

async function setupSystemTest() {
    Deno.env.set("DATABASE_PATH", ":memory:");
    const store = openDatabase(":memory:");
    await migrateDatabase(store);
    const auth = new AuthService({ store, origin: ORIGIN });
    const wallpaperDir = await Deno.makeTempDir({
        prefix: "system_test_wallpapers_",
    });
    const iconDir = await Deno.makeTempDir({ prefix: "system_test_icons_" });
    const wallpaper = new WallpaperService(wallpaperDir);
    const icons = new WebAppIconService(iconDir);

    const app = createApp({
        store,
        auth,
        origin: ORIGIN,
        icons,
        wallpaper,
    });

    // Create 1 admin and 1 regular user
    const adminId = crypto.randomUUID();
    const normalId = crypto.randomUUID();
    const now = Date.now();

    await store.run(async (db) => {
        await db.insert(users).values({
            id: adminId,
            username: "admin_test",
            displayName: "Admin Test",
            passwordHash: "dummyhash",
            role: "admin",
            disabled: false,
            authVersion: 1,
            createdAt: now,
            updatedAt: now,
        });
        await db.insert(users).values({
            id: normalId,
            username: "normal_test",
            displayName: "Normal Test",
            passwordHash: "dummyhash",
            role: "user",
            disabled: false,
            authVersion: 1,
            createdAt: now,
            updatedAt: now,
        });
    });

    const adminSession = await auth.createSession(adminId, 1);
    const normalSession = await auth.createSession(normalId, 1);
    return {
        store,
        auth,
        app,
        adminId,
        adminToken: adminSession.token,
        normalToken: normalSession.token,
        wallpaper,
        wallpaperDir,
        iconDir,
    };
}

Deno.test("system routes: permissions, overview, settings, config export/import, backup/restore", async () => {
    const ctx = await setupSystemTest();
    try {
        const adminCookie = `${SESSION_COOKIE_NAME}=${ctx.adminToken}`;
        const normalCookie = `${SESSION_COOKIE_NAME}=${ctx.normalToken}`;

        // 1. Forbidden for normal user
        const forbiddenRes = await ctx.app.request(
            "/api/admin/system/overview",
            {
                headers: { cookie: normalCookie },
            },
        );
        assertEquals(forbiddenRes.status, STATUS_CODE.Forbidden);

        // 2. Overview for admin
        const overviewRes = await ctx.app.request(
            "/api/admin/system/overview",
            {
                headers: { cookie: adminCookie },
            },
        );
        assertEquals(overviewRes.status, STATUS_CODE.OK);
        const overviewBody = await overviewRes.json() as Envelope<
            SystemOverviewDto
        >;
        assertEquals(overviewBody.status, true);
        assertEquals(overviewBody.data?.totalUsers, 2);
        assertEquals(overviewBody.data?.totalDocuments, 0);
        assertEquals(overviewBody.data?.settings.auditRetentionDays, 90);

        // 3. Settings GET & PATCH
        const patchRes = await ctx.app.request("/api/admin/system/settings", {
            method: "PATCH",
            headers: {
                cookie: adminCookie,
                origin: ORIGIN,
                "content-type": "application/json",
            },
            body: JSON.stringify({
                auditRetentionDays: 60,
                allowRegistration: false,
                defaultEngine: "duckduckgo",
            }),
        });
        assertEquals(patchRes.status, STATUS_CODE.OK);
        const patchBody = await patchRes.json() as Envelope<SystemSettingsDto>;
        assertEquals(patchBody.data?.auditRetentionDays, 60);
        assertEquals(patchBody.data?.allowRegistration, false);
        assertEquals(patchBody.data?.defaultEngine, "duckduckgo");

        // 4. Config Export
        const exportRes = await ctx.app.request(
            "/api/admin/system/config/export",
            {
                headers: { cookie: adminCookie },
            },
        );
        assertEquals(exportRes.status, STATUS_CODE.OK);
        const exportedConfig = await exportRes.json() as ConfigExportDto;
        assertEquals(exportedConfig.version, "1.0.0");
        assertEquals(exportedConfig.settings.auditRetentionDays, 60);

        // 5. Config Import
        const importRes = await ctx.app.request(
            "/api/admin/system/config/import",
            {
                method: "POST",
                headers: {
                    cookie: adminCookie,
                    origin: ORIGIN,
                    "content-type": "application/json",
                },
                body: JSON.stringify({
                    version: "1.0.0",
                    exportedAt: Date.now(),
                    settings: {
                        auditRetentionDays: 120,
                        allowRegistration: true,
                        defaultEngine: "google",
                        defaultTheme: "dark",
                        defaultSearchTarget: "new",
                    },
                    systemAiProviders: [],
                }),
            },
        );
        assertEquals(importRes.status, STATUS_CODE.OK);

        const originalWallpaper = await ctx.wallpaper.saveWallpaper(
            ctx.adminId,
            PNG_BYTES,
        );
        await Deno.writeTextFile(
            `${ctx.iconDir}/original.png`,
            "original-icon",
        );
        // 6. Full Backup Export (ZIP)
        const backupRes = await ctx.app.request("/api/admin/backup/export", {
            headers: { cookie: adminCookie },
        });
        assertEquals(backupRes.status, STATUS_CODE.OK);
        const backupBytes = new Uint8Array(await backupRes.arrayBuffer());
        await Deno.writeFile(
            `${ctx.wallpaperDir}/${originalWallpaper.id}.bin`,
            new Uint8Array([
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
                0x0e,
            ]),
        );
        await Deno.writeTextFile(`${ctx.iconDir}/original.png`, "mutated-icon");
        await Deno.writeTextFile(`${ctx.wallpaperDir}/stale.bin`, "stale");
        await Deno.writeTextFile(`${ctx.iconDir}/stale.png`, "stale");
        const changedSettings = await ctx.app.request(
            "/api/admin/system/settings",
            {
                method: "PATCH",
                headers: {
                    cookie: adminCookie,
                    origin: ORIGIN,
                    "content-type": "application/json",
                },
                body: JSON.stringify({ auditRetentionDays: 30 }),
            },
        );
        assertEquals(changedSettings.status, STATUS_CODE.OK);

        // Backup validates intact, and rejects paths that would escape asset storage.
        const formValidate = new FormData();
        formValidate.append(
            "backup",
            new File([backupBytes], "backup.zip", { type: "application/zip" }),
        );
        const validateRes = await ctx.app.request(
            "/api/admin/backup/validate",
            {
                method: "POST",
                headers: { cookie: adminCookie, origin: ORIGIN },
                body: formValidate,
            },
        );
        assertEquals(validateRes.status, STATUS_CODE.OK);
        const validateBody = await validateRes.json() as Envelope<
            { valid: boolean; manifest: BackupManifest; warnings: string[] }
        >;
        assertEquals(validateBody.data?.valid, true);
        assertEquals(validateBody.data?.manifest.appName, "Searcher");
        assertEquals(validateBody.data?.manifest.counts.users, 2);
        assertEquals(validateBody.data?.warnings, []);

        const malicious = fflate.zipSync({
            ...fflate.unzipSync(backupBytes),
            "assets/icons/../../outside.png": new TextEncoder().encode(
                "escape",
            ),
        });
        const unsafeForm = new FormData();
        unsafeForm.append(
            "backup",
            new File([new Uint8Array(malicious)], "unsafe.zip"),
        );
        const unsafeResponse = await ctx.app.request(
            "/api/admin/backup/validate",
            {
                method: "POST",
                headers: { cookie: adminCookie, origin: ORIGIN },
                body: unsafeForm,
            },
        );
        assertEquals(unsafeResponse.status, STATUS_CODE.BadRequest);

        // 8. Restore Backup ZIP
        const formRestore = new FormData();
        formRestore.append(
            "backup",
            new File([backupBytes], "backup.zip", { type: "application/zip" }),
        );
        const restoreRes = await ctx.app.request("/api/admin/backup/restore", {
            method: "POST",
            headers: { cookie: adminCookie, origin: ORIGIN },
            body: formRestore,
        });
        assertEquals(restoreRes.status, STATUS_CODE.OK);
        const restoreBody = await restoreRes.json() as Envelope<
            {
                manifest: BackupManifest;
                snapshotCreated: boolean;
                warnings: string[];
            }
        >;
        assertEquals(restoreBody.data?.snapshotCreated, true);
        assertEquals(restoreBody.data?.warnings, []);
        assertEquals(
            await Deno.readFile(
                `${ctx.wallpaperDir}/${originalWallpaper.id}.bin`,
            ),
            PNG_BYTES,
        );
        assertEquals(
            await Deno.readTextFile(`${ctx.iconDir}/original.png`),
            "original-icon",
        );
        assertEquals(
            (await Array.fromAsync(Deno.readDir(ctx.wallpaperDir))).some((
                entry,
            ) => entry.name === "stale.bin"),
            false,
        );
        assertEquals(
            (await Array.fromAsync(Deno.readDir(ctx.iconDir))).some((entry) =>
                entry.name === "stale.png"
            ),
            false,
        );
        const settingsAfterRestore = await ctx.app.request(
            "/api/admin/system/settings",
            {
                headers: { cookie: adminCookie },
            },
        );
        assertEquals(
            (await settingsAfterRestore.json() as Envelope<SystemSettingsDto>)
                .data?.auditRetentionDays,
            120,
        );

        // 9. Verify audit logs recorded actions
        const auditRes = await ctx.app.request("/api/admin/audit-logs", {
            headers: { cookie: adminCookie },
        });
        assertEquals(auditRes.status, STATUS_CODE.OK);
        const auditBody = await auditRes.json() as Envelope<
            { items: Array<{ action: string }> }
        >;
        const actions = auditBody.data?.items.map((i) => i.action) ?? [];
        assertEquals(actions.includes("admin.system.settings_update"), true);
        assertEquals(actions.includes("admin.system.config_export"), true);
        assertEquals(actions.includes("admin.system.config_import"), true);
        assertEquals(actions.includes("admin.backup.create"), true);
        assertEquals(actions.includes("admin.backup.restore"), true);
    } finally {
        await ctx.store.close();
        try {
            await Deno.remove(ctx.wallpaperDir, { recursive: true });
            await Deno.remove(ctx.iconDir, { recursive: true });
        } catch {
            // ignore
        }
    }
});

Deno.test("backup restore persists to SQLite file across restart", async () => {
    const dir = await Deno.makeTempDir({ prefix: "searcher_restore_" });
    const path = `${dir}/searcher.sqlite`;
    const store = openDatabase(path);
    try {
        await migrateDatabase(store);
        const settingsStore = new SystemSettingsStore(`${dir}/settings.json`);
        const service = new SystemService({ store, settingsStore });
        const insert = (username: string) =>
            store.run(async (db) => {
                await db.insert(users).values({
                    id: crypto.randomUUID(),
                    username,
                    displayName: username,
                    passwordHash: "hash",
                    role: "user",
                    disabled: false,
                    authVersion: 1,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                });
            });
        await insert("original");
        const backup = await service.createFullBackupZip();
        await insert("later");
        const result = await service.restoreFromBackupZip(backup);
        assertEquals(result.snapshotCreated, true);
        assertEquals(result.snapshotPath.startsWith(dir), true);
    } finally {
        await store.close();
    }
    const reopened = openDatabase(path);
    try {
        const names = await reopened.run(async (db) =>
            (await db.select({ username: users.username }).from(users).all())
                .map((row) => row.username)
        );
        assertEquals(names, ["original"]);
    } finally {
        await reopened.close();
        await Deno.remove(dir, { recursive: true });
    }
});
