import { Search } from "lucide-react";

/**
 * Static simulation of the home search bar over the wallpaper stage.
 * Strictly non-interactive, aria-hidden, pointer-events: none.
 * Purpose: assess wallpaper readability against the search surface.
 */
export function WallpaperStageContextPreview() {
    return (
        <div
            className="wallpaper-stage-context-preview"
            aria-hidden="true"
        >
            <div className="wallpaper-stage-context-preview__search-bar">
                <Search size="1em" className="icon-md" />
                <span className="wallpaper-stage-context-preview__placeholder">
                    搜索你想知道的…
                </span>
            </div>
        </div>
    );
}
