import {
    AppWindow,
    FileText,
    Folder,
    History,
    Image,
    Keyboard,
    LayoutGrid,
    Moon,
    NotebookPen,
    Search,
    Settings,
    Sparkles,
    Sun,
    SunMoon,
    Trash2,
} from "lucide-react";
import type { EngineId } from "@shared/engines.ts";
import { EngineIcon } from "../../components/searcher/EngineSelector.tsx";
import { WebAppGlyph } from "../../components/searcher/WebAppIcon.tsx";
import {
    formatShortcut,
    type SearchQuickCommand,
    SHORTCUTS,
} from "../shortcuts/shortcut-catalog.ts";
import {
    type OmniboxGroup,
    type OmniboxItem,
    omniboxItemKey,
} from "./omnibox-model.ts";
import { splitSuggestionLabel } from "./split-label.ts";

export interface OmniboxListboxView {
    groups: readonly OmniboxGroup[];
    selectedKey: string | null;
    matchingQuery: string;
    onlineUnavailable: boolean;
    engine: EngineId;
}

/** Quick entries of the empty search box; unknown ids use the app icon. */
const ENTRY_ICON: Record<string, typeof AppWindow> = {
    overview: LayoutGrid,
    notes: NotebookPen,
    apps: AppWindow,
};

function CommandIcon({ command }: { command: SearchQuickCommand }) {
    const { target } = command;
    if (target.type === "engine") {
        return <EngineIcon id={target.engine} className="icon-md" />;
    }
    const Icon = target.type === "mode"
        ? Sparkles
        : target.type === "theme"
        ? (target.theme === "light"
            ? Sun
            : target.theme === "dark"
            ? Moon
            : SunMoon)
        : target.type === "desk"
        ? NotebookPen
        : target.type === "apps"
        ? AppWindow
        : command.id === "wallpaper"
        ? Image
        : command.id === "trash"
        ? Trash2
        : command.id === "shortcuts"
        ? Keyboard
        : Settings;
    return <Icon size="1em" className="icon-md suggestion-icon" />;
}

function ItemIcon({ item }: { item: OmniboxItem }) {
    switch (item.kind) {
        case "ai":
            return <Sparkles size="1em" className="icon-md suggestion-icon" />;
        case "document":
            return <FileText size="1em" className="icon-md suggestion-icon" />;
        case "folder":
            return <Folder size="1em" className="icon-md suggestion-icon" />;
        case "app":
            return (
                <WebAppGlyph app={item.app} className="suggestion-app-icon" />
            );
        case "history":
            return <History size="1em" className="icon-md suggestion-icon" />;
        case "online":
            return <Search size="1em" className="icon-md suggestion-icon" />;
        case "command":
            return <CommandIcon command={item.command} />;
        case "entry": {
            const Icon = ENTRY_ICON[item.entry.id] ?? AppWindow;
            return <Icon size="1em" className="icon-md suggestion-icon" />;
        }
    }
}

function itemLabel(item: OmniboxItem): string {
    switch (item.kind) {
        case "ai":
            return `问 AI：${item.query}`;
        case "document":
            return item.document.displayTitle;
        case "folder":
            return item.folder.name;
        case "app":
            return item.app.name;
        case "history":
        case "online":
            return item.text;
        case "command":
            return `${item.command.prefix} · ${item.command.action}`;
        case "entry":
            return item.entry.label;
    }
}

function itemBadge(item: OmniboxItem, engine: EngineId): string | null {
    switch (item.kind) {
        case "ai":
            return formatShortcut(SHORTCUTS.searchAskAi.binding);
        case "document":
            return item.document.isHomeFixed ? "首页" : "笔记";
        case "folder":
            return "文件夹";
        case "app":
            return item.app.url.replace(/^https?:\/\//, "").replace(
                /\/$/,
                "",
            ) ||
                "网站";
        case "history":
            return "历史";
        case "online":
            return item.engine && item.engine !== engine ? item.engine : null;
        case "command":
            return "快捷命令";
        case "entry":
            return null;
    }
}

/** Grouped options: one flat option sequence for aria-activedescendant. */
export function OmniboxListbox(
    { id, view, onSelect, onHover }: {
        id: string;
        view: OmniboxListboxView;
        onSelect: (item: OmniboxItem) => void;
        onHover: (item: OmniboxItem) => void;
    },
) {
    let index = 0;
    return (
        <div id={id} role="listbox" aria-label="搜索建议">
            {view.groups.map((group) => (
                <div
                    key={group.id}
                    role="group"
                    className="suggestion-group"
                    aria-labelledby={`${id}-group-${group.id}`}
                >
                    <div
                        id={`${id}-group-${group.id}`}
                        className="suggestion-group-label"
                    >
                        {group.label}
                    </div>
                    {group.items.map((item) => {
                        const key = omniboxItemKey(item);
                        const optionIndex = index++;
                        const selected = key === view.selectedKey;
                        const badge = itemBadge(item, view.engine);
                        return (
                            <div
                                key={key}
                                id={`${id}-${optionIndex}`}
                                role="option"
                                tabIndex={-1}
                                aria-selected={selected}
                                className={`suggestion-item${
                                    selected ? " active" : ""
                                }`}
                                onPointerDown={(event) =>
                                    event.preventDefault()}
                                onClick={() => onSelect(item)}
                                onMouseEnter={() => onHover(item)}
                            >
                                <div className="suggestion-item-main">
                                    <ItemIcon item={item} />
                                    <span className="suggestion-text">
                                        {item.kind === "ai"
                                            ? itemLabel(item)
                                            : splitSuggestionLabel(
                                                itemLabel(item),
                                                view.matchingQuery,
                                            ).map((segment, i) => (
                                                <span
                                                    key={i}
                                                    className={segment.kind ===
                                                            "plain"
                                                        ? undefined
                                                        : `suggestion-${segment.kind}`}
                                                >
                                                    {segment.text}
                                                </span>
                                            ))}
                                    </span>
                                </div>
                                {badge && (
                                    <span className="suggestion-badge">
                                        {badge}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
