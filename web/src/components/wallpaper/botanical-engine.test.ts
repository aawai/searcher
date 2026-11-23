import { assert, assertEquals } from "@std/assert";
import {
    buildBotanicalPalette,
    type ConcreteBotanicalSpecies,
    generateBotanicalScene,
    renderBotanicalFrame,
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

Deno.test("buildBotanicalPalette: emits valid rgba strings for all roles in light and dark modes", () => {
    for (const isDark of [false, true]) {
        const pal = buildBotanicalPalette(isDark, "#3b82f6", "rgb(28, 30, 34)");
        assertEquals(pal.isDark, isDark);
        const samples = [
            pal.stroke("ink"),
            pal.stroke("accent", 0.5),
            pal.stroke("sub", 0.8),
            pal.vein("ink"),
            pal.fill("accent"),
            pal.wash("accent"),
            pal.wash("sub"),
            pal.wash("ink"),
            pal.highlight(),
        ];
        for (const s of samples) {
            assert(
                /^rgba\(\d+,\d+,\d+,\d+\.\d+\)$/.test(s),
                `Invalid rgba output: ${s}`,
            );
            assert(!s.includes("NaN"), `Unexpected NaN in ${s}`);
        }
    }

    const parseRgba = (s: string) => {
        const m = s.match(/^rgba\((\d+),(\d+),(\d+),/);
        assert(m, `Expected rgba string: ${s}`);
        return [Number(m[1]), Number(m[2]), Number(m[3])] as const;
    };

    const lightRose = buildBotanicalPalette(
        false,
        "light-dark(#be123c, #fb7185)",
        "#1d1d1f",
    );
    const [lr, , lb] = parseRgba(lightRose.stroke("accent"));
    assert(lr > lb, `Expected light rose r (${lr}) > b (${lb})`);

    const darkRose = buildBotanicalPalette(
        true,
        "light-dark(#be123c, #fb7185)",
        "#f5f5f7",
    );
    const [dr, , db] = parseRgba(darkRose.stroke("accent"));
    assert(dr > db, `Expected dark rose r (${dr}) > b (${db})`);
});

function createMockCanvasContext(): {
    ctx: CanvasRenderingContext2D;
    assertFiniteCoords: () => void;
} {
    const coords: number[] = [];
    const checkNums = (...nums: number[]) => {
        for (const n of nums) coords.push(n);
    };
    const mockGradient = {
        addColorStop: (_offset: number, _color: string) => {},
    } as unknown as CanvasGradient;

    const ctx = {
        fillStyle: "",
        strokeStyle: "",
        lineWidth: 1,
        lineCap: "butt",
        lineJoin: "miter",
        globalCompositeOperation: "source-over",
        save: () => {},
        restore: () => {},
        translate: (x: number, y: number) => checkNums(x, y),
        rotate: (a: number) => checkNums(a),
        scale: (x: number, y: number) => checkNums(x, y),
        clearRect: (x: number, y: number, w: number, h: number) =>
            checkNums(x, y, w, h),
        beginPath: () => {},
        closePath: () => {},
        moveTo: (x: number, y: number) => checkNums(x, y),
        lineTo: (x: number, y: number) => checkNums(x, y),
        quadraticCurveTo: (cx: number, cy: number, x: number, y: number) =>
            checkNums(cx, cy, x, y),
        bezierCurveTo: (
            c1x: number,
            c1y: number,
            c2x: number,
            c2y: number,
            x: number,
            y: number,
        ) => checkNums(c1x, c1y, c2x, c2y, x, y),
        arc: (x: number, y: number, r: number, s: number, e: number) =>
            checkNums(x, y, r, s, e),
        ellipse: (
            x: number,
            y: number,
            rx: number,
            ry: number,
            rot: number,
            s: number,
            e: number,
        ) => checkNums(x, y, rx, ry, rot, s, e),
        fill: () => {},
        stroke: () => {},
        setLineDash: () => {},
        createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => {
            checkNums(x0, y0, x1, y1);
            return mockGradient;
        },
        createRadialGradient: (
            x0: number,
            y0: number,
            r0: number,
            x1: number,
            y1: number,
            r1: number,
        ) => {
            checkNums(x0, y0, r0, x1, y1, r1);
            assert(r0 >= 0 && r1 > 0, `Invalid radial gradient radii: ${r0}, ${r1}`);
            return mockGradient;
        },
    } as unknown as CanvasRenderingContext2D;

    return {
        ctx,
        assertFiniteCoords: () => {
            for (const n of coords) {
                assert(Number.isFinite(n), `Non-finite canvas coordinate: ${n}`);
            }
        },
    };
}

Deno.test("renderBotanicalFrame: renders all species across progress and embedded states cleanly", () => {
    const scenarios = [
        { reducedMotion: true, rawProgress: 1, embedded: false },
        { reducedMotion: false, rawProgress: 0.5, embedded: false },
        { reducedMotion: false, rawProgress: 1, embedded: false },
        { reducedMotion: true, rawProgress: 1, embedded: true },
    ];
    for (const species of SPECIES) {
        const palette = buildBotanicalPalette(false, "#0a66c2", "#1c1e22");
        const scene = generateBotanicalScene(
            species,
            1440,
            900,
            "2026-11-23",
            false,
        );
        for (const [idx, s] of scenarios.entries()) {
            const { ctx, assertFiniteCoords } = createMockCanvasContext();
            renderBotanicalFrame({
                ctx,
                scene,
                width: 1440,
                height: 900,
                timeSec: 12.5,
                dt: 0.016,
                rawProgress: s.rawProgress,
                reducedMotion: s.reducedMotion,
                windCalm: 1,
                searchFocused: false,
                embedded: s.embedded,
                palette,
                pointer: {
                    x: 1100,
                    y: 700,
                    vx: 100,
                    vy: -20,
                    lastT: 100,
                    lastRustleSpawn: 0,
                },
                drifters: [],
                lastDriftSpawn: 0,
                frameSeq: idx + 1,
            });
            assertFiniteCoords();
        }
    }
});
