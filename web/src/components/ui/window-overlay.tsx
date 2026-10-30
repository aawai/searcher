import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import { useEscapeLayer } from "./escape-layer-stack.tsx";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Modal overlay confined to its positioned parent rather than the viewport. */
export function WindowOverlay({
    open, onOpenChange, children, className, label, restoreFocusRef,
    restoreFocus = true, modal = true, active = true, role = "dialog",
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: ReactNode;
    className?: string;
    label: string;
    restoreFocusRef?: RefObject<HTMLElement | null>;
    restoreFocus?: boolean;
    modal?: boolean;
    active?: boolean;
    role?: "dialog" | "region";
}) {
    const ref = useRef<HTMLDivElement>(null);
    const closeRef = useRef(onOpenChange);
    closeRef.current = onOpenChange;
    const restoreRef = useRef(restoreFocus);
    restoreRef.current = restoreFocus;
    useEscapeLayer(open && modal && active, () => closeRef.current(false), "window-overlay");
    useEffect(() => {
        if (!open || !modal || !ref.current) return;
        const overlay = ref.current;
        const siblings = Array.from(overlay.parentElement?.children ?? [])
            .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay);
        const previous = siblings.map((element) => element.inert);
        siblings.forEach((element) => { element.inert = true; });
        const first = overlay.querySelector<HTMLElement>(FOCUSABLE);
        (first ?? overlay).focus();
        return () => {
            siblings.forEach((element, index) => { element.inert = previous[index]; });
            if (restoreRef.current) restoreFocusRef?.current?.focus();
        };
    }, [open, modal, restoreFocusRef]);
    return (
        <div
            ref={ref}
            className={className}
            hidden={!open}
            role={modal ? role : undefined}
            aria-label={modal ? label : undefined}
            tabIndex={-1}
            onKeyDown={(event) => {
                if (!modal || event.key !== "Tab") return;
                const elements = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE))
                    .filter((element) => element.getClientRects().length > 0);
                if (!elements.length) { event.preventDefault(); event.currentTarget.focus(); return; }
                const index = elements.indexOf(document.activeElement as HTMLElement);
                if (event.shiftKey && index <= 0) { event.preventDefault(); elements[elements.length - 1].focus(); }
                else if (!event.shiftKey && (index < 0 || index === elements.length - 1)) { event.preventDefault(); elements[0].focus(); }
            }}
        >
            {children}
        </div>
    );
}
