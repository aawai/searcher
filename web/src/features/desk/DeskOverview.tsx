import type { CSSProperties, RefObject } from "react";
import { X } from "lucide-react";
import { Button } from "../../components/ui/button.tsx";
import { usePresence } from "../../components/ui/presence.ts";
import { DESK_OBJECT_LIMIT, type DeskObject } from "./desk-model.ts";
import { DeskGrid, DeskList } from "./DeskObjects.tsx";

/**
 * 览 at ≥768px: the desk's objects on the wallpaper-derived canvas. Mounted
 * while open or while its exit motion runs; inert while leaving.
 */
export function DeskOverview({
    open,
    objects,
    selectedId,
    detail,
    chromeBottom,
    scroller,
    onSelect,
    onReturn,
}: {
    open: boolean;
    objects: readonly DeskObject[];
    selectedId: string | null;
    /** How wide the detail bar beside 览 is, if open. */
    detail: "panel" | "expanded" | null;
    /** Bottom edge of the top bar (and any connection banner). */
    chromeBottom: number;
    scroller: RefObject<HTMLElement | null>;
    onSelect: (id: string) => void;
    onReturn: () => void;
}) {
    const presence = usePresence<HTMLElement>(open);
    if (!presence.mounted) return null;
    return (
        <section
            ref={presence.ref}
            className="desk-overview"
            aria-label="桌面"
            data-detail={detail ?? undefined}
            data-ending-style={presence.ending || undefined}
            inert={presence.ending || undefined}
            style={{
                "--desk-chrome-bottom": `${chromeBottom}px`,
            } as CSSProperties}
        >
            <div className="desk-overview-scroller" ref={scrollerRef(scroller)}>
                <div className="desk-overview-header">
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="返回首页"
                        title="返回首页"
                        onClick={onReturn}
                    >
                        <X size="1em" className="icon-lg" />
                    </Button>
                </div>
                {objects.length > DESK_OBJECT_LIMIT
                    ? (
                        <DeskList
                            objects={objects}
                            selectedId={selectedId}
                            onSelect={onSelect}
                        />
                    )
                    : (
                        <DeskGrid
                            objects={objects}
                            selectedId={selectedId}
                            onSelect={onSelect}
                        />
                    )}
            </div>
        </section>
    );
}

function scrollerRef(target: RefObject<HTMLElement | null>) {
    return (node: HTMLDivElement | null) => {
        target.current = node;
    };
}
