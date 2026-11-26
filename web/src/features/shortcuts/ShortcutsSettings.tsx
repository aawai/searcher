import { Fragment } from "react";
import {
    SettingsGroup,
    SettingsRow,
} from "../../components/searcher/semantic.tsx";
import {
    commandTakesQuery,
    formatShortcut,
    formatShortcutAccessible,
    getShortcutPlatform,
    KEYBOARD_SHORTCUTS,
    type KeyboardShortcutDefinition,
    SEARCH_QUICK_COMMANDS,
    type SearchQuickCommand,
    type ShortcutPlatform,
    type ShortcutScope,
} from "./shortcut-catalog.ts";

export interface ShortcutsSettingsProps {
    platform?: ShortcutPlatform;
}

interface ShortcutSectionConfig {
    id: ShortcutScope;
    title: string;
}

const SHORTCUT_SECTIONS: readonly ShortcutSectionConfig[] = [
    { id: "global", title: "全局" },
    { id: "search", title: "搜索" },
    { id: "ask", title: "AI 问答" },
    { id: "documents", title: "笔记编辑" },
];

interface GroupedShortcutRow {
    key: string;
    action: string;
    context: string;
    description?: string;
    items: KeyboardShortcutDefinition[];
}

function groupSectionShortcuts(
    items: readonly KeyboardShortcutDefinition[],
): GroupedShortcutRow[] {
    const groups: GroupedShortcutRow[] = [];
    for (const item of items) {
        const existing = groups.find(
            (group) =>
                group.action === item.action && group.context === item.context,
        );
        if (existing) {
            existing.items.push(item);
            if (
                item.description &&
                (!existing.description ||
                    item.description.length > existing.description.length)
            ) {
                existing.description = item.description;
            }
        } else {
            groups.push({
                key: item.id,
                action: item.action,
                context: item.context,
                description: item.description,
                items: [item],
            });
        }
    }
    return groups;
}

function ShortcutRow({
    row,
    platform,
    showContext,
}: {
    row: GroupedShortcutRow;
    platform: ShortcutPlatform;
    showContext: boolean;
}) {
    const description = showContext
        ? (row.description
            ? `${row.context} · ${row.description}`
            : row.context)
        : row.description;
    return (
        <SettingsRow title={row.action} description={description}>
            <span className="settings-shortcut-keycap-group">
                {row.items.map((item, index) => (
                    <Fragment key={item.id}>
                        {index > 0 && (
                            <span
                                className="settings-shortcut-arg"
                                aria-hidden="true"
                            >
                                或
                            </span>
                        )}
                        <kbd
                            className="settings-shortcut-keycap"
                            aria-hidden="true"
                        >
                            {formatShortcut(item.binding, platform)}
                        </kbd>
                        <span className="sr-only">
                            快捷键：{formatShortcutAccessible(
                                item.binding,
                                platform,
                            )}
                        </span>
                    </Fragment>
                ))}
            </span>
        </SettingsRow>
    );
}

function CommandRow({ cmd }: { cmd: SearchQuickCommand }) {
    const takesQuery = commandTakesQuery(cmd);
    return (
        <SettingsRow title={cmd.action}>
            <span className="settings-shortcut-keycap-group">
                <kbd className="settings-shortcut-keycap" aria-hidden="true">
                    {cmd.prefix}
                </kbd>
                {takesQuery && (
                    <span className="settings-shortcut-arg" aria-hidden="true">
                        关键词
                    </span>
                )}
                <span className="sr-only">
                    {`快捷命令：${cmd.prefix}${takesQuery ? " 关键词" : ""}`}
                </span>
            </span>
        </SettingsRow>
    );
}

export function ShortcutsSettings(
    { platform: platformProp }: ShortcutsSettingsProps = {},
) {
    const platform: ShortcutPlatform = platformProp ?? getShortcutPlatform();

    return (
        <div className="settings-shortcuts" data-platform={platform}>
            {SHORTCUT_SECTIONS.map((section) => {
                const sectionItems = KEYBOARD_SHORTCUTS.filter(
                    (s: KeyboardShortcutDefinition) => s.section === section.id,
                );
                const rows = groupSectionShortcuts(sectionItems);
                const contexts = [...new Set(rows.map((r) => r.context))];
                const mixedContext = contexts.length > 1;
                const loginRequiredRows = rows.filter((r) =>
                    r.context.includes("需要登录")
                );
                const footer = !mixedContext
                    ? contexts[0]
                    : loginRequiredRows.length > 0
                    ? `仅「${
                        loginRequiredRows.map((r) => r.action).join("」「")
                    }」需要登录；其余快捷键访客可用。`
                    : undefined;
                return (
                    <SettingsGroup
                        key={section.id}
                        title={section.title}
                        footer={footer}
                    >
                        {rows.map((row) => (
                            <ShortcutRow
                                key={row.key}
                                row={row}
                                platform={platform}
                                showContext={mixedContext}
                            />
                        ))}
                    </SettingsGroup>
                );
            })}

            <SettingsGroup title="快捷命令" footer="主搜索框">
                {SEARCH_QUICK_COMMANDS.map((cmd: SearchQuickCommand) => (
                    <CommandRow key={cmd.id} cmd={cmd} />
                ))}
            </SettingsGroup>
        </div>
    );
}
