import { assert, assertEquals } from "@std/assert";
import {
    BOTANICAL_ARCHETYPE_NAMES,
    type BotanicalArchetype,
    type BotanicalScene,
    type BotanicalSpeciesModule,
    buildBotanicalPalette,
    type ConcreteBotanicalSpecies,
    createBotanicalRenderCache,
    createBotanicalRuntimeState,
    evalGustEnvelope,
    generateBotanicalScene,
    getVisitorReturnShowSec,
    isBotanicalSceneActive,
    loadBotanicalSpecies,
    nextBotanicalWakeDelayMs,
    renderBotanicalFrame,
    resolveBotanicalArchetype,
    resolveBotanicalBackdropAdaptation,
    resolveBotanicalSpecies,
    resolveBotanicalViewport,
    resolveDiurnalWindScale,
    resolveSolarTerm,
    stepBotanicalWindSpring,
    type SurfaceFactory,
    triggerBotanicalGust,
    triggerBotanicalResonance,
} from "./botanical/index.ts";

const SPECIES: readonly ConcreteBotanicalSpecies[] = [
    "ginkgo",
    "maple",
    "eucalyptus",
    "plum",
    "fern",
];

async function loadAllSpeciesModules(): Promise<
    Record<ConcreteBotanicalSpecies, BotanicalSpeciesModule>
> {
    const entries = await Promise.all(
        SPECIES.map(async (sp) =>
            [sp, await loadBotanicalSpecies(sp)] as const
        ),
    );
    return Object.fromEntries(entries) as Record<
        ConcreteBotanicalSpecies,
        BotanicalSpeciesModule
    >;
}

Deno.test("loadBotanicalSpecies: lazily resolves each of the 5 concrete species modules", async () => {
    for (const species of SPECIES) {
        const mod = await loadBotanicalSpecies(species);
        assertEquals(mod.species, species);
    }
});

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

Deno.test("generateBotanicalScene: mobile (390x844) keeps upper-right echo and clears search/dock", async () => {
    const modules = await loadAllSpeciesModules();
    for (const species of SPECIES) {
        const scene = generateBotanicalScene(
            modules[species],
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

Deno.test("generateBotanicalScene: embedded 16:9 preview preserves top-right echo without top clipping", async () => {
    const modules = await loadAllSpeciesModules();
    const viewport = resolveBotanicalViewport(440, 247.5, true);
    for (const species of SPECIES) {
        const scene = generateBotanicalScene(
            modules[species],
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
            pal.luminous(),
            pal.goldDust(),
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
        setTransform: () => {},
        drawImage: () => {},
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

Deno.test("renderBotanicalFrame: renders all species across progress and embedded states cleanly", async () => {
    const modules = await loadAllSpeciesModules();
    const scenarios = [
        { reducedMotion: true, rawProgress: 1, embedded: false },
        { reducedMotion: false, rawProgress: 0.5, embedded: false },
        { reducedMotion: false, rawProgress: 1, embedded: false },
        { reducedMotion: true, rawProgress: 1, embedded: true },
    ];
    for (const species of SPECIES) {
        const palette = buildBotanicalPalette(false, "#0a66c2", "#1c1e22");
        const scene = generateBotanicalScene(
            modules[species],
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

Deno.test("generateBotanicalScene (fern): uses minimalist 3-frond orchid-brush composition with folded leaves and feibai", async () => {
    const fernMod = await loadBotanicalSpecies("fern");
    const desktop = generateBotanicalScene(
        fernMod,
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

Deno.test("generateBotanicalScene: attaches visitorAnchor and rewardAnchor only for non-embedded scenes", async () => {
    const modules = await loadAllSpeciesModules();
    for (const species of SPECIES) {
        const desktop = generateBotanicalScene(
            modules[species],
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
            modules[species],
            1440,
            810,
            "2026-11-27",
            true,
        );
        assertEquals(embedded.visitorAnchor, null);
        assertEquals(embedded.rewardAnchor, null);
    }
});

Deno.test("renderBotanicalFrame: renders micro-ecology visitors in light and dark modes with valid coords", async () => {
    const modules = await loadAllSpeciesModules();
    for (const species of SPECIES) {
        const scene = generateBotanicalScene(
            modules[species],
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

Deno.test("triggerBotanicalResonance: handles theme-ripple, quick-capture, and tasks-cleared cleanly", async () => {
    const modules = await loadAllSpeciesModules();
    for (const species of SPECIES) {
        const scene = generateBotanicalScene(
            modules[species],
            1440,
            900,
            "2026-11-27",
            false,
        );
        const palette = buildBotanicalPalette(false, "#be123c", "#1d1d1f");
        const runtime = createBotanicalRuntimeState();
        const drifters: Parameters<typeof renderBotanicalFrame>[0]["drifters"] =
            [];

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
        ["fern", "eucalyptus"].includes(
            resolveBotanicalSpecies("auto", "2026-04-06"),
        ),
    );

    const summerTerm = resolveSolarTerm("2026-07-10");
    assertEquals(summerTerm.season, "summer");
    assert(
        ["eucalyptus", "fern"].includes(
            resolveBotanicalSpecies("auto", "2026-07-10"),
        ),
    );

    const autumnTerm = resolveSolarTerm("2026-10-12");
    assertEquals(autumnTerm.season, "autumn");
    assert(
        ["ginkgo", "maple"].includes(
            resolveBotanicalSpecies("auto", "2026-10-12"),
        ),
    );

    assert(
        ["plum", "eucalyptus"].includes(
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

Deno.test("renderBotanicalFrame: supports left-mirrored layout, snow cushions, and search-submit with zero solar-term seal", async () => {
    const modules = await loadAllSpeciesModules();
    for (const species of SPECIES) {
        const scene = generateBotanicalScene(
            modules[species],
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
        });
        assertFiniteCoords();
    }

    // Empty synthetic scene at rawProgress=1 with solidSurface=true must emit 0 fill/stroke/fillText (zero corner seal)
    const emptyScene: BotanicalScene = {
        species: "plum",
        module: modules.plum,
        side: "right",
        archetype: 0,
        visitorPresent: false,
        branches: [],
        ornaments: [],
        rocks: [],
        scale: 1,
        visitorAnchor: null,
        rewardAnchor: null,
    };
    for (const isDark of [false, true]) {
        const solidPal = buildBotanicalPalette(
            isDark,
            "#be123c",
            isDark ? "#f5f5f7" : "#1d1d1f",
            false,
            12,
            "plum",
            { solidSurface: true },
        );
        const { ctx } = createMockCanvasContext();
        let fillCalls = 0;
        let strokeCalls = 0;
        let fillTextCalls = 0;
        ctx.fill = () => {
            fillCalls++;
        };
        ctx.stroke = () => {
            strokeCalls++;
        };
        ctx.fillText = () => {
            fillTextCalls++;
        };
        renderBotanicalFrame({
            ctx,
            scene: emptyScene,
            width: 1440,
            height: 900,
            timeSec: 12,
            dt: 0.016,
            rawProgress: 1,
            reducedMotion: true,
            windCalm: 1,
            searchFocused: false,
            embedded: false,
            palette: solidPal,
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
        assertEquals(
            fillCalls,
            0,
            `dark=${isDark}: expected 0 fill calls on empty finished frame (no seal)`,
        );
        assertEquals(
            strokeCalls,
            0,
            `dark=${isDark}: expected 0 stroke calls on empty finished frame (no seal)`,
        );
        assertEquals(
            fillTextCalls,
            0,
            `dark=${isDark}: expected 0 fillText calls on empty finished frame`,
        );
    }
});

Deno.test("botanical evolution: OKLCH palette, non-destructive feibai, phenology, fern rock, and idle sleep", async () => {
    const modules = await loadAllSpeciesModules();
    const pal = buildBotanicalPalette(
        false,
        "oklch(0.54 0.16 25)",
        "#1d1d1f",
    );
    assert(/^rgba\(\d+,\d+,\d+,\d+\.\d+\)$/.test(pal.waterline("accent")));
    assert(/^rgba\(\d+,\d+,\d+,\d+\.\d+\)$/.test(pal.inkGrade("jiao")));
    assert(/^rgba\(\d+,\d+,\d+,\d+\.\d+\)$/.test(pal.inkGrade("qing")));

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
    const plum = generateBotanicalScene(
        modules.plum,
        1440,
        900,
        "2026-12-22",
        false,
    );
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
        modules.ginkgo,
        1440,
        900,
        "2026-10-25",
        false,
    );
    const ginkgoSummer = generateBotanicalScene(
        modules.ginkgo,
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
        modules.plum,
        1440,
        900,
        "2026-02-06",
        false,
    );
    const plumWinter = generateBotanicalScene(
        modules.plum,
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

    // Fern includes slope rock on wide desktop
    const wideFern = generateBotanicalScene(
        modules.fern,
        1440,
        900,
        "2026-07-10",
        false,
    );
    assert(
        wideFern.rocks.length >= 1,
        "Expected slope rock base for wide fern",
    );

    // Generating with dockInsets emits valid finite coordinates
    const dockedPlum = generateBotanicalScene(
        modules.plum,
        1440,
        900,
        "2026-02-06",
        false,
        { top: 0, right: 64, bottom: 56, left: 0 },
    );
    const { ctx: dockCtx, assertFiniteCoords: assertDockCoords } =
        createMockCanvasContext();
    renderBotanicalFrame({
        ctx: dockCtx,
        scene: dockedPlum,
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
    });
    assertDockCoords();
});

Deno.test("museum pass: zero dashed lines, goldDust, and trunk weight", async () => {
    const modules = await loadAllSpeciesModules();
    const palLight = buildBotanicalPalette(false, "#be123c", "#1d1d1f");
    const palDark = buildBotanicalPalette(true, "#fb7185", "#f5f5f7");
    for (const s of [palLight.goldDust(), palDark.goldDust()]) {
        assert(/^rgba\(\d+,\d+,\d+,\d+\.\d+\)$/.test(s), `Invalid rgba: ${s}`);
    }

    for (const sp of ["plum", "maple", "ginkgo"] as const) {
        const scene = generateBotanicalScene(
            modules[sp],
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

    for (const dateKey of ["2026-04-05", "2026-11-22"]) {
        for (const isDark of [false, true]) {
            const pal = buildBotanicalPalette(
                isDark,
                "#be123c",
                isDark ? "#f5f5f7" : "#1d1d1f",
            );
            const scene = generateBotanicalScene(
                modules.plum,
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
            });
            assertFiniteCoords();
            assertEquals(
                fillTextCalls,
                0,
                `${dateKey} (dark=${isDark}): finished frame must not call fillText`,
            );
            assertEquals(
                nonEmptyDashCalls,
                0,
                `${dateKey} (dark=${isDark}): finished frame must not use dashed strokes`,
            );
        }
    }
});

Deno.test("museum polish: intrinsic species color harmony and search clearance", async () => {
    const modules = await loadAllSpeciesModules();
    const parseRgb = (s: string) => {
        const m = s.match(/^rgba\((\d+),(\d+),(\d+),/);
        assert(m, `Expected rgba string: ${s}`);
        return [Number(m[1]), Number(m[2]), Number(m[3])] as const;
    };

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

    const wideMaple = generateBotanicalScene(
        modules.maple,
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

    const widePlum = generateBotanicalScene(
        modules.plum,
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

Deno.test("minimalist折枝 atmosphere: renders contourless air washes with zero moon disc or mountain ridge curves", async () => {
    const plumMod = await loadBotanicalSpecies("plum");
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
            plumMod,
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

Deno.test("phase 1+2 contract: all 5 species clear wide search zone, local band adaptation & gongbi-line, solidSurface suppresses air wash", async () => {
    const modules = await loadAllSpeciesModules();
    for (const species of SPECIES) {
        const scene = generateBotanicalScene(
            modules[species],
            1440,
            900,
            "2026-06-21",
            false,
        );
        for (const b of scene.branches) {
            if (b.ghost) continue;
            for (const p of b.points) {
                const insideSearch = p.x >= 420 && p.x <= 1020 &&
                    p.y >= 315 && p.y <= 420;
                assert(
                    !insideSearch,
                    `${species}: non-ghost branch point (${p.x.toFixed(1)}, ${
                        p.y.toFixed(1)
                    }) intruded wide search zone`,
                );
            }
        }
    }

    const splitBands = {
        left: { lightness: 0.78, spread: 0.10 },
        right: { lightness: 0.24, spread: 0.25 },
    };
    const rightOnLightTheme = resolveBotanicalBackdropAdaptation({
        overPhoto: true,
        scheme: "light",
        sceneSide: "right",
        backdropBands: splitBands,
    });
    assertEquals(rightOnLightTheme.isDark, true);
    assertEquals(rightOnLightTheme.photoStyle, "gongbi-line");

    const leftOnDarkTheme = resolveBotanicalBackdropAdaptation({
        overPhoto: true,
        scheme: "dark",
        sceneSide: "left",
        backdropBands: splitBands,
    });
    assertEquals(leftOnDarkTheme.isDark, false);
    assertEquals(leftOnDarkTheme.photoStyle, "silk-wash");

    const plainCanvas = resolveBotanicalBackdropAdaptation({
        overPhoto: false,
        scheme: "light",
        sceneSide: "right",
        backdropBands: splitBands,
        solidSurface: true,
    });
    assertEquals(plainCanvas.isDark, false);
    assertEquals(plainCanvas.photoStyle, "xuan");
    assertEquals(plainCanvas.solidSurface, true);

    const silkPal = buildBotanicalPalette(
        true,
        "#fb7185",
        "#f5f5f7",
        true,
        12,
        "plum",
        { photoSpread: 0.08 },
    );
    const gongbiPal = buildBotanicalPalette(
        true,
        "#fb7185",
        "#f5f5f7",
        true,
        12,
        "plum",
        { photoSpread: 0.25 },
    );
    assertEquals(silkPal.photoStyle, "silk-wash");
    assertEquals(gongbiPal.photoStyle, "gongbi-line");
    const alphaOf = (s: string) => Number(s.match(/,([^,)]+)\)$/)?.[1] ?? "0");
    assert(
        alphaOf(gongbiPal.wash("accent")) < alphaOf(silkPal.wash("accent")),
        "Expected gongbi-line to soften wash alpha over busy photos",
    );

    const solidPal = buildBotanicalPalette(
        false,
        "#be123c",
        "#1d1d1f",
        false,
        12,
        "plum",
        { solidSurface: true },
    );
    assertEquals(solidPal.solidSurface, true);
    const { ctx: solidCtx } = createMockCanvasContext();
    let solidLargeEllipses = 0;
    const origArc = solidCtx.arc;
    solidCtx.arc = (x: number, y: number, r: number, s: number, e: number) => {
        if (r >= 120) solidLargeEllipses++;
        origArc(x, y, r, s, e);
    };
    const plum = generateBotanicalScene(
        modules.plum,
        1440,
        900,
        "2026-11-22",
        false,
    );
    renderBotanicalFrame({
        ctx: solidCtx,
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
        palette: solidPal,
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
    assertEquals(
        solidLargeEllipses,
        0,
        "Expected solidSurface to suppress atmospheric bokeh washes",
    );
});

Deno.test("phase 3 contract: non-mirrored left-side geometry, 5x3 archetypes, serendipity visitor, and AI resonance", async () => {
    const modules = await loadAllSpeciesModules();
    const leftPlum = generateBotanicalScene(
        modules.plum,
        1440,
        900,
        "2026-11-27",
        false,
        undefined,
        { sceneSide: "left" },
    );
    assertEquals(leftPlum.side, "left");
    const leftHero = leftPlum.branches.find((b) => !b.ghost && !b.parentRef);
    assert(leftHero, "Expected hero branch in left-side plum");
    assert(
        leftHero.points[0].x < 720,
        `Expected left-side plum root x < 720, got ${leftHero.points[0].x}`,
    );

    const { ctx: leftCtx, assertFiniteCoords: checkLeft } =
        createMockCanvasContext();
    let fullCanvasMirrorTranslates = 0;
    const origTranslate = leftCtx.translate;
    leftCtx.translate = (x: number, y: number) => {
        if (x === 1440 && y === 0) fullCanvasMirrorTranslates++;
        origTranslate(x, y);
    };
    renderBotanicalFrame({
        ctx: leftCtx,
        scene: leftPlum,
        width: 1440,
        height: 900,
        timeSec: 12,
        dt: 0.016,
        rawProgress: 1,
        reducedMotion: true,
        windCalm: 1,
        searchFocused: false,
        embedded: false,
        palette: buildBotanicalPalette(false, "#be123c", "#1d1d1f"),
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
        sceneSide: "left",
        forceVisitor: true,
    });
    checkLeft();
    assertEquals(
        fullCanvasMirrorTranslates,
        0,
        "Expected parameter-level left-side scene to render without full-canvas mirror translate(width, 0)",
    );

    for (const species of SPECIES) {
        assertEquals(BOTANICAL_ARCHETYPE_NAMES[species].length, 3);
        for (
            const arch of [
                0,
                1,
                2,
            ] as const satisfies readonly BotanicalArchetype[]
        ) {
            assertEquals(
                resolveBotanicalArchetype(species, "2026-11-27", arch),
                arch,
            );
            const scene = generateBotanicalScene(
                modules[species],
                1440,
                900,
                "2026-11-27",
                false,
                undefined,
                { archetype: arch },
            );
            assertEquals(scene.archetype, arch);
            for (const b of scene.branches) {
                if (b.ghost) continue;
                for (const p of b.points) {
                    const insideSearch = p.x >= 420 && p.x <= 1020 &&
                        p.y >= 315 && p.y <= 420;
                    assert(
                        !insideSearch,
                        `${species} arch=${arch}: branch point (${
                            p.x.toFixed(1)
                        }, ${p.y.toFixed(1)}) intruded search zone`,
                    );
                }
            }
            if (species === "fern") {
                assert(
                    scene.rocks.length >= 1,
                    `fern arch=${arch}: expected slope rock`,
                );
            }
        }
    }

    const runtime = createBotanicalRuntimeState();
    triggerBotanicalGust(runtime, 10, 0.9, 4.6);
    triggerBotanicalResonance(runtime, "ai-thinking", 11, leftPlum, [], 1, 1);
    assertEquals(runtime.gustDurationSec, 0);
    assertEquals(runtime.breezeImpulseStrength, 0);
    triggerBotanicalResonance(runtime, "ai-complete", 14, leftPlum, [], 1, 2);
    assert(runtime.breezeImpulseStrength > 0);
    assertEquals(runtime.haloPulseStartSec, 14);
});

Deno.test("audit regression: resonance settles to idle across all species/themes, luminous stays bright, geometry anchors cleanly, and lazy boundaries hold", async () => {
    const modules = await loadAllSpeciesModules();
    for (const isDark of [false, true]) {
        const pal = buildBotanicalPalette(
            isDark,
            "#be123c",
            isDark ? "#f5f5f7" : "#1d1d1f",
        );
        for (const species of SPECIES) {
            const scene = generateBotanicalScene(
                modules[species],
                1440,
                900,
                "2026-11-28",
                false,
            );
            for (
                const kind of [
                    "search-submit",
                    "quick-capture",
                    "task-completed",
                ] as const
            ) {
                const rt = createBotanicalRuntimeState();
                const drifters: Parameters<
                    typeof renderBotanicalFrame
                >[0]["drifters"] = [];
                triggerBotanicalResonance(rt, kind, 10, scene, drifters, 1, 1, {
                    isDark,
                });
                let t = 10.016;
                const { ctx } = createMockCanvasContext();
                for (let i = 0; i < 160; i++, t += 0.2) {
                    renderBotanicalFrame({
                        ctx,
                        scene,
                        width: 1440,
                        height: 900,
                        timeSec: t,
                        dt: 0.05,
                        rawProgress: 1,
                        reducedMotion: false,
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
                        drifters,
                        lastDriftSpawn: 999,
                        frameSeq: i + 2,
                        runtime: rt,
                    });
                }
                assertEquals(
                    rt.visitorMode,
                    "perched",
                    `dark=${isDark} ${species} ${kind}: visitorMode must return to perched`,
                );
                assertEquals(
                    rt.dewState,
                    "hanging",
                    `dark=${isDark} ${species} ${kind}: dewState must return to hanging`,
                );
                assertEquals(
                    isBotanicalSceneActive({
                        runtime: rt,
                        rawProgress: 1,
                        timeSec: t,
                        scene,
                        drifters,
                        reducedMotion: false,
                        embedded: false,
                    }),
                    false,
                    `dark=${isDark} ${species} ${kind}: scene must settle to idle`,
                );
            }
        }
    }

    const leftPlum = generateBotanicalScene(
        modules.plum,
        1440,
        900,
        "2026-11-28",
        false,
        undefined,
        { sceneSide: "left" },
    );
    const leftRt = createBotanicalRuntimeState();
    triggerBotanicalResonance(leftRt, "search-submit", 10, leftPlum, [], 1, 1, {
        isDark: false,
        forceVisitor: true,
    });
    assertEquals(leftRt.visitorMode, "departing");
    assert(
        leftRt.visitorVx > 0,
        `Expected left-side visitorVx > 0, got ${leftRt.visitorVx}`,
    );

    for (const isDark of [false, true]) {
        const pal = buildBotanicalPalette(
            isDark,
            "#be123c",
            isDark ? "#f5f5f7" : "#1d1d1f",
        );
        const m = pal.luminous(0.9).match(/^rgba\((\d+),(\d+),(\d+),/);
        assert(m, `Invalid luminous rgba: ${pal.luminous(0.9)}`);
        const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
        assert(
            r >= 220 && g >= 220 && b >= 220,
            `dark=${isDark}: luminous must stay bright, got (${r},${g},${b})`,
        );
    }

    const hangingPlum = generateBotanicalScene(
        modules.plum,
        1440,
        900,
        "2026-11-28",
        false,
        undefined,
        { archetype: 2 },
    );
    const hangingHero = hangingPlum.branches.find((b) =>
        !b.ghost && !b.parentRef
    );
    assert(hangingHero, "Expected hero branch for hanging plum");
    assert(
        hangingHero.points[0].x >= 1440,
        `Expected hanging plum root off right edge (>=1440), got ${
            hangingHero.points[0].x
        }`,
    );

    for (
        const species of [
            "plum",
            "ginkgo",
            "eucalyptus",
            "fern",
        ] as const
    ) {
        const mobile = generateBotanicalScene(
            modules[species],
            390,
            844,
            "2026-11-28",
            false,
        );
        for (const b of mobile.branches) {
            if (b.ghost || b.parentRef) continue;
            assert(
                b.points[0].x >= 390,
                `mobile ${species}: expected root off right edge (>=390), got (${
                    b.points[0].x.toFixed(1)
                }, ${b.points[0].y.toFixed(1)})`,
            );
        }
    }

    // Lazy-load boundary guards
    const pickerSource = await Deno.readTextFile(
        new URL("../searcher/AppearancePicker.tsx", import.meta.url),
    );
    assert(
        !pickerSource.includes("botanical-engine") &&
            !pickerSource.includes("./botanical") &&
            !pickerSource.includes("../wallpaper/botanical"),
        "AppearancePicker must import solar-terms.ts rather than botanical runtime",
    );
    const choicesSource = await Deno.readTextFile(
        new URL("../searcher/BotanicalSceneChoices.tsx", import.meta.url),
    );
    assert(
        !choicesSource.includes("botanical-engine") &&
            !choicesSource.includes("../wallpaper/botanical"),
        "BotanicalSceneChoices must not import botanical canvas runtime",
    );
    const canvasSource = await Deno.readTextFile(
        new URL("./BotanicalSceneCanvas.tsx", import.meta.url),
    );
    assert(
        !canvasSource.includes("./species/") &&
            !canvasSource.includes("./botanical/species/"),
        "BotanicalSceneCanvas must not statically import species modules",
    );
    const indexSource = await Deno.readTextFile(
        new URL("./botanical/index.ts", import.meta.url),
    );
    assert(
        !indexSource.includes("./species/"),
        "botanical/index.ts must not statically import species modules",
    );
});

Deno.test("motion naturalness & performance: asymmetric gust, wind spring, returning sleep, firefly phase, worldCache reuse, and offscreen cache", async () => {
    const modules = await loadAllSpeciesModules();

    // 1. Asymmetric gust envelope: 0 at start/end, peaks early (u ≈ 0.27), smoothly tapers
    const gustRt = createBotanicalRuntimeState();
    triggerBotanicalGust(gustRt, 10, 1.0, 4.0);
    assertEquals(evalGustEnvelope(gustRt, 10, 1), 0);
    assertEquals(evalGustEnvelope(gustRt, 14, 1), 0);
    const earlyPeak = evalGustEnvelope(gustRt, 10 + 4 * 0.27, 1);
    const midVal = evalGustEnvelope(gustRt, 10 + 4 * 0.65, 1);
    const tailVal = evalGustEnvelope(gustRt, 10 + 4 * 0.98, 1);
    assert(earlyPeak > 0.95, `Expected early peak > 0.95, got ${earlyPeak}`);
    assert(
        earlyPeak > midVal && midVal > tailVal && tailVal < 0.05,
        `Expected smooth asymmetric decay: peak=${earlyPeak}, mid=${midVal}, tail=${tailVal}`,
    );

    // 2. Unified wind spring: rapid double resonance accumulates velocity without position jump & settles to 0
    const springRt = createBotanicalRuntimeState();
    const plum = generateBotanicalScene(
        modules.plum,
        1440,
        900,
        "2026-11-28",
        false,
    );
    triggerBotanicalResonance(springRt, "theme-ripple", 10, plum, [], 1, 1);
    assertEquals(stepBotanicalWindSpring(springRt, 0.016, false), 0);
    const posAfterFirst = stepBotanicalWindSpring(springRt, 0.016, false);
    assert(posAfterFirst > 0);
    const posBeforeSecond = springRt.windPos;
    triggerBotanicalResonance(springRt, "search-submit", 10.05, plum, [], 1, 2);
    assertEquals(
        springRt.windPos,
        posBeforeSecond,
        "Second resonance must not jump windPos discontinuously",
    );
    for (let i = 0; i < 200; i++) {
        stepBotanicalWindSpring(springRt, 0.05, false);
    }
    assertEquals(springRt.windPos, 0);
    assertEquals(springRt.windVel, 0);

    // 3. Returning visitor sleeps during hidden wait (0..showAt) and schedules wakeup
    const retRt = createBotanicalRuntimeState();
    retRt.visitorMode = "returning";
    retRt.visitorStateStartSec = 20;
    const showAt = getVisitorReturnShowSec(plum);
    assertEquals(showAt, 16.5);
    assertEquals(
        isBotanicalSceneActive({
            runtime: retRt,
            rawProgress: 1,
            timeSec: 22,
            scene: plum,
            drifters: [],
            reducedMotion: false,
            embedded: false,
        }),
        false,
        "Returning sparrow must allow idle sleep during hidden wait",
    );
    const wakeDelay = nextBotanicalWakeDelayMs(retRt, 22, plum);
    assert(
        wakeDelay >= 14_000 && wakeDelay <= 15_000,
        `Expected wake delay ~14500ms, got ${wakeDelay}`,
    );
    assertEquals(
        isBotanicalSceneActive({
            runtime: retRt,
            rawProgress: 1,
            timeSec: 20 + 17.0,
            scene: plum,
            drifters: [],
            reducedMotion: false,
            embedded: false,
        }),
        true,
        "Returning sparrow must be active during final 1.5s arc landing",
    );

    // 4. Firefly simulation clock advances only by dt (no teleport after 20s sleep)
    const ffRt = createBotanicalRuntimeState();
    const darkPal = buildBotanicalPalette(true, "#fb7185", "#f5f5f7");
    const { ctx: ffCtx } = createMockCanvasContext();
    renderBotanicalFrame({
        ctx: ffCtx,
        scene: plum,
        width: 1440,
        height: 900,
        timeSec: 10,
        dt: 0.016,
        rawProgress: 1,
        reducedMotion: false,
        windCalm: 1,
        searchFocused: false,
        embedded: false,
        palette: darkPal,
        pointer: {
            x: -9999,
            y: -9999,
            vx: 0,
            vy: 0,
            lastT: 0,
            lastRustleSpawn: 0,
        },
        drifters: [],
        lastDriftSpawn: 999,
        frameSeq: 1,
        runtime: ffRt,
    });
    const simBeforeSleep = ffRt.fireflySimSec;
    renderBotanicalFrame({
        ctx: ffCtx,
        scene: plum,
        width: 1440,
        height: 900,
        timeSec: 30,
        dt: 0.016,
        rawProgress: 1,
        reducedMotion: false,
        windCalm: 1,
        searchFocused: false,
        embedded: false,
        palette: darkPal,
        pointer: {
            x: -9999,
            y: -9999,
            vx: 0,
            vy: 0,
            lastT: 0,
            lastRustleSpawn: 0,
        },
        drifters: [],
        lastDriftSpawn: 999,
        frameSeq: 2,
        runtime: ffRt,
    });
    assert(
        Math.abs(ffRt.fireflySimSec - (simBeforeSleep + 0.016)) < 1e-6,
        "fireflySimSec must advance by dt, not wall-clock sleep delta",
    );

    // 5. worldCache zero-allocation reuse & scene.bounds mirrored correctly
    const firstWorldRef = plum.branches[0].worldCache;
    const firstSampleRef = firstWorldRef?.[0];
    assert(firstWorldRef && firstSampleRef);
    renderBotanicalFrame({
        ctx: ffCtx,
        scene: plum,
        width: 1440,
        height: 900,
        timeSec: 30.1,
        dt: 0.016,
        rawProgress: 1,
        reducedMotion: false,
        windCalm: 1,
        searchFocused: false,
        embedded: false,
        palette: darkPal,
        pointer: {
            x: -9999,
            y: -9999,
            vx: 0,
            vy: 0,
            lastT: 0,
            lastRustleSpawn: 0,
        },
        drifters: [],
        lastDriftSpawn: 999,
        frameSeq: 3,
        runtime: ffRt,
    });
    assertEquals(
        plum.branches[0].worldCache,
        firstWorldRef,
        "Expected worldCache array to be reused in-place",
    );
    assertEquals(
        plum.branches[0].worldCache?.[0],
        firstSampleRef,
        "Expected WorldSample elements to be reused in-place",
    );
    assert(plum.bounds && plum.bounds.minX > 400 && plum.bounds.maxX >= 1400);
    const leftPlum = generateBotanicalScene(
        modules.plum,
        1440,
        900,
        "2026-11-28",
        false,
        undefined,
        { sceneSide: "left" },
    );
    assert(
        leftPlum.bounds && leftPlum.bounds.minX < 100 &&
            leftPlum.bounds.maxX < 1040,
        "Expected left-side scene.bounds to be mirrored",
    );

    // 6. Offscreen render cache: bakes atmosphere, rocks & finished ornaments once, stamps on subsequent frames, invalidates on palette swap
    const fern = generateBotanicalScene(
        modules.fern,
        1440,
        900,
        "2026-07-10",
        false,
    );
    let surfacesCreated = 0;
    const mockFactory: SurfaceFactory = (w, h) => {
        surfacesCreated++;
        const { ctx: sCtx } = createMockCanvasContext();
        return {
            canvas: { width: w, height: h } as unknown as HTMLCanvasElement,
            ctx: sCtx,
        };
    };
    const renderCache = createBotanicalRenderCache(mockFactory);
    const palA = buildBotanicalPalette(false, "#be123c", "#1d1d1f");
    const palB = buildBotanicalPalette(true, "#fb7185", "#f5f5f7");
    let drawImageCalls = 0;
    const { ctx: mainCtx } = createMockCanvasContext();
    mainCtx.drawImage = () => {
        drawImageCalls++;
    };
    const cacheArgs = {
        ctx: mainCtx,
        scene: fern,
        width: 1440,
        height: 900,
        timeSec: 12,
        dt: 0.016,
        rawProgress: 1,
        reducedMotion: true,
        windCalm: 1,
        searchFocused: false,
        embedded: false,
        palette: palA,
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
        cache: renderCache,
        dpr: 2,
    };
    renderBotanicalFrame(cacheArgs);
    const bakedAfterFrame1 = surfacesCreated;
    assert(
        bakedAfterFrame1 >= 2 + fern.ornaments.length,
        `Expected atmosphere + rocks + ornaments baked, got ${bakedAfterFrame1}`,
    );
    assert(drawImageCalls >= bakedAfterFrame1);

    // Frame 2 with same palette must reuse all cached surfaces (0 new surfaces created)
    renderBotanicalFrame({ ...cacheArgs, frameSeq: 2 });
    assertEquals(
        surfacesCreated,
        bakedAfterFrame1,
        "Frame 2 must hit offscreen cache without allocating new surfaces",
    );

    // Frame 3 with new palette must invalidate and re-bake
    renderBotanicalFrame({ ...cacheArgs, palette: palB, frameSeq: 3 });
    assert(
        surfacesCreated > bakedAfterFrame1,
        "Palette change must invalidate and re-bake offscreen cache",
    );
});
