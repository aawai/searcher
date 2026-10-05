import { assert } from "@std/assert";
import ReactDOMServer from "react-dom/server";
import { WallpaperStageContextPreview } from "./WallpaperStageContextPreview.tsx";

Deno.test("WallpaperStageContextPreview: strictly non-interactive and aria-hidden presentation", () => {
    const html = ReactDOMServer.renderToString(
        <WallpaperStageContextPreview />,
    );

    assert(html.includes('class="wallpaper-stage-context-preview"'));
    assert(html.includes('aria-hidden="true"'));
    assert(!html.includes("<form"));
    assert(!html.includes("<input"));
    assert(!html.includes('role="search"'));
    assert(!html.includes("id="));
});
