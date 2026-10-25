import { assert, assertEquals } from "@std/assert";
import type { Locator } from "playwright";

/** Shared home/popup contract: a square frames two rows of icon outer edges. */
export async function assertLargeFolderGeometry(
    tile: Locator,
    labels: boolean,
) {
    const metrics = await tile.evaluate((node) => {
        const grid = node.closest(".launcher-grid")!;
        const style = getComputedStyle(grid);
        const cell = parseFloat(style.getPropertyValue("--launcher-col-w"));
        const gap = parseFloat(style.getPropertyValue("--launcher-gap-x"));
        const icon = parseFloat(style.getPropertyValue("--launcher-icon"));
        // The token may be a calc(); a rendered app reports it in px.
        const app = grid.querySelector(".webapp-icon");
        const pad = app
            ? parseFloat(getComputedStyle(app).paddingTop)
            : parseFloat(style.getPropertyValue("--launcher-pad-t"));
        const outer = node.getBoundingClientRect();
        const surface = node.querySelector(".launcher-folder-surface")!
            .getBoundingClientRect();
        const preview = getComputedStyle(
            node.querySelector(".launcher-folder-preview")!,
        );
        const name = node.querySelector(".launcher-folder-name");
        const neighbor = [...grid.querySelectorAll(".launcher-app")].find((
            app,
        ) => Math.abs(
            app.getBoundingClientRect().top - outer.top - cell - gap,
        ) <= 1);
        const neighborName = neighbor?.querySelector(".webapp-name");
        // The library grid places tiles directly; home wraps them in .launcher-tile.
        const sameRowGlyph = [...grid.querySelectorAll(".launcher-app")]
            .find((app) =>
                Math.abs(app.getBoundingClientRect().top - outer.top) <= 1
            )?.querySelector(".webapp-glyph");
        return {
            squareError: Math.abs(surface.width - surface.height),
            sizeError: Math.abs(surface.width - cell - gap - icon),
            leftError: Math.abs(surface.left - outer.left - (cell - icon) / 2),
            rightError: Math.abs(
                surface.right - outer.left - (cell + gap + (cell + icon) / 2),
            ),
            topError: Math.abs(surface.top - outer.top - pad),
            // Without names the surface is centred in its 2x2 footprint, so it
            // frames the centred glyphs of both rows.
            verticalCentreError: Math.abs(
                (surface.top - outer.top) - (outer.bottom - surface.bottom),
            ),
            neighborTopError: sameRowGlyph
                ? Math.abs(
                    surface.top - sameRowGlyph.getBoundingClientRect().top,
                )
                : null,
            nameVisible: Boolean(name && name.getBoundingClientRect().height),
            baselineError: name && neighborName
                ? Math.abs(
                    name.getBoundingClientRect().bottom -
                        neighborName.getBoundingClientRect().bottom,
                )
                : null,
            columns: preview.gridTemplateColumns.split(" ").length,
            rows: preview.gridTemplateRows.split(" ").length,
            clipped: [...node.querySelectorAll(".launcher-folder-mini-glyph")]
                .some((glyph) => {
                    const box = glyph.getBoundingClientRect();
                    return box.left < surface.left ||
                        box.right > surface.right || box.top < surface.top ||
                        box.bottom > surface.bottom;
                }),
        };
    });
    for (
        const error of [
            metrics.squareError,
            metrics.sizeError,
            metrics.leftError,
            metrics.rightError,
            metrics.topError,
        ]
    ) {
        assert(
            error <= 1,
            `Folder edges must align within 1px: ${JSON.stringify(metrics)}`,
        );
    }
    if (metrics.neighborTopError !== null) {
        assert(metrics.neighborTopError <= 1);
    }
    if (!labels) {
        assert(
            metrics.verticalCentreError <= 1,
            `Unnamed folder centres in its footprint: ${
                JSON.stringify(metrics)
            }`,
        );
    }
    assertEquals(metrics.nameVisible, labels);
    if (labels && metrics.baselineError !== null) {
        assert(metrics.baselineError <= 1, "Row-two name baselines align");
    }
    assertEquals([metrics.columns, metrics.rows], [3, 3]);
    assertEquals(metrics.clipped, false);
}
