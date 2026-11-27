import { assert, assertEquals } from "@std/assert";
import {
    buildBotanicalPalette,
    type ConcreteBotanicalSpecies,
    createBotanicalRuntimeState,
    generateBotanicalScene,
    hasSealVectorGlyph,
    isBotanicalSceneActive,
    nextBotanicalWakeDelayMs,
    renderBotanicalFrame,
    resolveBotanicalSpecies,
    resolveBotanicalViewport,
    resolveDiurnalWindScale,
    resolveSolarTerm,
    SOLAR_TERMS_BY_MMDD,
    triggerBotanicalGust,
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

Deno.test("botanical evolution: OKLCH palette, non-destructive feibai, edge-breaking bamboo, and idle sleep", () => {
    const pal = buildBotanicalPalette(
        false,
        "oklch(0.54 0.16 25)",
        "#1d1d1f",
    );
    assert(/^rgba\(\d+,\d+,\d+,\d+\.\d+\)$/.test(pal.waterline("accent")));
    assert(/^rgba\(\d+,\d+,\d+,\d+\.\d+\)$/.test(pal.inkGrade("jiao")));
    assert(/^rgba\(\d+,\d+,\d+,\d+\.\d+\)$/.test(pal.inkGrade("qing")));

    // Wide non-embedded bamboo breaks boldly out of the top edge
    const wideBamboo = generateBotanicalScene(
        "bamboo",
        1440,
        900,
        "2026-06-21",
        false,
    );
    assert(
        wideBamboo.branches.some((b) => b.points.some((p) => p.y < 0)),
        "Expected wide desktop bamboo culm to pierce top viewport edge",
    );

    // Orchid carries slope rock base
    const wideOrchid = generateBotanicalScene(
        "orchid",
        1440,
        900,
        "2026-04-05",
        false,
    );
    assert(wideOrchid.rocks.length >= 1, "Expected slope rock base for orchid");

    // Branch feibai must not use destination-out on main canvas
    const ops: string[] = [];
    const { ctx } = createMockCanvasContext();
    const origDesc = Object.getOwnPropertyDescriptor(
        ctx,
        "globalCompositeOperation",
    );
    let gco = "source-over";
    Object.defineProperty(ctx, "globalCompositeOperation", {
        get: () => gco,
        set: (v: string) => {
            gco = v;
            ops.push(v);
        },
        configurable: true,
    });
    const plum = generateBotanicalScene("plum", 1440, 900, "2026-12-22", false);
    renderBotanicalFrame({
        ctx,
        scene: plum,
        width: 1440,
        height: 900,
        timeSec: 12,
        dt: 0.016,
        rawProgress: 1,
        reducedMotion: true,
        windCalm: 1,
        searchFocused: false,
        embedded: false,
        palette: pal,
        pointer: {
            x: -9999,
            y: -9999,
            vx: 0,
            vy: 0,
            lastT: 0,
            lastRustleSpawn: 0,
        },
        drifters: [],
        lastDriftSpawn: 0,
        frameSeq: 1,
    });
    if (origDesc) {
        Object.defineProperty(ctx, "globalCompositeOperation", origDesc);
    }
    assert(
        !ops.includes("destination-out"),
        "Branch feibai must not use destination-out on main canvas",
    );

    // Idle sleep & gust wakeup
    const runtime = createBotanicalRuntimeState();
    assertEquals(
        isBotanicalSceneActive({
            runtime,
            rawProgress: 1,
            timeSec: 10,
            scene: plum,
            drifters: [],
            reducedMotion: false,
            embedded: false,
        }),
        false,
    );
    triggerBotanicalGust(runtime, 10, 0.85, 4.6);
    assertEquals(
        isBotanicalSceneActive({
            runtime,
            rawProgress: 1,
            timeSec: 11,
            scene: plum,
            drifters: [],
            reducedMotion: false,
            embedded: false,
        }),
        true,
    );
    assert(nextBotanicalWakeDelayMs(runtime, 15) >= 250);

    // Ginkgo phenology: Frost (霜降) has significantly more golden accent/sub leaves than early summer
    const ginkgoFrost = generateBotanicalScene(
        "ginkgo",
        1440,
        900,
        "2026-10-25",
        false,
    );
    const ginkgoSummer = generateBotanicalScene(
        "ginkgo",
        1440,
        900,
        "2026-05-10",
        false,
    );
    const goldCount = (s: typeof ginkgoFrost) =>
        s.ornaments.filter((o) =>
            !o.ghost && (o.tint === "accent" || o.tint === "sub")
        ).length;
    assert(
        goldCount(ginkgoFrost) > goldCount(ginkgoSummer),
        `Expected Frost ginkgo golden leaves (${
            goldCount(ginkgoFrost)
        }) > Summer (${goldCount(ginkgoSummer)})`,
    );

    // Plum phenology: 立春 has higher open-blossom share than 冬至
    const plumSpring = generateBotanicalScene(
        "plum",
        1440,
        900,
        "2026-02-06",
        false,
    );
    const plumWinter = generateBotanicalScene(
        "plum",
        1440,
        900,
        "2026-12-22",
        false,
    );
    const blossomCount = (s: typeof plumSpring) =>
        s.ornaments.filter((o) => !o.ghost && o.kind === "plumBlossom").length;
    assert(
        blossomCount(plumSpring) > blossomCount(plumWinter),
        `Expected 立春 plum blossoms (${blossomCount(plumSpring)}) > 冬至 (${
            blossomCount(plumWinter)
        })`,
    );

    // Fern & Orchid include slope rocks on wide desktop
    const wideFern = generateBotanicalScene(
        "fern",
        1440,
        900,
        "2026-07-10",
        false,
    );
    assert(
        wideFern.rocks.length >= 1,
        "Expected slope rock base for wide fern",
    );

    // Rendering with dockInsets emits valid finite coordinates
    const { ctx: dockCtx, assertFiniteCoords: assertDockCoords } =
        createMockCanvasContext();
    renderBotanicalFrame({
        ctx: dockCtx,
        scene: plumSpring,
        width: 1440,
        height: 900,
        timeSec: 14,
        dt: 0.016,
        rawProgress: 1,
        reducedMotion: true,
        windCalm: 1,
        searchFocused: false,
        embedded: false,
        palette: pal,
        pointer: {
            x: -9999,
            y: -9999,
            vx: 0,
            vy: 0,
            lastT: 0,
            lastRustleSpawn: 0,
        },
        drifters: [],
        lastDriftSpawn: 0,
        frameSeq: 2,
        dockInsets: { top: 0, right: 64, bottom: 56, left: 0 },
    });
    assertDockCoords();
});

Deno.test("museum pass: 24 solar-term vector seals, zero dashed lines, cinnabar/goldDust, and trunk weight", () => {
    const palLight = buildBotanicalPalette(false, "#be123c", "#1d1d1f");
    const palDark = buildBotanicalPalette(true, "#fb7185", "#f5f5f7");
    for (
        const s of [
            palLight.cinnabar(),
            palLight.goldDust(),
            palDark.cinnabar(),
            palDark.goldDust(),
        ]
    ) {
        assert(/^rgba\(\d+,\d+,\d+,\d+\.\d+\)$/.test(s), `Invalid rgba: ${s}`);
    }

    // 全部 24 节气均具备手工矢量小篆字模
    for (const entry of SOLAR_TERMS_BY_MMDD) {
        assert(
            hasSealVectorGlyph(entry.term),
            `Expected vector seal glyph for solar term ${entry.term}`,
        );
    }

    // 桌面端寒梅、红枫、银杏主干具备苍劲量感且末梢收细
    for (const sp of ["plum", "maple", "ginkgo"] as const) {
        const scene = generateBotanicalScene(
            sp,
            1440,
            900,
            "2026-04-05",
            false,
        );
        const hero = scene.branches.find((b) => !b.ghost && !b.parentRef);
        assert(hero, `${sp}: expected hero trunk`);
        assert(
            hero.widthStart >= 6 * scene.scale,
            `${sp}: expected calligraphic trunk widthStart >= 6*S, got ${hero.widthStart}`,
        );
        const minTip = Math.min(...scene.branches.map((b) => b.widthEnd));
        assert(
            minTip <= 0.75 * scene.scale,
            `${sp}: expected fine twig widthEnd <= 0.75*S, got ${minTip}`,
        );
    }

    // 完整渲染帧期间零 fillText、零非空虚线 setLineDash（覆盖春夏朱文与秋冬白文）
    for (const dateKey of ["2026-04-05", "2026-11-22"]) {
        for (const isDark of [false, true]) {
            const pal = buildBotanicalPalette(
                isDark,
                "#be123c",
                isDark ? "#f5f5f7" : "#1d1d1f",
            );
            const scene = generateBotanicalScene(
                "plum",
                1440,
                900,
                dateKey,
                false,
            );
            const { ctx, assertFiniteCoords } = createMockCanvasContext();
            let fillTextCalls = 0;
            let nonEmptyDashCalls = 0;
            ctx.fillText = () => {
                fillTextCalls++;
            };
            ctx.setLineDash = (segs: number[]) => {
                if (segs.length > 0) nonEmptyDashCalls++;
            };
            renderBotanicalFrame({
                ctx,
                scene,
                width: 1440,
                height: 900,
                timeSec: 12,
                dt: 0.016,
                rawProgress: 1,
                reducedMotion: true,
                windCalm: 1,
                searchFocused: false,
                embedded: false,
                palette: pal,
                pointer: {
                    x: -9999,
                    y: -9999,
                    vx: 0,
                    vy: 0,
                    lastT: 0,
                    lastRustleSpawn: 0,
                },
                drifters: [],
                lastDriftSpawn: 0,
                frameSeq: 1,
                dateKey,
            });
            assertFiniteCoords();
            assertEquals(
                fillTextCalls,
                0,
                `${dateKey} (dark=${isDark}): seal must render vector glyphs without fillText`,
            );
            assertEquals(
                nonEmptyDashCalls,
                0,
                `${dateKey} (dark=${isDark}): finished frame must not use dashed strokes`,
            );
        }
    }
});

Deno.test("museum polish: intrinsic species color harmony, maple search clearance, and staggered bamboo leaves", () => {
    const parseRgb = (s: string) => {
        const m = s.match(/^rgba\((\d+),(\d+),(\d+),/);
        assert(m, `Expected rgba string: ${s}`);
        return [Number(m[1]), Number(m[2]), Number(m[3])] as const;
    };

    // 1. 植物博物本色基因融合：在玫瑰红强调色下，银杏呈暖金黄、尤加利呈冷翠绿、寒梅保持绯红
    const ginkgoPal = buildBotanicalPalette(
        false,
        "#be123c",
        "#1d1d1f",
        false,
        12,
        "ginkgo",
    );
    const [gr, gg, gb] = parseRgb(ginkgoPal.stroke("accent"));
    assert(
        gr > gb && gg > gb * 1.25,
        `Expected golden ginkgo accent under rose theme, got (${gr},${gg},${gb})`,
    );

    const eucPal = buildBotanicalPalette(
        false,
        "#be123c",
        "#1d1d1f",
        false,
        12,
        "eucalyptus",
    );
    const [er, eg, eb] = parseRgb(eucPal.stroke("accent"));
    assert(
        eg > er,
        `Expected cool celadon eucalyptus accent (g > r) under rose theme, got (${er},${eg},${eb})`,
    );

    const plumPal = buildBotanicalPalette(
        false,
        "#be123c",
        "#1d1d1f",
        false,
        12,
        "plum",
    );
    const [pr, pg, pb] = parseRgb(plumPal.stroke("accent"));
    assert(
        pr > pg && pr > pb,
        `Expected crimson plum accent under rose theme, got (${pr},${pg},${pb})`,
    );

    // 2. 红枫桌面 1440x900 全部分支采样点必须避让中央搜索框安全区
    const wideMaple = generateBotanicalScene(
        "maple",
        1440,
        900,
        "2026-10-23",
        false,
    );
    for (const b of wideMaple.branches) {
        for (const p of b.points) {
            const insideSearch = p.x >= 420 && p.x <= 1020 && p.y >= 320 &&
                p.y <= 410;
            assert(
                !insideSearch,
                `Maple branch point (${p.x.toFixed(1)}, ${
                    p.y.toFixed(1)
                }) intruded search zone`,
            );
        }
    }

    // 3. 夏竹前景叶簇着生于枝条多个不同节点，打破单点对称放射
    const wideBamboo = generateBotanicalScene(
        "bamboo",
        1440,
        900,
        "2026-06-21",
        false,
    );
    const fgBambooLeaves = wideBamboo.ornaments.filter(
        (o) => o.kind === "bambooLeaf" && !o.ghost && !o.midground,
    );
    const distinctIdx = new Set(fgBambooLeaves.map((o) => o.idx));
    assert(
        distinctIdx.size >= 3,
        `Expected staggered bamboo leaf attachment nodes (>=3), got ${distinctIdx.size}`,
    );

    // 4. 经典蓝下寒梅仍保持宋画「宫粉胭脂梅 × 绿萼」，不染成蓝梅花
    const plumBluePal = buildBotanicalPalette(
        false,
        "#0a66c2",
        "#1d1d1f",
        false,
        12,
        "plum",
    );
    const [pbr, pbg, pbb] = parseRgb(plumBluePal.stroke("accent"));
    assert(
        pbr > pbg && pbr > pbb,
        `Expected crimson/pink plum accent even under blue theme, got (${pbr},${pbg},${pbb})`,
    );

    // 5. 寒梅桌面 1440x900 全部分支采样点必须避让中央搜索框安全区
    const widePlum = generateBotanicalScene(
        "plum",
        1440,
        900,
        "2026-02-04",
        false,
    );
    for (const b of widePlum.branches) {
        for (const p of b.points) {
            const insideSearch = p.x >= 420 && p.x <= 1020 && p.y >= 315 &&
                p.y <= 420;
            assert(
                !insideSearch,
                `Plum branch point (${p.x.toFixed(1)}, ${
                    p.y.toFixed(1)
                }) intruded search zone`,
            );
        }
    }
});

Deno.test("minimalist折枝 atmosphere: renders contourless air washes with zero moon disc or mountain ridge curves", () => {
    const captureAtmosphereCalls = (
        width: number,
        height: number,
        embedded: boolean,
        overPhoto: boolean,
        isDark: boolean,
    ) => {
        const { ctx, assertFiniteCoords } = createMockCanvasContext();
        const stack: Array<[number, number]> = [[1, 1]];
        const origSave = ctx.save;
        const origRestore = ctx.restore;
        const origScale = ctx.scale;
        const origArc = ctx.arc;

        const arcCalls: Array<{
            r: number;
            scaleX: number;
            scaleY: number;
        }> = [];
        let curveCalls = 0;

        ctx.save = () => {
            const top = stack[stack.length - 1];
            stack.push([top[0], top[1]]);
            origSave();
        };
        ctx.restore = () => {
            if (stack.length > 1) stack.pop();
            origRestore();
        };
        ctx.scale = (x: number, y: number) => {
            const top = stack[stack.length - 1];
            top[0] *= x;
            top[1] *= y;
            origScale(x, y);
        };
        ctx.arc = (
            x: number,
            y: number,
            r: number,
            s: number,
            e: number,
        ) => {
            const top = stack[stack.length - 1];
            arcCalls.push({ r, scaleX: top[0], scaleY: top[1] });
            origArc(x, y, r, s, e);
        };
        const origBezier = ctx.bezierCurveTo;
        const origQuad = ctx.quadraticCurveTo;
        ctx.bezierCurveTo = (
            c1x: number,
            c1y: number,
            c2x: number,
            c2y: number,
            x: number,
            y: number,
        ) => {
            curveCalls++;
            origBezier(c1x, c1y, c2x, c2y, x, y);
        };
        ctx.quadraticCurveTo = (
            cx: number,
            cy: number,
            x: number,
            y: number,
        ) => {
            curveCalls++;
            origQuad(cx, cy, x, y);
        };

        const palette = buildBotanicalPalette(
            isDark,
            isDark ? "#fb7185" : "#be123c",
            isDark ? "#f5f5f7" : "#1d1d1f",
            overPhoto,
        );
        const scene = generateBotanicalScene(
            "plum",
            width,
            height,
            "2026-11-22",
            embedded,
        );
        renderBotanicalFrame({
            ctx,
            scene,
            width,
            height,
            timeSec: 12,
            dt: 0.016,
            rawProgress: 1,
            reducedMotion: true,
            windCalm: 1,
            searchFocused: false,
            embedded,
            palette,
            pointer: {
                x: -9999,
                y: -9999,
                vx: 0,
                vy: 0,
                lastT: 0,
                lastRustleSpawn: 0,
            },
            drifters: [],
            lastDriftSpawn: 0,
            frameSeq: 1,
        });
        assertFiniteCoords();
        return { arcCalls, curveCalls };
    };

    for (const isDark of [false, true]) {
        for (
            const [width, height, embedded] of [
                [1440, 900, false],
                [390, 844, false],
                [1440, 810, true],
            ] as const
        ) {
            const plain = captureAtmosphereCalls(
                width,
                height,
                embedded,
                false,
                isDark,
            );
            const overPhoto = captureAtmosphereCalls(
                width,
                height,
                embedded,
                true,
                isDark,
            );

            assertEquals(
                plain.curveCalls,
                overPhoto.curveCalls,
                `${width}x${height} (dark=${isDark}, embedded=${embedded}): expected zero mountain ridge or cloud ribbon curves in drawAtmosphericStage`,
            );

            const circularLargeArcs = plain.arcCalls.filter((a) => {
                const ratio = Math.abs(a.scaleY / a.scaleX);
                return Math.abs(ratio - 1) < 0.05 && a.r >= 52;
            });
            assertEquals(
                circularLargeArcs.length,
                0,
                `${width}x${height} (dark=${isDark}, embedded=${embedded}): expected no circular moon disc or circular halo arcs`,
            );

            const plainEllipses = plain.arcCalls.filter((a) => {
                const ratio = Math.abs(a.scaleY / a.scaleX);
                return ratio < 0.75 && a.r >= 120;
            }).length;
            const photoEllipses = overPhoto.arcCalls.filter((a) => {
                const ratio = Math.abs(a.scaleY / a.scaleX);
                return ratio < 0.75 && a.r >= 120;
            }).length;
            assert(
                plainEllipses >= photoEllipses + 2,
                `${width}x${height} (dark=${isDark}, embedded=${embedded}): expected >=2 contourless air washes (${plainEllipses} vs ${photoEllipses})`,
            );
        }
    }
});
