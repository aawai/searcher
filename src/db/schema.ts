import { sql } from "drizzle-orm";
import {
    check,
    index,
    integer,
    real,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(),
    email: text("email").unique(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
    disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
    mustChangePassword: integer("must_change_password", { mode: "boolean" })
        .notNull().default(false),
    authVersion: integer("auth_version").notNull().default(1),
    softDeletedAt: integer("soft_deleted_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
}, (t) => [
    check("users_role_check", sql`${t.role} in ('user', 'admin')`),
    index("users_soft_deleted_at_idx").on(t.softDeletedAt),
]);

export const sessions = sqliteTable("sessions", {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, {
        onDelete: "cascade",
    }),
    authVersion: integer("auth_version").notNull(),
    lastActiveAt: integer("last_active_at"),
    userAgent: text("user_agent"),
    ip: text("ip"),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
}, (t) => [
    index("sessions_user_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
]);

export const preferences = sqliteTable("preferences", {
    userId: text("user_id").primaryKey().references(() => users.id, {
        onDelete: "cascade",
    }),
    defaultEngine: text("default_engine", {
        enum: ["google", "bing", "baidu", "duckduckgo"],
    }).notNull().default("bing"),
    theme: text("theme", { enum: ["system", "light", "dark"] })
        .notNull().default("system"),
    visualStyle: text("visual_style", {
        enum: ["linear-dark", "spatial-glass"],
    })
        .notNull().default("linear-dark"),
    style: text("style", {
        enum: ["zen", "widgets"],
    }).default("zen"),
    accent: text("accent", {
        enum: [
            "blue",
            "cyan",
            "teal",
            "violet",
            "orange",
            "mono",
            "rose",
            "emerald",
            "amber",
        ],
    }).default("blue"),
    searchShape: text("search_shape", {
        enum: ["rounded", "pill"],
    }).default("rounded"),
    searchOpacity: real("search_opacity").notNull().default(1),
    backgroundImage: text("background_image"),
    backgroundOpacity: real("background_opacity").notNull().default(0.36),
    wallpaperBlur: real("wallpaper_blur").notNull().default(0),
    wallpaperGrayscale: real("wallpaper_grayscale").notNull().default(0),
    wallpaperMask: real("wallpaper_mask").notNull().default(0.36),
    wallpaperGlowStrength: real("wallpaper_glow_strength")
        .notNull().default(0.14),
    ambientMotionMode: text("ambient_motion_mode", {
        enum: ["off", "breathe", "breathe_ripple"],
    }).notNull().default("breathe_ripple"),
    ambientMotionStrength: real("ambient_motion_strength")
        .notNull().default(0.35),
    searchTarget: text("search_target", { enum: ["same", "new"] })
        .notNull().default("same"),
    searchHistoryEnabled: integer("search_history_enabled", { mode: "boolean" })
        .notNull().default(false),
    webAppHomeLimit: text("webapp_home_limit", {
        enum: ["8", "12", "16", "all"],
    }).notNull().default("12"),
    webAppIconSize: text("webapp_icon_size", {
        enum: ["compact", "default", "large"],
    }).notNull().default("default"),
    showAppLabels: integer("show_app_labels", { mode: "boolean" })
        .notNull().default(true),
    aiGenerationDefaults: text("ai_generation_defaults"),
}, (t) => [
    check(
        "preferences_engine_check",
        sql`${t.defaultEngine} in ('google','bing','baidu','duckduckgo')`,
    ),
    check(
        "preferences_theme_check",
        sql`${t.theme} in ('system','light','dark')`,
    ),
    check(
        "preferences_visual_style_check",
        sql`${t.visualStyle} in ('linear-dark','spatial-glass')`,
    ),
    check(
        "preferences_style_check",
        sql`${t.style} in ('command','zen','widgets','quiet','minimal','glass','soft','classic')`,
    ),
    check(
        "preferences_accent_check",
        sql`${t.accent} in ('blue','cyan','teal','violet','orange','mono','rose','emerald','amber')`,
    ),
    check(
        "preferences_shape_check",
        sql`${t.searchShape} in ('rounded','pill')`,
    ),
    check(
        "preferences_search_opacity_check",
        sql`${t.searchOpacity} >= 0.1 and ${t.searchOpacity} <= 1`,
    ),
    check(
        "preferences_opacity_check",
        sql`${t.backgroundOpacity} >= 0 and ${t.backgroundOpacity} <= 0.8`,
    ),
    check(
        "preferences_search_target_check",
        sql`${t.searchTarget} in ('same','new')`,
    ),
    check(
        "preferences_webapp_home_limit_check",
        sql`${t.webAppHomeLimit} in ('8','12','16','all')`,
    ),
    check(
        "preferences_webapp_icon_size_check",
        sql`${t.webAppIconSize} in ('compact','default','large')`,
    ),
    check(
        "preferences_wallpaper_glow_strength_check",
        sql`${t.wallpaperGlowStrength} >= 0 and ${t.wallpaperGlowStrength} <= 0.3`,
    ),
    check(
        "preferences_ambient_motion_mode_check",
        sql`${t.ambientMotionMode} in ('off','breathe','breathe_ripple')`,
    ),
    check(
        "preferences_ambient_motion_strength_check",
        sql`${t.ambientMotionStrength} >= 0 and ${t.ambientMotionStrength} <= 1`,
    ),
]);

export const bookmarks = sqliteTable(
    "bookmarks",
    {
        id: text("id").primaryKey(),
        userId: text("user_id").notNull().references(() => users.id, {
            onDelete: "cascade",
        }),
        title: text("title").notNull(),
        url: text("url").notNull(),
        createdAt: integer("created_at").notNull(),
        updatedAt: integer("updated_at").notNull(),
    },
    (
        t,
    ) => [
        uniqueIndex("bookmarks_user_url_idx").on(t.userId, t.url),
        index("bookmarks_user_idx").on(t.userId),
    ],
);

export const webappGroups = sqliteTable("webapp_groups", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, {
        onDelete: "cascade",
    }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    folderSize: text("folder_size", {
        enum: ["small", "large"],
    }).notNull().default("small"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
}, (t) => [
    index("webapp_groups_user_idx").on(t.userId),
    check(
        "webapp_groups_folder_size_check",
        sql`${t.folderSize} in ('small', 'large')`,
    ),
]);

export const webapps = sqliteTable("webapps", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, {
        onDelete: "cascade",
    }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    groupId: text("group_id").references(() => webappGroups.id, {
        onDelete: "set null",
    }),
    iconAssetId: text("icon_asset_id"),
    iconSource: text("icon_source", {
        enum: ["website", "upload", "url", "ai", "default"],
    }).notNull().default("website"),
    isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(
        false,
    ),
    sortOrder: integer("sort_order").notNull().default(0),
    pinnedSortOrder: integer("pinned_sort_order").notNull().default(0),
    openMode: text("open_mode", {
        enum: ["global", "current", "new_tab"],
    }).notNull().default("global"),
    deletedAt: integer("deleted_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
}, (t) => [
    index("webapps_user_idx").on(t.userId),
    index("webapps_group_idx").on(t.groupId),
    index("webapps_deleted_at_idx").on(t.deletedAt),
    check(
        "webapps_icon_source_check",
        sql`${t.iconSource} in ('website','upload','url','ai','default')`,
    ),
    check(
        "webapps_open_mode_check",
        sql`${t.openMode} in ('global','current','new_tab')`,
    ),
]);

export const notes = sqliteTable("notes", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, {
        onDelete: "cascade",
    }),
    title: text("title"),
    currentBody: text("current_body").notNull().default(""),
    content: text("content").notNull().default(""),
    currentVersion: integer("current_version").notNull().default(1),
    color: text("color", {
        enum: ["paper", "amber", "rose", "sage", "sky"],
    }).notNull().default("paper"),
    isPinned: integer("is_pinned", { mode: "boolean" }).notNull().default(
        false,
    ),
    isHomeFixed: integer("is_home_fixed", { mode: "boolean" }).notNull()
        .default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    deletedAt: integer("deleted_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
}, (t) => [
    index("notes_user_idx").on(t.userId),
    index("notes_deleted_at_idx").on(t.deletedAt),
    check(
        "notes_color_check",
        sql`${t.color} in ('paper','amber','rose','sage','sky')`,
    ),
]);

export const noteLayouts = sqliteTable("note_layouts", {
    id: text("id").primaryKey(),
    noteId: text("note_id").notNull().references(() => notes.id, {
        onDelete: "cascade",
    }),
    userId: text("user_id").notNull().references(() => users.id, {
        onDelete: "cascade",
    }),
    deviceClass: text("device_class", {
        enum: ["desktop", "tablet", "mobile"],
    }).notNull().default("desktop"),
    x: real("x"),
    y: real("y"),
    width: real("width"),
    zIndex: integer("z_index").notNull().default(0),
    expanded: integer("expanded", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order"),
    updatedAt: integer("updated_at").notNull(),
}, (t) => [
    index("note_layouts_user_idx").on(t.userId),
    index("note_layouts_note_idx").on(t.noteId),
    check(
        "note_layouts_device_class_check",
        sql`${t.deviceClass} in ('desktop','tablet','mobile')`,
    ),
]);

export const noteVersions = sqliteTable("note_versions", {
    id: text("id").primaryKey(),
    noteId: text("note_id").notNull().references(() => notes.id, {
        onDelete: "cascade",
    }),
    userId: text("user_id").notNull().references(() => users.id, {
        onDelete: "cascade",
    }),
    version: integer("version").notNull(),
    title: text("title"),
    body: text("body").notNull(),
    reason: text("reason", {
        enum: [
            "snapshot",
            "manual",
            "conflict_resolution",
            "restore",
            "system",
        ],
    }).notNull().default("snapshot"),
    createdAt: integer("created_at").notNull(),
}, (t) => [
    index("note_versions_note_idx").on(t.noteId),
    index("note_versions_user_idx").on(t.userId),
    check(
        "note_versions_reason_check",
        sql`${t.reason} in ('snapshot','manual','conflict_resolution','restore','system')`,
    ),
]);

export const auditLogs = sqliteTable("audit_logs", {
    id: text("id").primaryKey(),
    actorUserId: text("actor_user_id").references(() => users.id, {
        onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    metadataJson: text("metadata_json"),
    createdAt: integer("created_at").notNull(),
}, (t) => [
    index("audit_logs_actor_idx").on(t.actorUserId),
    index("audit_logs_action_idx").on(t.action),
    index("audit_logs_created_at_idx").on(t.createdAt),
]);

export const searchHistory = sqliteTable("search_history", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, {
        onDelete: "cascade",
    }),
    query: text("query").notNull(),
    engineId: text("engine_id", {
        enum: ["google", "bing", "baidu", "duckduckgo"],
    }).notNull(),
    createdAt: integer("created_at").notNull(),
}, (t) => [
    index("search_history_user_idx").on(t.userId),
    index("search_history_created_at_idx").on(t.createdAt),
    check(
        "search_history_engine_check",
        sql`${t.engineId} in ('google','bing','baidu','duckduckgo')`,
    ),
]);
