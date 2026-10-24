import { GripVertical } from "lucide-react";
import { useState } from "react";
import { iconFallback } from "./iconFallback.ts";

import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip.tsx";
export interface WebAppItem {
    id: string;
    name: string;
    url: string;
    iconUrl?: string | null;
    iconAssetId?: string | null;
    iconSource?: "website" | "upload" | "url" | "ai" | "default";
    groupId?: string | null;
    isHomeFixed?: boolean;
    openMode?: "global" | "current" | "new_tab";
}

export function WebAppGlyph({ app, className = "" }: {
    app: Pick<WebAppItem, "name" | "url" | "iconUrl" | "iconAssetId">;
    className?: string;
}) {
    const source = app.iconUrl ||
        (app.iconAssetId ? `/api/webapp-icons/${app.iconAssetId}` : null);
    const [failedSource, setFailedSource] = useState<string | null>(null);
    const effective = source !== failedSource ? source : null;
    return (
        <span
            className={`webapp-glyph ${className}`}
            style={effective ? undefined : iconFallback(app.url)}
            aria-hidden="true"
        >
            {effective
                ? (
                    <img
                        src={effective}
                        alt=""
                        loading="lazy"
                        onError={() => setFailedSource(source)}
                    />
                )
                : <span>{Array.from(app.name.trim())[0] || "W"}</span>}
        </span>
    );
}

export function WebAppIcon({
    app,
    onOpen,
    dragAttributes,
    dragListeners,
    movable = false,
    isDragging,
    showLabel = true,
}: {
    app: WebAppItem;
    onOpen: (app: WebAppItem) => void;
    dragAttributes?: object;
    dragListeners?: object;
    movable?: boolean;
    isDragging?: boolean;
    showLabel?: boolean;
}) {
    let hostname: string;
    try {
        hostname = new URL(app.url).hostname;
    } catch {
        hostname = app.url;
    }

    return (
        <Tooltip
            disabled={globalThis.matchMedia?.(
                "(any-pointer: coarse)",
            ).matches}
        >
            <TooltipTrigger
                render={
                    <button
                        type="button"
                        className={`webapp-icon${
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
                        <WebAppGlyph app={app} />
                        {movable && (
                            <span
                                className="launcher-drag-cue"
                                aria-hidden="true"
                            >
                                <GripVertical size="1em" className="icon-sm" />
                            </span>
                        )}
                        {showLabel && (
                            <span className="webapp-name">{app.name}</span>
                        )}
                    </button>
                }
            />
            <TooltipContent>{app.name} ({hostname})</TooltipContent>
        </Tooltip>
    );
}
