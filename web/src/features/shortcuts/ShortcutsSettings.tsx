import {
    SettingsGroup,
    SettingsRow,
} from "../../components/searcher/semantic.tsx";
import {
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
    { id: "notes", title: "便签编辑" },
];

function ShortcutRow({
    item,
    platform,
}: {
    item: KeyboardShortcutDefinition;
    platform: ShortcutPlatform;
}) {
    return (
        <SettingsRow title={item.action} description={item.description}>
            <span className="settings-shortcut-keycap-group">
                <kbd className="settings-shortcut-keycap" aria-hidden="true">
                    {formatShortcut(item.binding, platform)}
                </kbd>
                <span className="sr-only">
                    快捷键：{formatShortcutAccessible(item.binding, platform)}
                </span>
            </span>
        </SettingsRow>
    );
}

function CommandRow({ cmd }: { cmd: SearchQuickCommand }) {
    return (
        <SettingsRow title={cmd.action}>
            <span className="settings-shortcut-keycap-group">
                <kbd className="settings-shortcut-keycap" aria-hidden="true">
                    {cmd.prefix}
                </kbd>
                <span className="settings-shortcut-arg" aria-hidden="true">
                    关键词
                </span>
                <span className="sr-only">
                    {`快捷命令：${cmd.prefix} 关键词`}
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
                const scope = [...new Set(sectionItems.map((s) => s.context))]
                    .join(" · ");
                return (
                    <SettingsGroup
                        key={section.id}
                        title={section.title}
                        footer={scope || undefined}
                    >
                        {sectionItems.map((
                            item: KeyboardShortcutDefinition,
                        ) => (
                            <ShortcutRow
                                key={item.id}
                                item={item}
                                platform={platform}
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
