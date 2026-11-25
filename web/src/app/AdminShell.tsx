import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import {
    ArrowLeft,
    FileClock,
    HardDriveDownload,
    LayoutDashboard,
    type LucideIcon,
    Shield,
    SlidersHorizontal,
    Users,
} from "lucide-react";
import { ActionGroup } from "../components/searcher/semantic.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import { type AdminTab, routes } from "./routes.ts";
import { useAppState } from "./state.tsx";
import "./admin.css";

interface AdminNavItem {
    id: AdminTab;
    label: string;
    icon: LucideIcon;
    to: string;
}

const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
    {
        id: "overview",
        label: "概览",
        icon: LayoutDashboard,
        to: routes.admin("overview"),
    },
    {
        id: "users",
        label: "用户",
        icon: Users,
        to: routes.admin("users"),
    },
    {
        id: "settings",
        label: "设置",
        icon: SlidersHorizontal,
        to: routes.admin("settings"),
    },
    {
        id: "audit",
        label: "审计",
        icon: FileClock,
        to: routes.admin("audit"),
    },
    {
        id: "backup",
        label: "备份",
        icon: HardDriveDownload,
        to: routes.admin("backup"),
    },
];

export interface AdminPanelHeaderProps {
    title: string;
    description?: string;
    meta?: ReactNode;
    actions?: ReactNode;
}

export function AdminPanelHeader({
    title,
    description,
    meta,
    actions,
}: AdminPanelHeaderProps) {
    return (
        <header className="admin-panel-header">
            <div className="admin-panel-heading-block">
                <div className="admin-panel-heading">
                    <h2 className="admin-panel-title">{title}</h2>
                    {meta && <span className="admin-panel-meta">{meta}</span>}
                </div>
                {description && (
                    <p className="admin-panel-description">{description}</p>
                )}
            </div>
            {actions && <ActionGroup>{actions}</ActionGroup>}
        </header>
    );
}

export function AdminShell({
    activeTab,
    children,
}: {
    activeTab: AdminTab;
    children: ReactNode;
}) {
    const { user } = useAppState();

    return (
        <PageShell archetype="management">
            <div className="admin-layout admin-shell">
                <aside className="admin-sidebar">
                    <div className="admin-brand-row">
                        <div className="admin-brand">
                            <span
                                className="admin-brand-emblem"
                                aria-hidden="true"
                            >
                                <Shield size="1em" className="icon-md" />
                            </span>
                            <div className="admin-brand-text">
                                <h1 className="page-title admin-sidebar-title">
                                    管理后台
                                </h1>
                                {user && (
                                    <span className="admin-brand-caption">
                                        @{user.username} · 管理员
                                    </span>
                                )}
                            </div>
                        </div>
                        <Link
                            to={routes.home}
                            className="admin-back-link admin-back-link--mobile"
                        >
                            <ArrowLeft
                                size="1em"
                                className="icon-sm"
                                aria-hidden="true"
                            />
                            <span>返回首页</span>
                        </Link>
                    </div>

                    <nav
                        className="admin-nav"
                        aria-label="管理后台主导航"
                    >
                        {ADMIN_NAV_ITEMS.map((item) => {
                            const Icon = item.icon;
                            return (
                                <Link
                                    key={item.id}
                                    to={item.to}
                                    replace
                                    className="admin-nav-item"
                                    aria-current={activeTab === item.id
                                        ? "page"
                                        : undefined}
                                >
                                    <Icon
                                        size="1em"
                                        className="icon-md admin-nav-icon"
                                        aria-hidden="true"
                                    />
                                    <span className="admin-nav-label">
                                        {item.label}
                                    </span>
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="admin-sidebar-footer">
                        <Link to={routes.home} className="admin-back-link">
                            <ArrowLeft
                                size="1em"
                                className="icon-md"
                                aria-hidden="true"
                            />
                            <span>返回首页</span>
                        </Link>
                    </div>
                </aside>
                <section className="admin-panel">{children}</section>
            </div>
        </PageShell>
    );
}
