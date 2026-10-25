import {
    type ComponentProps,
    type ReactNode,
    type Ref,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { Card } from "../ui/card.tsx";
import { Button } from "../ui/button.tsx";
import { X } from "lucide-react";
import { Table, TableCaption } from "../ui/table.tsx";
import { usePresence } from "../ui/presence.ts";
import { cn } from "../../lib/utils.ts";

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
export function SettingsCard(
    { className, padded = false, ...props }: ComponentProps<"div"> & {
        padded?: boolean;
    },
) {
    return (
        <Card
            className={cn("settings-card", className)}
            data-padded={padded || undefined}
            {...props}
        />
    );
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
/**
 * Grouped list: optional heading above, rows inside one surface, optional
 * footnote below. The canonical unit for settings, account and admin forms.
 */
export function SettingsGroup(
    {
        title,
        footer,
        actions,
        headingLevel = 2,
        padded = false,
        className,
        children,
        ...props
    }: Omit<ComponentProps<"section">, "title"> & {
        title?: string;
        footer?: ReactNode;
        actions?: ReactNode;
        headingLevel?: 2 | 3;
        padded?: boolean;
    },
) {
    const Heading = headingLevel === 3 ? "h3" : "h2";
    return (
        <section className={cn("settings-group", className)} {...props}>
            {(title || actions) && (
                <header className="settings-group-header">
                    {title && (
                        <Heading className="settings-group-title">
                            {title}
                        </Heading>
                    )}
                    {actions && <ActionGroup>{actions}</ActionGroup>}
                </header>
            )}
            <SettingsCard padded={padded}>{children}</SettingsCard>
            {footer && <p className="settings-group-footer">{footer}</p>}
        </section>
    );
}
export function ActionGroup({ className, ...props }: ComponentProps<"div">) {
    return <div className={cn("action-group", className)} {...props} />;
}
export function EmptyState(
    {
        title,
        description,
        action,
        headingLevel = 2,
        density = "default",
        className,
    }: {
        title?: string;
        description?: string;
        action?: ReactNode;
        headingLevel?: 2 | 3;
        density?: "default" | "compact";
        className?: string;
    },
) {
    const Heading = headingLevel === 3 ? "h3" : "h2";
    return (
        <div className={cn("empty-state", className)} data-density={density}>
            {title && <Heading>{title}</Heading>}
            {description && <p>{description}</p>}
            {action && <ActionGroup>{action}</ActionGroup>}
        </div>
    );
}
/**
 * Transient feedback (floating banner, undo toast) is shown and hidden by its
 * owner. `open` lets it play its exit motion: while closing, the props of the
 * last open render stay on screen, inert, until the CSS exit settles.
 */
function useTransientPresence<P extends object>(open: boolean, props: P) {
    const presence = usePresence<HTMLDivElement>(open);
    const lastOpenProps = useRef(props);
    useLayoutEffect(() => {
        if (open) lastOpenProps.current = props;
    });
    return { ...presence, props: open ? props : lastOpenProps.current };
}
/**
 * `open={false}` removes the banner; a floating banner fades out first, so
 * owners keep it mounted and toggle `open` instead of rendering it conditionally.
 */
export function StatusBanner(
    { open = true, ...props }:
        & ComponentProps<"div">
        & {
            open?: boolean;
            tone?: "info" | "error" | "success" | "warning";
            presentation?: "inline" | "floating";
            density?: "default" | "compact";
        },
) {
    const presence = useTransientPresence(open, props);
    if (!presence.mounted) return null;
    const {
        tone = "info",
        presentation = "inline",
        density = "default",
        className,
        ...rest
    } = presence.props;
    return (
        <div
            role={tone === "error" ? "alert" : "status"}
            className={cn("status-banner", className)}
            data-tone={tone}
            data-presentation={presentation}
            data-density={density}
            {...rest}
            ref={presence.ref}
            data-ending-style={presence.ending ? "" : undefined}
            inert={presence.ending}
        />
    );
}
export function LoadingState(
    {
        children = "正在加载…",
        density = "default",
        className,
        announce = true,
    }: {
        children?: ReactNode;
        density?: "default" | "compact";
        className?: string;
        announce?: boolean;
    },
) {
    return (
        <div
            className={cn("loading-state", className)}
            data-density={density}
            role={announce ? "status" : "presentation"}
            aria-live={announce ? "polite" : "off"}
        >
            {children}
        </div>
    );
}
type UndoToastProps = ComponentProps<"div"> & {
    /**
     * Owners keep the toast mounted and toggle `open`: closing fades a floating
     * toast out before it unmounts. Defaults to open for conditional rendering.
     */
    open?: boolean;
    message: ReactNode;
    onUndo: () => void;
    onClose?: () => void;
    placement?: "floating" | "inline";
    host?: HTMLElement | null;
    undoLabel?: string;
    undoDisabled?: boolean;
    actions?: ReactNode;
    onPauseChange?: (paused: boolean) => void;
};
export function UndoToast({ open = true, ...props }: UndoToastProps) {
    const presence = useTransientPresence(open, props);
    if (!presence.mounted) return null;
    return (
        <UndoToastLayer
            {...presence.props}
            ending={presence.ending}
            layerRef={presence.ref}
        />
    );
}
function UndoToastLayer(
    {
        ending,
        layerRef,
        message,
        onUndo,
        onClose,
        className,
        placement = "floating",
        host,
        undoLabel = "撤销",
        undoDisabled = false,
        actions,
        onPauseChange,
        ...props
    }: Omit<UndoToastProps, "open"> & {
        ending: boolean;
        layerRef: Ref<HTMLDivElement>;
    },
) {
    const pointerInside = useRef(false);
    const focusInside = useRef(false);
    const paused = useRef(false);
    const pauseChangeRef = useRef(onPauseChange);
    pauseChangeRef.current = onPauseChange;
    function updatePause() {
        const next = pointerInside.current || focusInside.current;
        if (next === paused.current) return;
        paused.current = next;
        pauseChangeRef.current?.(next);
    }
    const [container] = useState(() =>
        host !== undefined ? document.createElement("div") : null
    );
    useLayoutEffect(() => {
        if (container) (host ?? document.body).append(container);
    }, [container, host]);
    useLayoutEffect(() => () => {
        container?.remove();
    }, [container]);
    const content = (
        <div
            {...props}
            ref={layerRef}
            className={cn("undo-toast", className)}
            data-placement={placement}
            data-ending-style={ending ? "" : undefined}
            inert={ending}
            role="status"
            aria-live="polite"
            onPointerEnter={(event) => {
                if (event.pointerType === "touch") return;
                pointerInside.current = true;
                updatePause();
            }}
            onPointerLeave={(event) => {
                if (event.pointerType === "touch") return;
                pointerInside.current = false;
                updatePause();
            }}
            onFocusCapture={() => {
                focusInside.current = true;
                updatePause();
            }}
            onBlurCapture={(event) => {
                if (
                    event.currentTarget.contains(
                        event.relatedTarget as Node | null,
                    )
                ) return;
                focusInside.current = false;
                updatePause();
            }}
        >
            <span>{message}</span>
            <Button
                variant="ghost"
                disabled={undoDisabled}
                onClick={onUndo}
            >
                {undoLabel}
            </Button>
            {actions && <div className="undo-toast-actions">{actions}</div>}
            {onClose && (
                <Button
                    variant="ghost"
                    size="icon"
                    aria-label="关闭撤销提示"
                    onClick={onClose}
                >
                    <X size="1em" className="icon-md" />
                </Button>
            )}
        </div>
    );
    return container ? createPortal(content, container) : content;
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
        // A clipped side fades, so tabs cut at the edge read as scrollable.
        const markEdges = () => {
            const end = navigation.scrollWidth - navigation.clientWidth;
            navigation.toggleAttribute(
                "data-overflow-start",
                navigation.scrollLeft > 1,
            );
            navigation.toggleAttribute(
                "data-overflow-end",
                navigation.scrollLeft < end - 1,
            );
        };
        const revealActive = () => {
            if (active) {
                const bounds = navigation.getBoundingClientRect();
                const item = active.getBoundingClientRect();
                if (item.left < bounds.left) {
                    navigation.scrollLeft += item.left - bounds.left;
                } else if (item.right > bounds.right) {
                    navigation.scrollLeft += item.right - bounds.right;
                }
            }
            markEdges();
        };
        revealActive();
        const observer = new ResizeObserver(revealActive);
        observer.observe(navigation);
        for (const link of navigation.children) observer.observe(link);
        navigation.addEventListener("scroll", markEdges, { passive: true });
        return () => {
            observer.disconnect();
            navigation.removeEventListener("scroll", markEdges);
        };
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
export {
    type PresetSliderStage,
    SettingsPresetSlider,
    type SettingsPresetSliderProps,
} from "./SettingsPresetSlider.tsx";
