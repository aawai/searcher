import { assert, assertEquals } from "@std/assert";
import {
    buildBotanicalPalette,
    type ConcreteBotanicalSpecies,
    createBotanicalRuntimeState,
    generateBotanicalScene,
    renderBotanicalFrame,
    resolveBotanicalSpecies,
    resolveBotanicalViewport,
    resolveDiurnalWindScale,
    resolveSolarTerm,
    triggerBotanicalResonance,
} from "./botanical-engine.ts";

const SPECIES: readonly ConcreteBotanicalSpecies[] = [
    "orchid",
    "bamboo",
    "ginkgo",
    "maple",
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
        assert(
            echoBranch,
            `${species}: expected echo branch in embedded preview`,
        );
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

    const darkRoseOverPhoto = buildBotanicalPalette(
        true,
        "light-dark(#be123c, #fb7185)",
        "#f5f5f7",
        true,
    );
    const alphaOf = (s: string) => Number(s.match(/,([^,)]+)\)$/)?.[1] ?? "0");
    assert(
        alphaOf(darkRoseOverPhoto.stroke("ink")) <
            alphaOf(darkRose.stroke("ink")),
        "Expected Scene Harmony to soften ink alpha over photo wallpapers in dark mode",
    );
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
        font: "",
        textAlign: "center",
        textBaseline: "middle",
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
        fillText: (_text: string, x: number, y: number) => checkNums(x, y),
        setLineDash: () => {},
        createLinearGradient: (
            x0: number,
            y0: number,
            x1: number,
            y1: number,
        ) => {
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
            assert(
                r0 >= 0 && r1 > 0,
                `Invalid radial gradient radii: ${r0}, ${r1}`,
            );
            return mockGradient;
        },
    } as unknown as CanvasRenderingContext2D;

    return {
        ctx,
        assertFiniteCoords: () => {
            for (const n of coords) {
                assert(
                    Number.isFinite(n),
                    `Non-finite canvas coordinate: ${n}`,
                );
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

Deno.test("generateBotanicalScene (fern): uses minimalist 3-frond orchid-brush composition with folded leaves and feibai", () => {
    const desktop = generateBotanicalScene(
        "fern",
        1440,
        900,
        "2026-11-27",
        false,
    );
    const lowerBranches = desktop.branches.filter(
        (b) => b.points[0].y > 500,
    );
    assertEquals(
        lowerBranches.length,
        3,
        "Expected ghost, companion, and hero fronds in minimalist desktop fern scene",
    );

    for (let i = 1; i < lowerBranches.length; i++) {
        assert(
            lowerBranches[i].points[0].x < lowerBranches[i - 1].points[0].x,
            `Expected branch ${i} base to sit left of branch ${i - 1} base`,
        );
    }

    const fgTall = lowerBranches.filter((b) =>
        !b.ghost && b.points.length >= 40
    );
    assertEquals(fgTall.length, 2);
    const [companion, hero] = fgTall;
    assert(
        hero.points[hero.points.length - 1].x <
            companion.points[companion.points.length - 1].x - 180,
        "Expected wide breathing gap between companion and hero frond tips",
    );

    const fernPinnae = desktop.ornaments.filter(
        (o): o is Extract<typeof o, { kind: "fernPinna" }> =>
            o.kind === "fernPinna",
    );
    assert(
        fernPinnae.length >= 30 && fernPinnae.length <= 50,
        `Expected restrained pinna count (30..50), got ${fernPinnae.length}`,
    );
    for (const p of fernPinnae) {
        assert(
            p.width / p.len <= 0.14,
            `Expected slender orchid-brush pinna ratio, got ${p.width / p.len}`,
        );
    }
    assert(
        fernPinnae.some((p) => p.profile),
        "Expected 3D folded (profile) fern pinnae",
    );
    assert(
        fernPinnae.some((p) => p.feibai),
        "Expected dry-brush feibai fern pinnae",
    );
});

Deno.test("generateBotanicalScene: attaches visitorAnchor and rewardAnchor only for non-embedded scenes", () => {
    for (const species of SPECIES) {
        const desktop = generateBotanicalScene(
            species,
            1440,
            900,
            "2026-11-27",
            false,
        );
        assert(
            desktop.visitorAnchor !== null,
            `${species}: expected visitorAnchor for non-embedded scene`,
        );
        assert(
            desktop.rewardAnchor !== null,
            `${species}: expected rewardAnchor for non-embedded scene`,
        );

        const embedded = generateBotanicalScene(
            species,
            1440,
            810,
            "2026-11-27",
            true,
        );
        assertEquals(embedded.visitorAnchor, null);
        assertEquals(embedded.rewardAnchor, null);
    }
});

Deno.test("renderBotanicalFrame: renders micro-ecology visitors in light and dark modes with valid coords", () => {
    for (const species of SPECIES) {
        const scene = generateBotanicalScene(
            species,
            1440,
            900,
            "2026-11-27",
            false,
        );
        for (const isDark of [false, true]) {
            for (const reducedMotion of [false, true]) {
                const runtime = createBotanicalRuntimeState();
                const palette = buildBotanicalPalette(
                    isDark,
                    "#be123c",
                    isDark ? "#f5f5f7" : "#1d1d1f",
                );
                const { ctx, assertFiniteCoords } = createMockCanvasContext();
                renderBotanicalFrame({
                    ctx,
                    scene,
                    width: 1440,
                    height: 900,
                    timeSec: 15,
                    dt: 0.016,
                    rawProgress: 1,
                    reducedMotion,
                    windCalm: 1,
                    searchFocused: false,
                    embedded: false,
                    palette,
                    pointer: {
                        x: 1120,
                        y: 640,
                        vx: 320,
                        vy: -40,
                        lastT: 100,
                        lastRustleSpawn: 0,
                    },
                    drifters: [],
                    lastDriftSpawn: 0,
                    frameSeq: 1,
                    runtime,
                });
                assertFiniteCoords();
            }
        }
    }
});

Deno.test("triggerBotanicalResonance: handles theme-ripple, quick-capture, and tasks-cleared cleanly", () => {
    for (const species of SPECIES) {
        const scene = generateBotanicalScene(
            species,
            1440,
            900,
            "2026-11-27",
            false,
        );
        const palette = buildBotanicalPalette(false, "#be123c", "#1d1d1f");
        const runtime = createBotanicalRuntimeState();
        const drifters: Parameters<typeof renderBotanicalFrame>[0]["drifters"] =
            [];

        // 1. theme-ripple at exact t=0 must have 0 impulse displacement, then wave at t+0.3
        triggerBotanicalResonance(
            runtime,
            "theme-ripple",
            10,
            scene,
            drifters,
            1,
            1,
        );
        const { ctx: ctx0, assertFiniteCoords: check0 } =
            createMockCanvasContext();
        renderBotanicalFrame({
            ctx: ctx0,
            scene,
            width: 1440,
            height: 900,
            timeSec: 10,
            dt: 0.016,
            rawProgress: 1,
            reducedMotion: false,
            windCalm: 1,
            searchFocused: false,
            embedded: false,
            palette,
            pointer: {
                x: -9999,
                y: -9999,
                vx: 0,
                vy: 0,
                lastT: 0,
                lastRustleSpawn: 0,
            },
            drifters,
            lastDriftSpawn: 0,
            frameSeq: 1,
            runtime,
        });
        check0();

        const { ctx: ctx1, assertFiniteCoords: check1 } =
            createMockCanvasContext();
        renderBotanicalFrame({
            ctx: ctx1,
            scene,
            width: 1440,
            height: 900,
            timeSec: 10.3,
            dt: 0.016,
            rawProgress: 1,
            reducedMotion: false,
            windCalm: 1,
            searchFocused: false,
            embedded: false,
            palette,
            pointer: {
                x: -9999,
                y: -9999,
                vx: 0,
                vy: 0,
                lastT: 0,
                lastRustleSpawn: 0,
            },
            drifters,
            lastDriftSpawn: 0,
            frameSeq: 2,
            runtime,
        });
        check1();

        // 2. quick-capture spawns accent/sub drifter even when searchFocused is true
        triggerBotanicalResonance(
            runtime,
            "quick-capture",
            12,
            scene,
            drifters,
            0.14,
            3,
        );
        assert(
            drifters.length >= 1,
            `${species}: expected quick-capture to spawn a drifter`,
        );

        // 3. tasks-cleared awakens the scene and renders reward blossom/shoot
        triggerBotanicalResonance(
            runtime,
            "tasks-cleared",
            14,
            scene,
            drifters,
            1,
            4,
        );
        assertEquals(runtime.awakened, true);
        const { ctx: ctx2, assertFiniteCoords: check2 } =
            createMockCanvasContext();
        renderBotanicalFrame({
            ctx: ctx2,
            scene,
            width: 1440,
            height: 900,
            timeSec: 15.2,
            dt: 0.016,
            rawProgress: 1,
            reducedMotion: false,
            windCalm: 1,
            searchFocused: true,
            embedded: false,
            palette,
            pointer: {
                x: -9999,
                y: -9999,
                vx: 0,
                vy: 0,
                lastT: 0,
                lastRustleSpawn: 0,
            },
            drifters,
            lastDriftSpawn: 0,
            frameSeq: 5,
            runtime,
        });
        check2();
    }
});

Deno.test("resolveSolarTerm & resolveBotanicalSpecies: selects seasonal pool and snow season accurately", () => {
    const xiaxue = resolveSolarTerm("2026-11-27");
    assertEquals(xiaxue.term, "小雪");
    assertEquals(xiaxue.season, "winter");
    assertEquals(xiaxue.isSnowSeason, true);

    const springTerm = resolveSolarTerm("2026-04-06");
    assertEquals(springTerm.season, "spring");
    assertEquals(springTerm.isSnowSeason, false);
    assert(
        ["orchid", "fern", "eucalyptus"].includes(
            resolveBotanicalSpecies("auto", "2026-04-06"),
        ),
    );

    const summerTerm = resolveSolarTerm("2026-07-10");
    assertEquals(summerTerm.season, "summer");
    assert(
        ["bamboo", "fern", "eucalyptus"].includes(
            resolveBotanicalSpecies("auto", "2026-07-10"),
        ),
    );

    const autumnTerm = resolveSolarTerm("2026-10-12");
    assertEquals(autumnTerm.season, "autumn");
    assert(
        ["ginkgo", "maple", "bamboo"].includes(
            resolveBotanicalSpecies("auto", "2026-10-12"),
        ),
    );

    assert(
        ["plum", "bamboo", "eucalyptus"].includes(
            resolveBotanicalSpecies("auto", "2026-11-27"),
        ),
    );
});

Deno.test("buildBotanicalPalette & resolveDiurnalWindScale: supports dawn/day/dusk/night safely", () => {
    for (const hour of [6, 12, 18, 23]) {
        const pal = buildBotanicalPalette(
            false,
            "#be123c",
            "#1d1d1f",
            false,
            hour,
        );
        assert(/^rgba\(\d+,\d+,\d+,\d+\.\d+\)$/.test(pal.stroke("ink")));
        assert(/^rgba\(\d+,\d+,\d+,\d+\.\d+\)$/.test(pal.wash("sub")));
        const scale = resolveDiurnalWindScale(hour);
        assert(scale > 0 && scale <= 1);
    }
    assert(resolveDiurnalWindScale(23) < resolveDiurnalWindScale(12));
});

Deno.test("renderBotanicalFrame: supports left-mirrored layout, snow cushions, solar term seal, and search-submit", () => {
    for (const species of SPECIES) {
        const scene = generateBotanicalScene(
            species,
            1440,
            900,
            "2026-11-27",
            false,
        );
        const runtime = createBotanicalRuntimeState();
        const drifters: Parameters<typeof renderBotanicalFrame>[0]["drifters"] =
            [];
        triggerBotanicalResonance(
            runtime,
            "search-submit",
            10,
            scene,
            drifters,
            1,
            1,
        );
        const palette = buildBotanicalPalette(
            false,
            "#be123c",
            "#1d1d1f",
            false,
            18,
        );
        const { ctx, assertFiniteCoords } = createMockCanvasContext();
        renderBotanicalFrame({
            ctx,
            scene,
            width: 1440,
            height: 900,
            timeSec: 10.4,
            dt: 0.016,
            rawProgress: 1,
            reducedMotion: false,
            windCalm: 1,
            searchFocused: false,
            embedded: false,
            palette,
            pointer: {
                x: 240,
                y: 620,
                vx: 160,
                vy: -20,
                lastT: 100,
                lastRustleSpawn: 0,
            },
            drifters,
            lastDriftSpawn: 0,
            frameSeq: 1,
            runtime,
            sceneSide: "left",
            dateKey: "2026-11-27",
            localHour: 18,
        });
        assertFiniteCoords();
    }
});
