import type { EngineId } from "@shared/engines.ts";
import { routes } from "../../app/routes.ts";
import type { WorkspaceKind } from "../workspace/workspace-state.ts";

export type ShortcutScope = "global" | "search" | "ask" | "documents";
export type ShortcutPlatform = "mac" | "other";
export type ShortcutBinding = {
    modifiers?: readonly ("mod" | "shift" | "alt")[];
    key: string;
};
export type KeyboardShortcutDefinition = {
    id: string;
    kind: "keyboard";
    section: ShortcutScope;
    action: string;
    context: string;
    description?: string;
    binding: ShortcutBinding;
};

export const SHORTCUTS = {
    focusSearchSlash: {
        id: "focus-search-slash",
        kind: "keyboard",
        section: "global",
        action: "聚焦主搜索框",
        context: "首页非可编辑区域",
        description: "输入控件内不会抢占焦点。",
        binding: { key: "/" },
    },
    focusSearch: {
        id: "focus-search",
        kind: "keyboard",
        section: "global",
        action: "聚焦主搜索框",
        context: "首页非可编辑区域",
        description: "笔记正文中由插入链接优先处理；其他输入控件内不抢占焦点。",
        binding: { key: "k", modifiers: ["mod"] },
    },
    toggleDesk: {
        id: "toggle-desk",
        kind: "keyboard",
        section: "global",
        action: "进入或退出桌面“览”",
        context: "首页（含主搜索框），需要登录",
        description: "笔记编辑器与其他输入控件内不响应。",
        binding: { key: ".", modifiers: ["mod"] },
    },
    searchNewTab: {
        id: "search-new-tab",
        kind: "keyboard",
        section: "search",
        action: "在新标签页提交搜索",
        context: "主搜索框",
        binding: { key: "Enter", modifiers: ["mod"] },
    },
    searchAskAi: {
        id: "search-ask-ai",
        kind: "keyboard",
        section: "search",
        action: "把输入交给 AI",
        context: "主搜索框",
        description: "等同于选中“问 AI”后回车；没有可用模型时不响应。",
        binding: { key: "Enter", modifiers: ["alt"] },
    },
    searchCapture: {
        id: "search-capture",
        kind: "keyboard",
        section: "search",
        action: "快速记录为笔记",
        context: "主搜索框",
        description: "创建未固定到首页的笔记并清空输入；登录后可用。",
        binding: { key: "Enter", modifiers: ["shift"] },
    },
    askFind: {
        id: "ask-find",
        kind: "keyboard",
        section: "ask",
        action: "搜索当前会话",
        context: "AI 问答工作区（含消息输入框）",
        description: "仅在 AI 问答页面接管查找；其他页面保留浏览器查找。",
        binding: { key: "f", modifiers: ["mod"] },
    },
    noteSave: {
        id: "note-save",
        kind: "keyboard",
        section: "documents",
        action: "手动保存",
        context: "笔记正文编辑器",
        binding: { key: "s", modifiers: ["mod"] },
    },
    noteBold: {
        id: "note-bold",
        kind: "keyboard",
        section: "documents",
        action: "粗体",
        context: "笔记正文编辑器",
        binding: { key: "b", modifiers: ["mod"] },
    },
    noteItalic: {
        id: "note-italic",
        kind: "keyboard",
        section: "documents",
        action: "斜体",
        context: "笔记正文编辑器",
        binding: { key: "i", modifiers: ["mod"] },
    },
    noteLink: {
        id: "note-link",
        kind: "keyboard",
        section: "documents",
        action: "插入链接",
        context: "笔记正文编辑器",
        description: "本地编辑操作优先，不会聚焦主搜索框。",
        binding: { key: "k", modifiers: ["mod"] },
    },
    noteStrike: {
        id: "note-strike",
        kind: "keyboard",
        section: "documents",
        action: "删除线",
        context: "笔记正文编辑器",
        binding: { key: "x", modifiers: ["mod", "shift"] },
    },
} as const satisfies Record<string, KeyboardShortcutDefinition>;
export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcutDefinition[] = Object
    .values(SHORTCUTS);

export type SearchCommandTarget =
    | { type: "engine"; engine: EngineId }
    | { type: "mode"; mode: "ai" }
    | { type: "theme"; theme: "light" | "dark" | "system" }
    | { type: "route"; to: string }
    | { type: "workspace"; kind: WorkspaceKind }
    | { type: "apps" };
export type SearchQuickCommand = {
    id: string;
    prefix: `/${string}`;
    action: string;
    target: SearchCommandTarget;
    /** Needs a signed-in user: guests never see it. */
    requiresUser?: boolean;
};
export const SEARCH_QUICK_COMMANDS: readonly SearchQuickCommand[] = [
    {
        id: "google",
        prefix: "/g",
        action: "Google 搜索",
        target: { type: "engine", engine: "google" },
    },
    {
        id: "bing",
        prefix: "/b",
        action: "Bing 搜索",
        target: { type: "engine", engine: "bing" },
    },
    {
        id: "baidu",
        prefix: "/ba",
        action: "百度搜索",
        target: { type: "engine", engine: "baidu" },
    },
    {
        id: "duckduckgo",
        prefix: "/d",
        action: "DuckDuckGo 搜索",
        target: { type: "engine", engine: "duckduckgo" },
    },
    {
        id: "ai",
        prefix: "/ai",
        action: "AI 问答",
        target: { type: "mode", mode: "ai" },
        requiresUser: true,
    },
    {
        id: "theme-light",
        prefix: "/light",
        action: "切换到浅色主题",
        target: { type: "theme", theme: "light" },
    },
    {
        id: "theme-dark",
        prefix: "/dark",
        action: "切换到深色主题",
        target: { type: "theme", theme: "dark" },
    },
    {
        id: "theme-system",
        prefix: "/system",
        action: "主题跟随系统",
        target: { type: "theme", theme: "system" },
    },
    {
        id: "wallpaper",
        prefix: "/wallpaper",
        action: "更换壁纸",
        target: { type: "route", to: routes.settings("appearance") },
    },
    {
        id: "settings",
        prefix: "/settings",
        action: "打开设置",
        target: { type: "route", to: routes.settings() },
    },
    {
        id: "shortcuts",
        prefix: "/shortcuts",
        action: "查看快捷键",
        target: { type: "route", to: routes.settings("shortcuts") },
    },
    {
        id: "trash",
        prefix: "/trash",
        action: "打开回收站",
        target: { type: "route", to: routes.trash },
        requiresUser: true,
    },
    {
        id: "notes",
        prefix: "/notes",
        action: "打开笔记",
        target: { type: "workspace", kind: "documents" },
        requiresUser: true,
    },
    {
        id: "apps",
        prefix: "/apps",
        action: "打开应用",
        target: { type: "apps" },
        requiresUser: true,
    },
];

/** Engine prefixes and /ai are followed by a query; every other command stands alone. */
export function commandTakesQuery(command: SearchQuickCommand): boolean {
    return command.target.type === "engine" || command.target.type === "mode";
}

export type SearchCommandContext = { aiAvailable: boolean; signedIn: boolean };

/**
 * Commands listed for input that is still a command token: "/" lists all, more
 * characters filter by prefix or by a substring of the action. Once whitespace
 * follows the token the input is arguments, not a command list. /ai needs an
 * available model; account commands need a signed-in user.
 */
export function matchSearchCommands(
    raw: string,
    context: SearchCommandContext,
): SearchQuickCommand[] {
    const text = raw.trimStart();
    if (!text.startsWith("/") || /\s/.test(text)) return [];
    const token = text.toLowerCase();
    return SEARCH_QUICK_COMMANDS.filter((command) => {
        if (command.target.type === "mode" && !context.aiAvailable) {
            return false;
        }
        if (command.requiresUser && !context.signedIn) return false;
        return command.prefix.startsWith(token) ||
            (token.length > 1 &&
                command.action.toLowerCase().includes(token.slice(1)));
    });
}

export function parseCommandPrefix(raw: string) {
    const trimmedLead = raw.trimStart();
    const token = /^\S+/.exec(trimmedLead)?.[0];
    const definition = SEARCH_QUICK_COMMANDS.find((entry) =>
        entry.prefix === token?.toLowerCase()
    );
    if (!definition) return null;
    const separator =
        /^\s*/.exec(trimmedLead.slice(definition.prefix.length))![0];
    const prefix = trimmedLead.slice(
        0,
        definition.prefix.length + separator.length,
    );
    return {
        command: definition.prefix.slice(1),
        rest: trimmedLead.slice(prefix.length).trim(),
        isAi: definition.target.type === "mode",
        targetEngine: definition.target.type === "engine"
            ? definition.target.engine
            : undefined,
        hasSpace: separator.length > 0,
        prefix,
    };
}

export function getShortcutPlatform(): ShortcutPlatform {
    return typeof navigator !== "undefined" &&
            /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent)
        ? "mac"
        : "other";
}

export function formatShortcut(
    binding: ShortcutBinding,
    platform = getShortcutPlatform(),
): string {
    const modifiers = binding.modifiers ?? [];
    const keys: string[] = [];
    if (modifiers.includes("mod")) keys.push(platform === "mac" ? "⌘" : "Ctrl");
    if (modifiers.includes("alt")) keys.push(platform === "mac" ? "⌥" : "Alt");
    if (modifiers.includes("shift")) {
        keys.push(platform === "mac" ? "⇧" : "Shift");
    }
    keys.push(
        binding.key.length === 1 ? binding.key.toUpperCase() : binding.key,
    );
    return keys.join(platform === "mac" ? " " : " + ");
}

export function formatShortcutAccessible(
    binding: ShortcutBinding,
    platform = getShortcutPlatform(),
): string {
    return formatShortcut(binding, platform).replace("⌘", "Command").replace(
        "⌥",
        "Option",
    ).replace("⇧", "Shift");
}

type ShortcutEvent =
    & Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">
    & { isComposing?: boolean; defaultPrevented?: boolean };
export function matchesShortcut(
    event: ShortcutEvent,
    binding: ShortcutBinding,
): boolean {
    if (event.isComposing || event.defaultPrevented) return false;
    const modifiers = binding.modifiers ?? [];
    const mod = modifiers.includes("mod");
    return event.key.toLowerCase() === binding.key.toLowerCase() &&
        (event.metaKey || event.ctrlKey) === mod &&
        !(event.metaKey && event.ctrlKey) &&
        event.shiftKey === modifiers.includes("shift") &&
        event.altKey === modifiers.includes("alt");
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
    if (typeof Element === "undefined" || !(target instanceof Element)) {
        return false;
    }
    const control = target.closest("input, textarea, select, [role='textbox']");
    if (control) return true;
    const editable = target.closest("[contenteditable]");
    return editable instanceof HTMLElement && editable.isContentEditable;
}
