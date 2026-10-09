import { ArrowUpRight, GripVertical } from "lucide-react";
import { useState } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip.tsx";
export interface WebAppItem {
    id: string;
    name: string;
    url: string;
    iconUrl?: string | null;
    iconAssetId?: string | null;
    iconSource?: "website" | "upload" | "url" | "ai" | "default";
    isPinned?: boolean;
    groupId?: string | null;
    openMode?: "global" | "current" | "new_tab";
}

export function WebAppIcon({
    app,
    onOpen,
    size = "default",
    showLabel = true,
    dragAttributes,
    dragListeners,
    movable = false,
    isDragging,
}: {
    app: WebAppItem;
    onOpen: (app: WebAppItem) => void;
    size?: "compact" | "default" | "large";
    showLabel?: boolean;
    dragAttributes?: object;
    dragListeners?: object;
    movable?: boolean;
    isDragging?: boolean;
}) {
    const [imageError, setImageError] = useState(false);

    let hostname: string;
    try {
        hostname = new URL(app.url).hostname;
    } catch {
        hostname = app.url;
    }

    const effectiveIconUrl = !imageError && (
        app.iconUrl ||
        (app.iconAssetId ? `/api/webapp-icons/${app.iconAssetId}` : null)
    );

    const firstChar = app.name.trim().slice(0, 1).toUpperCase() || "W";

    return (
        <Tooltip
            disabled={globalThis.matchMedia?.(
                "(pointer: coarse), (hover: none)",
            ).matches}
        >
            <TooltipTrigger
                render={
                    <button
                        type="button"
                        className={`webapp-icon webapp-icon--${size}${
                            isDragging ? " is-dragging" : ""
                        }`}
                        data-app-id={app.id}
                        onClick={() => onOpen(app)}
                        {...dragAttributes}
                        {...dragListeners}
                        aria-label={movable
                            ? `编辑 ${app.name}；拖动或按方向键排序`
                            : `打开 ${app.name}`}
                    >
                        <span className="webapp-glyph">
                            {effectiveIconUrl
                                ? (
                                    <img
                                        src={effectiveIconUrl}
                                        alt=""
                                        loading="lazy"
                                        onError={() => setImageError(true)}
                                    />
                                )
                                : <span>{firstChar}</span>}
                        </span>
                        {movable && (
                            <span
                                className="launcher-drag-cue"
                                aria-hidden="true"
                            >
                                <GripVertical size={14} />
                            </span>
                        )}
                        {showLabel && (
                            <span className="webapp-name">{app.name}</span>
                        )}
                        <ArrowUpRight
                            className="webapp-arrow"
                            size={13}
                            aria-hidden="true"
                        />
                    </button>
                }
            />
            <TooltipContent>{app.name} ({hostname})</TooltipContent>
        </Tooltip>
    );
}
