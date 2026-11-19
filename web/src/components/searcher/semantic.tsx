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
import { Input } from "../ui/input.tsx";
import { Eye, EyeOff, Search, X } from "lucide-react";
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
/**
 * One row of a grouped list. As a form row, `labelFor` makes the title the
 * field's `<label>` and `message` adds the field's hint or error as the row's
 * second line; pass `messageId` to the field's `aria-describedby`.
 */
export function SettingsRow(
    {
        title,
        description,
        labelFor,
        message,
        messageId,
        invalid = false,
        children,
        className,
        ...props
    }:
        & ComponentProps<"div">
        & {
            title: ReactNode;
            description?: ReactNode;
            labelFor?: string;
            message?: ReactNode;
            messageId?: string;
            invalid?: boolean;
        },
) {
    return (
        <div className={cn("settings-row", className)} {...props}>
            <div className="settings-row-label">
                {labelFor
                    ? (
                        <label
                            htmlFor={labelFor}
                            className="settings-row-title"
                        >
                            {title}
                        </label>
                    )
                    : <span className="settings-row-title">{title}</span>}
                {description && (
                    <div className="settings-row-desc">{description}</div>
                )}
            </div>
            <div className="settings-row-control">{children}</div>
            {message && (
                <div
                    id={messageId}
                    className="settings-row-message"
                    data-tone={invalid ? "danger" : undefined}
                >
                    {message}
                </div>
            )}
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

/**
 * Vertical stack of standalone form fields with consistent spacing.
 */
export function FormFields({ className, ...props }: ComponentProps<"div">) {
    return (
        <div
            data-slot="form-fields"
            className={cn("form-fields", className)}
            {...props}
        />
    );
}

/**
 * Standalone form field: label above, full-width bordered control below,
 * optional trailing counter/accessory, and hint or error bound via `messageId`.
 */
export function FormField(
    {
        label,
        labelFor,
        labelEnd,
        hint,
        error,
        messageId,
        invalid,
        className,
        children,
        ...props
    }: ComponentProps<"div"> & {
        label: ReactNode;
        labelFor?: string;
        labelEnd?: ReactNode;
        hint?: ReactNode;
        error?: ReactNode;
        messageId?: string;
        invalid?: boolean;
    },
) {
    const isInvalid = invalid ?? Boolean(error);
    const message = error ?? hint;
    return (
        <div
            data-slot="form-field"
            className={cn("form-field", className)}
            {...props}
        >
            <div className="form-field-header">
                {labelFor
                    ? (
                        <label
                            htmlFor={labelFor}
                            className="form-field-label"
                        >
                            {label}
                        </label>
                    )
                    : <span className="form-field-label">{label}</span>}
                {labelEnd && (
                    <span className="form-field-end">{labelEnd}</span>
                )}
            </div>
            {children}
            {message && (
                <div
                    id={messageId}
                    role={isInvalid ? "alert" : undefined}
                    className="form-field-message"
                    data-tone={isInvalid ? "danger" : undefined}
                >
                    {message}
                </div>
            )}
        </div>
    );
}
/**
 * `inline`: the empty state of a list that is itself an entry of that list,
 * start-aligned on the list's content line instead of a centred message.
 */
export function EmptyState(
    {
        title,
        description,
        action,
        headingLevel = 2,
        density = "default",
        className,
        ...props
    }: Omit<ComponentProps<"div">, "title"> & {
        title?: string;
        description?: string;
        action?: ReactNode;
        headingLevel?: 2 | 3;
        density?: "default" | "compact" | "inline";
    },
) {
    const Heading = headingLevel === 3 ? "h3" : "h2";
    return (
        <div
            className={cn("empty-state", className)}
            data-density={density}
            {...props}
        >
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
        ...props
    }: ComponentProps<"div"> & {
        density?: "default" | "compact";
        announce?: boolean;
    },
) {
    return (
        <div
            className={cn("loading-state", className)}
            data-density={density}
            role={announce ? "status" : "presentation"}
            aria-live={announce ? "polite" : "off"}
            {...props}
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
    { items, label, compact = false, className, ...props }:
        & Omit<ComponentProps<"nav">, "children">
        & {
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
            className={cn("local-navigation", className)}
            data-compact={compact || undefined}
            aria-label={label}
            {...props}
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
    { children, caption, className, ...props }: ComponentProps<"div"> & {
        caption?: string;
    },
) {
    return (
        <div className={cn("management-table", className)} {...props}>
            <Table>
                {caption && (
                    <TableCaption className="sr-only">{caption}</TableCaption>
                )}
                {children}
            </Table>
        </div>
    );
}
/**
 * Footer of a paged management list: the total on the start side, page
 * buttons on the end side only when there is more than one page.
 */
export function Pagination(
    {
        total,
        page,
        pageCount,
        busy = false,
        onPageChange,
        label,
        className,
        ...props
    }: Omit<ComponentProps<"nav">, "children"> & {
        /** Already worded total, e.g. "共 6 位". */
        total: string;
        page: number;
        pageCount: number;
        busy?: boolean;
        onPageChange: (page: number) => void;
        label: string;
    },
) {
    const paged = pageCount > 1;
    return (
        <nav
            className={cn("pagination", className)}
            aria-label={label}
            {...props}
        >
            <span>
                {paged ? `${total} · 第 ${page} / ${pageCount} 页` : total}
            </span>
            {paged && (
                <ActionGroup>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || page <= 1}
                        onClick={() => onPageChange(page - 1)}
                    >
                        上一页
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy || page >= pageCount}
                        onClick={() => onPageChange(page + 1)}
                    >
                        下一页
                    </Button>
                </ActionGroup>
            )}
        </nav>
    );
}
export type SearchFieldProps =
    & Omit<
        ComponentProps<typeof Input>,
        "type" | "variant" | "value" | "onChange"
    >
    & {
        value: string;
        onValueChange: (value: string) => void;
        clearLabel?: string;
        wrapperClassName?: string;
        inputRef?: Ref<HTMLInputElement>;
    };

export function SearchField({
    value,
    onValueChange,
    clearLabel = "清除搜索",
    wrapperClassName,
    className,
    disabled = false,
    inputRef,
    ref,
    ...props
}: SearchFieldProps) {
    const ownRef = useRef<HTMLInputElement | null>(null);
    const assignRef = (
        target: Ref<HTMLInputElement> | undefined,
        node: HTMLInputElement | null,
    ) => {
        if (typeof target === "function") target(node);
        else if (target) {
            (target as { current: HTMLInputElement | null }).current = node;
        }
    };
    const setRef = (node: HTMLInputElement | null) => {
        ownRef.current = node;
        assignRef(inputRef, node);
        assignRef(ref, node);
    };
    return (
        <div className={cn("search-field", wrapperClassName)}>
            <Search
                size="1em"
                className="icon-md search-field-icon"
                aria-hidden="true"
            />
            <Input
                ref={setRef}
                type="search"
                variant="search"
                className={cn("search-field-input", className)}
                value={value}
                onChange={(event) => onValueChange(event.target.value)}
                disabled={disabled}
                {...props}
            />
            {Boolean(value) && !disabled && (
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="search-field-clear"
                    onClick={() => {
                        onValueChange("");
                        ownRef.current?.focus();
                    }}
                    aria-label={clearLabel}
                >
                    <X size="1em" className="icon-sm" aria-hidden="true" />
                </Button>
            )}
        </div>
    );
}

export type SecretInputProps =
    & Omit<ComponentProps<typeof Input>, "type">
    & {
        showLabel?: string;
        hideLabel?: string;
        defaultVisible?: boolean;
        wrapperClassName?: string;
        toggleClassName?: string;
    };

export function SecretInput({
    showLabel = "显示密码",
    hideLabel = "隐藏密码",
    defaultVisible = false,
    wrapperClassName,
    toggleClassName,
    className,
    disabled,
    ...props
}: SecretInputProps) {
    const [visible, setVisible] = useState(defaultVisible);
    return (
        <div
            className={cn("secret-field", wrapperClassName)}
            data-slot="secret-field"
        >
            <Input
                type={visible ? "text" : "password"}
                className={cn("secret-field-input", className)}
                disabled={disabled}
                {...props}
            />
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn("secret-field-toggle", toggleClassName)}
                aria-pressed={visible}
                aria-label={visible ? hideLabel : showLabel}
                disabled={disabled}
                onClick={() => setVisible((prev) => !prev)}
            >
                {visible
                    ? (
                        <EyeOff
                            size="1em"
                            className="icon-md"
                            aria-hidden="true"
                        />
                    )
                    : (
                        <Eye
                            size="1em"
                            className="icon-md"
                            aria-hidden="true"
                        />
                    )}
            </Button>
        </div>
    );
}

export {
    type PresetSliderStage,
    SettingsPresetSlider,
    type SettingsPresetSliderProps,
} from "./SettingsPresetSlider.tsx";
