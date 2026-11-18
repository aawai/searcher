import { type ReactNode, useLayoutEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
    ArrowLeft,
    FileClock,
    HardDriveDownload,
    LayoutDashboard,
    type LucideIcon,
    SlidersHorizontal,
    Users,
} from "lucide-react";
import { ActionGroup } from "../components/searcher/semantic.tsx";
import { PageShell } from "../components/searcher/PageShell.tsx";
import { type AdminTab, routes } from "./routes.ts";
import "./admin.css";

interface AdminNavItem {
    id: AdminTab;
    label: string;
    icon: LucideIcon;
    to: string;
    panelWidth: "narrow" | "wide";
}

const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
    {
        id: "overview",
        label: "概览",
        icon: LayoutDashboard,
        to: routes.admin("overview"),
        panelWidth: "narrow",
    },
    {
        id: "users",
        label: "用户",
        icon: Users,
        to: routes.admin("users"),
        panelWidth: "wide",
    },
    {
        id: "settings",
        label: "设置",
        icon: SlidersHorizontal,
        to: routes.admin("settings"),
        panelWidth: "narrow",
    },
    {
        id: "audit",
        label: "审计",
        icon: FileClock,
        to: routes.admin("audit"),
        panelWidth: "wide",
    },
    {
        id: "backup",
        label: "备份",
        icon: HardDriveDownload,
        to: routes.admin("backup"),
        panelWidth: "narrow",
    },
];

export function AdminPanelHeader({
    title,
    meta,
    actions,
}: {
    title: string;
    meta?: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <header className="admin-panel-header">
            <div className="admin-panel-heading">
                <h2 className="admin-panel-title">{title}</h2>
                {meta && <span className="admin-panel-meta">{meta}</span>}
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
    const navRef = useRef<HTMLElement>(null);
    const currentItem = ADMIN_NAV_ITEMS.find((item) => item.id === activeTab) ??
        ADMIN_NAV_ITEMS[0];

    useLayoutEffect(() => {
        const nav = navRef.current;
        if (!nav) return;

        const markEdges = () => {
            if (nav.scrollWidth <= nav.clientWidth + 1) {
                nav.removeAttribute("data-overflow-start");
                nav.removeAttribute("data-overflow-end");
                return;
            }
            const end = nav.scrollWidth - nav.clientWidth;
            nav.toggleAttribute("data-overflow-start", nav.scrollLeft > 1);
            nav.toggleAttribute("data-overflow-end", nav.scrollLeft < end - 1);
        };

        const revealActive = () => {
            const active = nav.querySelector<HTMLElement>(
                "[aria-current=page]",
            );
            if (active && nav.scrollWidth > nav.clientWidth + 1) {
                const bounds = nav.getBoundingClientRect();
                const item = active.getBoundingClientRect();
                if (item.left < bounds.left) {
                    nav.scrollLeft += item.left - bounds.left;
                } else if (item.right > bounds.right) {
                    nav.scrollLeft += item.right - bounds.right;
                }
            }
            markEdges();
        };

        revealActive();
        const observer = new ResizeObserver(revealActive);
        observer.observe(nav);
        for (const link of nav.children) observer.observe(link);
        nav.addEventListener("scroll", markEdges, { passive: true });
        return () => {
            observer.disconnect();
            nav.removeEventListener("scroll", markEdges);
        };
    }, [activeTab]);

    return (
        <PageShell archetype="management">
            <div className="admin-layout">
                <aside className="admin-sidebar">
                    <h1 className="page-title admin-sidebar-title">管理后台</h1>
                    <nav
                        ref={navRef}
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
                    <Link to={routes.home} className="admin-back-link">
                        <ArrowLeft
                            size="1em"
                            className="icon-md"
                            aria-hidden="true"
                        />
                        <span>返回首页</span>
                    </Link>
                </aside>
                <section
                    className="admin-panel"
                    data-panel-width={currentItem.panelWidth}
                >
                    {children}
                </section>
            </div>
        </PageShell>
    );
}
