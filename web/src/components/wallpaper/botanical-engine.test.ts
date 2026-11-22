import { assert, assertEquals } from "@std/assert";
import {
    type ConcreteBotanicalSpecies,
    generateBotanicalScene,
    resolveBotanicalViewport,
} from "./botanical-engine.ts";

const SPECIES: readonly ConcreteBotanicalSpecies[] = [
    "ginkgo",
    "eucalyptus",
    "plum",
    "fern",
];

Deno.test("resolveBotanicalViewport: maps embedded previews to 1440px virtual width", () => {
    assertEquals(resolveBotanicalViewport(390, 844, false), {
        sceneWidth: 390,
        sceneHeight: 844,
        renderScale: 1,
    });

    const embedded = resolveBotanicalViewport(440, 247.5, true);
    assertEquals(embedded.sceneWidth, 1440);
    assertEquals(embedded.sceneHeight, 810);
    assert(Math.abs(embedded.renderScale - 440 / 1440) < 1e-6);
});

Deno.test("generateBotanicalScene: mobile (390x844) keeps upper-right echo and clears search/dock", () => {
    for (const species of SPECIES) {
        const scene = generateBotanicalScene(
            species,
            390,
            844,
            "2026-11-22",
            false,
        );

        const echoBranch = scene.branches.find((b) =>
            b.ghost && b.points.some((p) => p.y < 290)
        );
        assert(echoBranch, `${species}: expected upper-right echo branch`);
        for (const p of echoBranch.points) {
            assert(
                p.x > 180 && p.y < 290,
                `${species}: echo branch (${p.x}, ${p.y}) escaped upper-right zone`,
            );
        }

        const lowerBranches = scene.branches.filter((b) => b !== echoBranch);
        assert(
            lowerBranches.length >= 2,
            `${species}: expected at least 2 lower branches for depth`,
        );

        for (const b of lowerBranches) {
            for (const p of b.points) {
                assert(
                    p.x >= 20,
                    `${species}: lower branch clipped near left edge at x=${p.x}`,
                );
                assert(
                    p.y >= 455,
                    `${species}: lower branch intruded into search zone at y=${p.y}`,
                );
                if (p.x < 370) {
                    assert(
                        p.y <= 775,
                        `${species}: lower branch pierced dock zone at (${p.x}, ${p.y})`,
                    );
                }
            }
        }
    }
});

Deno.test("generateBotanicalScene: embedded 16:9 preview preserves top-right echo without top clipping", () => {
    const viewport = resolveBotanicalViewport(440, 247.5, true);
    for (const species of SPECIES) {
        const scene = generateBotanicalScene(
            species,
            viewport.sceneWidth,
            viewport.sceneHeight,
            "2026-11-22",
            true,
        );
        const echoBranch = scene.branches.find((b) =>
            b.ghost && b.points.some((p) => p.y < 260)
        );
        assert(echoBranch, `${species}: expected echo branch in embedded preview`);
        for (const b of scene.branches) {
            for (const p of b.points) {
                assert(
                    p.y >= 40,
                    `${species}: embedded branch clipped top edge at y=${p.y}`,
                );
            }
        }
    }
});
