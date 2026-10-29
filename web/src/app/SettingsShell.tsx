import {
    ChevronLeft,
    ChevronRight,
    Keyboard,
    type LucideIcon,
    Palette,
    RefreshCw,
    Search,
    Sparkles,
    UserRound,
} from "lucide-react";
import { type ReactNode } from "react";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import { routes, type SettingsTab } from "./routes.ts";
import { useAppState } from "./state.tsx";
import type { PageHost } from "./page-host.tsx";
import "./settings.css";

export type SettingsSection = SettingsTab | "account";

/** Navigation order. The account entry is only offered to signed-in users. */
const sections: Record<
    SettingsSection,
    { label: string; icon: LucideIcon; to: string }
> = {
    account: { label: "账户与安全", icon: UserRound, to: routes.account },
    search: { label: "搜索", icon: Search, to: routes.settings("search") },
    appearance: {
        label: "外观",
        icon: Palette,
        to: routes.settings("appearance"),
    },
    ai: { label: "AI 问答", icon: Sparkles, to: routes.settings("ai") },
    data: { label: "数据与同步", icon: RefreshCw, to: routes.settings("data") },
    shortcuts: {
        label: "快捷键",
        icon: Keyboard,
        to: routes.settings("shortcuts"),
    },
};

/**
 * Settings archetype shared by the preference tabs and the account page: a
 * navigation list beside the content on wide screens; on narrow screens
 * `/settings` is the list and every section opens as a detail view with a
 * back link. Pages render only their content.
 */
export function SettingsShell(
    { current, actions, children, host }: {
        current: SettingsSection;
        actions?: ReactNode;
        children: ReactNode;
        host: PageHost;
    },
) {
    const { user } = useAppState();
    const { location, narrow: mobile, Link } = host;

    const items = (Object.keys(sections) as SettingsSection[]).filter(
        (id) => id !== "account" || user,
    );

    return (
        <PageShell as={host.inWindow ? "section" : "main"} archetype="utility">
            <div
                className="settings-layout"
                data-host-narrow={mobile ? "true" : undefined}
                data-view={location.pathname === routes.settings()
                    ? "list"
                    : "detail"}
            >
                <nav className="settings-nav" aria-label="设置分类">
                    <h1 className="settings-nav-title">设置</h1>
                    <ul className="settings-nav-list">
                        {items.map((id) => {
                            const { icon: Icon, label, to } = sections[id];
                            return (
                                <li key={id}>
                                    <Link
                                        to={to}
                                        replace={!mobile}
                                        className="settings-nav-item"
                                        aria-current={current === id
                                            ? "page"
                                            : undefined}
                                    >
                                        <Icon
                                            size="1em"
                                            className="icon-md"
                                            aria-hidden="true"
                                        />
                                        <span className="settings-nav-label">
                                            {label}
                                        </span>
                                        <ChevronRight
                                            size="1em"
                                            className="settings-nav-chevron icon-sm"
                                            aria-hidden="true"
                                        />
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </nav>
                <section className="settings-panel">
                    <Link to={routes.settings()} className="settings-back">
                        <ChevronLeft
                            size="1em"
                            className="icon-md"
                            aria-hidden="true"
                        />
                        <span>设置</span>
                    </Link>
                    <PageHeader
                        title={sections[current].label}
                        actions={actions}
                    />
                    <div className="settings-content">{children}</div>
                </section>
            </div>
        </PageShell>
    );
}
