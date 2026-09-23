import { sql } from "drizzle-orm";
import {
    check,
    index,
    integer,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
    id: text("id").primaryKey(),
    username: text("username").notNull().unique(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role", { enum: ["user", "admin"] }).notNull().default("user"),
    disabled: integer("disabled", { mode: "boolean" }).notNull().default(false),
    authVersion: integer("auth_version").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
}, (t) => [check("users_role_check", sql`${t.role} in ('user', 'admin')`)]);

export const sessions = sqliteTable("sessions", {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, {
        onDelete: "cascade",
    }),
    authVersion: integer("auth_version").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const preferences = sqliteTable("preferences", {
    userId: text("user_id").primaryKey().references(() => users.id, {
        onDelete: "cascade",
    }),
    defaultEngine: text("default_engine", {
        enum: ["google", "bing", "baidu", "duckduckgo"],
    }).notNull().default("bing"),
    theme: text("theme", { enum: ["system", "light", "dark", "forest"] })
        .notNull().default("system"),
}, (t) => [
    check(
        "preferences_engine_check",
        sql`${t.defaultEngine} in ('google','bing','baidu','duckduckgo')`,
    ),
    check(
        "preferences_theme_check",
        sql`${t.theme} in ('system','light','dark','forest')`,
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

export const notes = sqliteTable("notes", {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, {
        onDelete: "cascade",
    }),
    content: text("content").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
}, (t) => [index("notes_user_idx").on(t.userId)]);
