import { Search } from "lucide-react";

/**
 * Static presentation simulation of Searcher search context for Wallpaper Stage.
 * Strictly non-interactive, aria-hidden, pointer-events: none.
 * Purpose: Assess wallpaper readability against search typography and frame.
 */
export function WallpaperStageContextPreview() {
    return (
        <div
            className="wallpaper-stage-context-preview"
            aria-hidden="true"
        >
            <div className="wallpaper-stage-context-preview__card">
                <span className="wallpaper-stage-context-preview__brand">
                    Searcher
                </span>
                <div className="wallpaper-stage-context-preview__search-bar">
                    <div className="wallpaper-stage-context-preview__icon">
                        <Search size={14} />
                    </div>
                    <span className="wallpaper-stage-context-preview__placeholder">
                        搜索你想知道的…
                    </span>
                    <span className="wallpaper-stage-context-preview__keycap">
                        /
                    </span>
                </div>
            </div>
        </div>
    );
}
