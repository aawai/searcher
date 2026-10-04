import {
    SettingsActionCard,
    SettingsSection,
} from "../../app/SettingsPrimitives.tsx";
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
    description: string;
}

const SHORTCUT_SECTIONS: readonly ShortcutSectionConfig[] = [
    {
        id: "global",
        title: "全局",
        description: "首页非可编辑区域",
    },
    {
        id: "search",
        title: "搜索",
        description: "主搜索框相关的快捷键与提交方式",
    },
    {
        id: "ask",
        title: "AI 问答",
        description: "AI 问答工作区专用的快捷键",
    },
    {
        id: "notes",
        title: "便签编辑",
        description: "便签正文编辑器专用的快捷键与文本格式",
    },
];

function ShortcutItemCard({
    item,
    platform,
}: {
    item: KeyboardShortcutDefinition;
    platform: ShortcutPlatform;
}) {
    return (
        <SettingsActionCard
            title={item.action}
            description={
                <span className="settings-shortcut-details">
                    <span className="settings-shortcut-scope">
                        <span className="settings-shortcut-label">
                            生效上下文：
                        </span>
                        {item.context}
                    </span>
                    {item.description && (
                        <span className="settings-shortcut-note">
                            {item.description}
                        </span>
                    )}
                </span>
            }
        >
            <div className="settings-shortcut-keycap-group">
                <kbd className="settings-shortcut-keycap" aria-hidden="true">
                    {formatShortcut(item.binding, platform)}
                </kbd>
                <span className="sr-only">
                    快捷键：{formatShortcutAccessible(item.binding, platform)}
                </span>
            </div>
        </SettingsActionCard>
    );
}

function CommandItemCard({ cmd }: { cmd: SearchQuickCommand }) {
    return (
        <SettingsActionCard
            title={cmd.action}
            description={
                <span className="settings-shortcut-details">
                    <span className="settings-shortcut-scope">
                        <span className="settings-shortcut-label">
                            生效上下文：
                        </span>
                        主搜索框
                    </span>
                    <span className="settings-shortcut-note">
                        <span className="settings-shortcut-label">
                            用法说明：
                        </span>
                        <code className="settings-shortcut-command-example">
                            {`${cmd.prefix} query`}
                        </code>
                    </span>
                </span>
            }
        >
            <div className="settings-shortcut-keycap-group">
                <kbd
                    className="settings-shortcut-keycap"
                    aria-hidden="true"
                >
                    {cmd.prefix}
                </kbd>
                <span className="sr-only">快捷命令：{cmd.prefix}</span>
            </div>
        </SettingsActionCard>
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
                return (
                    <SettingsSection
                        key={section.id}
                        title={section.title}
                        description={section.description}
                    >
                        {sectionItems.map((
                            item: KeyboardShortcutDefinition,
                        ) => (
                            <ShortcutItemCard
                                key={item.id}
                                item={item}
                                platform={platform}
                            />
                        ))}
                    </SettingsSection>
                );
            })}

            <SettingsSection
                title="快捷命令"
                description="在主搜索框输入前缀直达特定搜索引擎或 AI 问答"
            >
                {SEARCH_QUICK_COMMANDS.map((cmd: SearchQuickCommand) => (
                    <CommandItemCard key={cmd.id} cmd={cmd} />
                ))}
            </SettingsSection>
        </div>
    );
}
