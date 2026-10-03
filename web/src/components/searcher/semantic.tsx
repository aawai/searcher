import {
    type ComponentProps,
    type ReactNode,
    useLayoutEffect,
    useRef,
} from "react";
import { Link, useLocation } from "react-router-dom";
import { Card } from "../ui/card.tsx";
import { Table, TableCaption } from "../ui/table.tsx";
import { cn } from "../../lib/utils.ts";
import "./semantic.css";

type SectionProps = ComponentProps<"section"> & {
    title?: string;
    description?: string;
    actions?: ReactNode;
    headingLevel?: 2 | 3;
};
export function SectionHeader(
    { title, description, actions, headingLevel = 2 }: {
        title: string;
        description?: string;
        actions?: ReactNode;
        headingLevel?: 2 | 3;
    },
) {
    const Heading = headingLevel === 3 ? "h3" : "h2";
    return (
        <header className="section-header">
            <div>
                <Heading>{title}</Heading>
                {description && <p>{description}</p>}
            </div>
            {actions && <ActionGroup>{actions}</ActionGroup>}
        </header>
    );
}
export function Section(
    {
        title,
        description,
        actions,
        headingLevel,
        className,
        children,
        ...props
    }: SectionProps,
) {
    return (
        <section className={cn("semantic-section", className)} {...props}>
            {title && (
                <SectionHeader
                    title={title}
                    description={description}
                    actions={actions}
                    headingLevel={headingLevel}
                />
            )}
            {children}
        </section>
    );
}
export function SettingsCard({ className, ...props }: ComponentProps<"div">) {
    return <Card className={cn("settings-card", className)} {...props} />;
}
export function SettingsRow(
    { title, description, children, className, ...props }:
        & ComponentProps<"div">
        & { title: string; description?: ReactNode },
) {
    return (
        <div className={cn("settings-row", className)} {...props}>
            <div className="settings-row-label">
                <span className="settings-row-title">{title}</span>
                {description && (
                    <div className="settings-row-desc">{description}</div>
                )}
            </div>
            <div className="settings-row-control">{children}</div>
        </div>
    );
}
export function ActionGroup({ className, ...props }: ComponentProps<"div">) {
    return <div className={cn("action-group", className)} {...props} />;
}
export function EmptyState(
    { title, description, action, headingLevel = 2 }: {
        title: string;
        description?: string;
        action?: ReactNode;
        headingLevel?: 2 | 3;
    },
) {
    const Heading = headingLevel === 3 ? "h3" : "h2";
    return (
        <div className="empty-state">
            <Heading>{title}</Heading>
            {description && <p>{description}</p>}
            {action && <ActionGroup>{action}</ActionGroup>}
        </div>
    );
}
export function StatusBanner(
    { tone = "info", className, ...props }: ComponentProps<"div"> & {
        tone?: "info" | "error" | "success";
    },
) {
    return (
        <div
            role={tone === "error" ? "alert" : "status"}
            className={cn("status-banner", className)}
            data-tone={tone}
            {...props}
        />
    );
}
export function LoadingState(
    { children = "正在加载…" }: { children?: ReactNode },
) {
    return (
        <div className="loading-state" role="status" aria-live="polite">
            {children}
        </div>
    );
}

export function WorkspaceToolbar(
    { className, ...props }: ComponentProps<"div">,
) {
    return <div className={cn("workspace-toolbar", className)} {...props} />;
}
export function LocalNavigation(
    { items, label, compact = false }: {
        items: { label: string; to: string }[];
        label: string;
        compact?: boolean;
    },
) {
    const location = useLocation();
    const navigationRef = useRef<HTMLElement>(null);
    useLayoutEffect(() => {
        const navigation = navigationRef.current;
        if (!compact || !navigation) return;
        const active = navigation.querySelector<HTMLElement>(
            "[aria-current=page]",
        );
        if (!active) return;
        const revealActive = () => {
            const bounds = navigation.getBoundingClientRect();
            const item = active.getBoundingClientRect();
            if (item.left < bounds.left) {
                navigation.scrollLeft += item.left - bounds.left;
            } else if (item.right > bounds.right) {
                navigation.scrollLeft += item.right - bounds.right;
            }
        };
        revealActive();
        const observer = new ResizeObserver(revealActive);
        observer.observe(navigation);
        for (const link of navigation.children) observer.observe(link);
        return () => observer.disconnect();
    }, [compact, location.pathname]);
    return (
        <nav
            ref={navigationRef}
            className="local-navigation"
            data-compact={compact || undefined}
            aria-label={label}
        >
            {items.map((item) => (
                <Link
                    key={item.to}
                    to={item.to}
                    replace
                    aria-current={location.pathname === item.to
                        ? "page"
                        : undefined}
                >
                    {item.label}
                </Link>
            ))}
        </nav>
    );
}
export function ManagementTable(
    { children, caption }: { children: ReactNode; caption?: string },
) {
    return (
        <div className="management-table">
            <Table>
                {caption && <TableCaption>{caption}</TableCaption>}
                {children}
            </Table>
        </div>
    );
}
