import type { EngineId } from "@shared/engines.ts";

export type ShortcutScope = "global" | "search" | "ask" | "notes";
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
        description: "便签正文中由插入链接优先处理；其他输入控件内不抢占焦点。",
        binding: { key: "k", modifiers: ["mod"] },
    },
    searchNewTab: {
        id: "search-new-tab",
        kind: "keyboard",
        section: "search",
        action: "在新标签页提交搜索",
        context: "主搜索框",
        binding: { key: "Enter", modifiers: ["mod"] },
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
        section: "notes",
        action: "手动保存",
        context: "便签正文编辑器",
        binding: { key: "s", modifiers: ["mod"] },
    },
    noteBold: {
        id: "note-bold",
        kind: "keyboard",
        section: "notes",
        action: "粗体",
        context: "便签正文编辑器",
        binding: { key: "b", modifiers: ["mod"] },
    },
    noteItalic: {
        id: "note-italic",
        kind: "keyboard",
        section: "notes",
        action: "斜体",
        context: "便签正文编辑器",
        binding: { key: "i", modifiers: ["mod"] },
    },
    noteLink: {
        id: "note-link",
        kind: "keyboard",
        section: "notes",
        action: "插入链接",
        context: "便签正文编辑器",
        description: "本地编辑操作优先，不会聚焦主搜索框。",
        binding: { key: "k", modifiers: ["mod"] },
    },
    noteStrike: {
        id: "note-strike",
        kind: "keyboard",
        section: "notes",
        action: "删除线",
        context: "便签正文编辑器",
        binding: { key: "x", modifiers: ["mod", "shift"] },
    },
} as const satisfies Record<string, KeyboardShortcutDefinition>;
export const KEYBOARD_SHORTCUTS: readonly KeyboardShortcutDefinition[] = Object
    .values(SHORTCUTS);

export type SearchQuickCommand = {
    id: string;
    prefix: "/g" | "/b" | "/ba" | "/d" | "/ai";
    action: string;
    target: { type: "engine"; engine: EngineId } | { type: "mode"; mode: "ai" };
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
    },
];

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
