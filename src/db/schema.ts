import { sql } from "drizzle-orm";
import {
    type AnySQLiteColumn,
    blob,
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
    glassIntensity: text("glass_intensity", {
        enum: ["off", "soft", "regular", "clear"],
    }).notNull().default("regular"),
    backgroundImage: text("background_image"),
    wallpaperMask: real("wallpaper_mask").notNull().default(0.36),
    searchTarget: text("search_target", { enum: ["same", "new"] })
        .notNull().default("same"),
    searchHistoryEnabled: integer("search_history_enabled", { mode: "boolean" })
        .notNull().default(false),
    showHomeApps: integer("show_home_apps", { mode: "boolean" })
        .notNull().default(true),
    showAppLabels: integer("show_app_labels", { mode: "boolean" })
        .notNull().default(true),
    aiGenerationDefaults: text("ai_generation_defaults"),
    wallpaperCompositions: text("wallpaper_compositions"),
    wallpaperPresentations: text("wallpaper_presentations"),
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
        "preferences_accent_check",
        sql`${t.accent} in ('blue','cyan','teal','violet','orange','mono','rose','emerald','amber')`,
    ),
    check(
        "preferences_shape_check",
        sql`${t.searchShape} in ('rounded','pill')`,
    ),
    check(
        "preferences_glass_intensity_check",
        sql`${t.glassIntensity} in ('off','soft','regular','clear')`,
    ),
    check(
        "preferences_search_target_check",
        sql`${t.searchTarget} in ('same','new')`,
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
    sortOrder: integer("sort_order").notNull().default(0),
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

export const documentNotebooks = sqliteTable("document_notebooks", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, {
        onDelete: "cascade",
    }),
    parentId: text("parent_id").references(
        (): AnySQLiteColumn => documentNotebooks.id,
        { onDelete: "set null" },
    ),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
}, (t) => [
    index("document_notebooks_user_idx").on(t.userId),
    index("document_notebooks_parent_idx").on(t.parentId),
    index("document_notebooks_user_parent_sort_idx").on(
        t.userId,
        t.parentId,
        t.sortOrder,
    ),
]);

export const documents = sqliteTable("documents", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, {
        onDelete: "cascade",
    }),
    notebookId: text("notebook_id").references(() => documentNotebooks.id, {
        onDelete: "set null",
    }),
    title: text("title"),
    currentBody: text("current_body").notNull().default(""),
    currentVersion: integer("current_version").notNull().default(1),
    isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(
        false,
    ),
    color: text("color", {
        enum: ["paper", "amber", "rose", "sage", "sky"],
    }).notNull().default("paper"),
    isHomeFixed: integer("is_home_fixed", { mode: "boolean" }).notNull()
        .default(false),
    homeSortOrder: integer("home_sort_order").notNull().default(0),
    deletedAt: integer("deleted_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
}, (t) => [
    index("documents_user_idx").on(t.userId),
    index("documents_notebook_idx").on(t.notebookId),
    index("documents_deleted_at_idx").on(t.deletedAt),
    index("documents_user_updated_idx").on(t.userId, t.updatedAt),
    check(
        "documents_color_check",
        sql`${t.color} in ('paper','amber','rose','sage','sky')`,
    ),
]);

export const documentLayouts = sqliteTable("document_layouts", {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, {
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
    index("document_layouts_user_idx").on(t.userId),
    index("document_layouts_document_idx").on(t.documentId),
    check(
        "document_layouts_device_class_check",
        sql`${t.deviceClass} in ('desktop','tablet','mobile')`,
    ),
]);

export const documentVersions = sqliteTable("document_versions", {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, {
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
    }).notNull(),
    createdAt: integer("created_at").notNull(),
}, (t) => [
    index("document_versions_document_idx").on(t.documentId),
    index("document_versions_user_idx").on(t.userId),
    uniqueIndex("document_versions_document_version_unique").on(
        t.documentId,
        t.version,
    ),
    check(
        "document_versions_reason_check",
        sql`${t.reason} in ('snapshot','manual','conflict_resolution','restore','system')`,
    ),
]);

export const documentSettings = sqliteTable("document_settings", {
    documentId: text("document_id").primaryKey().references(
        () => documents.id,
        { onDelete: "cascade" },
    ),
    userId: text("user_id").notNull().references(() => users.id, {
        onDelete: "cascade",
    }),
    paperSize: text("paper_size", { enum: ["a4", "letter"] }).notNull().default(
        "a4",
    ),
    orientation: text("orientation", { enum: ["portrait", "landscape"] })
        .notNull().default("portrait"),
    marginTopMm: real("margin_top_mm").notNull().default(20),
    marginRightMm: real("margin_right_mm").notNull().default(20),
    marginBottomMm: real("margin_bottom_mm").notNull().default(20),
    marginLeftMm: real("margin_left_mm").notNull().default(20),
    updatedAt: integer("updated_at").notNull(),
}, (t) => [
    check(
        "document_settings_paper_check",
        sql`${t.paperSize} in ('a4','letter')`,
    ),
    check(
        "document_settings_orientation_check",
        sql`${t.orientation} in ('portrait','landscape')`,
    ),
    check(
        "document_settings_margins_check",
        sql`${t.marginTopMm} between 5 and 50 and ${t.marginRightMm} between 5 and 50 and ${t.marginBottomMm} between 5 and 50 and ${t.marginLeftMm} between 5 and 50`,
    ),
]);

export const documentAssets = sqliteTable("document_assets", {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, {
        onDelete: "cascade",
    }),
    userId: text("user_id").notNull().references(() => users.id, {
        onDelete: "cascade",
    }),
    mimeType: text("mime_type", {
        enum: ["image/png", "image/jpeg", "image/webp"],
    }).notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    originalName: text("original_name").notNull(),
    storageRef: text("storage_ref").notNull(),
    // SQLite-owned payload: backup and FK deletion include bytes atomically.
    data: blob("data", { mode: "buffer" }).notNull(),
    createdAt: integer("created_at").notNull(),
}, (t) => [
    index("document_assets_document_idx").on(t.documentId),
    index("document_assets_user_idx").on(t.userId),
    check(
        "document_assets_mime_check",
        sql`${t.mimeType} in ('image/png','image/jpeg','image/webp')`,
    ),
    check(
        "document_assets_size_check",
        sql`${t.byteSize} between 1 and 10485760`,
    ),
]);
