import type { BotanicalSpecies } from "@shared/wallpaper.ts";
import type { SolarTermInfo } from "../solar-terms.ts";
import type { BotanicalRenderCache } from "./cache.ts";

export type ConcreteBotanicalSpecies = Exclude<BotanicalSpecies, "auto">;

export type Rgb = readonly [number, number, number];
export type TintRole = "ink" | "accent" | "sub";

export interface Point2D {
    x: number;
    y: number;
}

export interface BranchSample {
    x: number;
    y: number;
    lx: number;
    ly: number;
    angle: number;
    u: number;
    localFlex: number;
}

export interface WorldSample {
    x: number;
    y: number;
    angle: number;
    dAngle: number;
}

export interface BranchParentRef {
    branch: BranchData;
    idx: number;
}

export interface BranchData {
    points: BranchSample[];
    widthStart: number;
    widthEnd: number;
    t0: number;
    t1: number;
    phase: number;
    waveLag?: number;
    ghost: boolean;
    midground?: boolean;
    brushStyle?: "standard" | "iron-plum";
    twistU?: number;
    snowCushions?: boolean;
    parentRef: BranchParentRef | null;
    frameId: number;
    worldCache: WorldSample[] | null;
    tipPush?: number;
    tipVel?: number;
}

export interface RockStroke {
    points: Point2D[];
    mossDots: Array<
        { x: number; y: number; rx: number; ry: number; rot: number }
    >;
    t0: number;
    t1: number;
}

export interface BaseOrnament {
    branch: BranchData;
    idx: number;
    ghost: boolean;
    midground?: boolean;
    t0: number;
    t1: number;
    phase: number;
    angleOffset: number;
    tint: TintRole;
    profile: boolean;
    push: number;
    vel: number;
}

export interface GinkgoOrnament extends BaseOrnament {
    kind: "ginkgo";
    size: number;
    notch: number;
    stemLen: number;
}

export interface EucalyptusOrnament extends BaseOrnament {
    kind: "eucalyptus";
    rx: number;
    ry: number;
    stemLen: number;
}

export interface PlumOrnament extends BaseOrnament {
    kind: "plumBlossom" | "plumBud";
    size: number;
    rotation: number;
    pose?: "frontal" | "side" | "upward" | "back";
}

export interface FernPinnaOrnament extends BaseOrnament {
    kind: "fernPinna";
    side: -1 | 1;
    len: number;
    width: number;
    curve: number;
    inkWeight: number;
    whip: number;
    feibai: boolean;
}

export interface MapleLeafOrnament extends BaseOrnament {
    kind: "mapleLeaf";
    size: number;
    stemLen: number;
    rotation: number;
}

export type BotanicalOrnament =
    | GinkgoOrnament
    | EucalyptusOrnament
    | PlumOrnament
    | FernPinnaOrnament
    | MapleLeafOrnament;

export interface Drifter {
    species: ConcreteBotanicalSpecies;
    x: number;
    y: number;
    vx: number;
    vy: number;
    rot: number;
    vrot: number;
    phase: number;
    size: number;
    tint: TintRole;
    born: number;
    life: number;
}

export interface FireflySeed {
    x: number;
    y: number;
    phase: number;
    speed: number;
}

export type BotanicalVisitorAnchor =
    | {
        kind: "sparrow";
        branch: BranchData;
        idx: number;
        fireflies: readonly FireflySeed[];
    }
    | {
        kind: "ladybug";
        branch: BranchData;
        idx: number;
        angleOffset: number;
        leafSize: number;
        fireflies: readonly FireflySeed[];
    }
    | {
        kind: "dew-or-firefly";
        branch: BranchData;
        idx: number;
        tipOffsetX: number;
        tipOffsetY: number;
        ornament?: FernPinnaOrnament | EucalyptusOrnament;
        fireflies: readonly FireflySeed[];
    };

export interface BotanicalRewardAnchor {
    kind: ConcreteBotanicalSpecies;
    branch: BranchData;
    idx: number;
    budIndices: readonly number[];
}

export interface BotanicalRuntimeState {
    breezeImpulseStartSec: number;
    breezeImpulseStrength: number;
    awakened: boolean;
    awakenStartSec: number;
    haloPulseStartSec: number;
    visitorMode: "perched" | "departing" | "returning";
    visitorStateStartSec: number;
    visitorX: number;
    visitorY: number;
    visitorVx: number;
    visitorVy: number;
    dewState: "hanging" | "falling" | "ripple" | "regrowing";
    dewStateStartSec: number;
    dewFallDist: number;
    dewImpactX: number;
    dewImpactY: number;
    fireflyBoostStartSec: number;
    gustStartSec: number;
    gustDurationSec: number;
    gustStrength: number;
    gustCount: number;
    nextGustSec: number;
    lastInteractionSec: number;
    windPos: number;
    windVel: number;
    fireflySimSec: number;
}

export type BotanicalArchetype = 0 | 1 | 2;

export interface BotanicalViewportMetrics {
    sceneWidth: number;
    sceneHeight: number;
    renderScale: number;
}

export type BotanicalPhotoStyle = "xuan" | "silk-wash" | "gongbi-line";

export interface BotanicalPalette {
    isDark: boolean;
    overPhoto: boolean;
    photoStyle: BotanicalPhotoStyle;
    solidSurface: boolean;
    stroke: (tint: TintRole, alpha?: number) => string;
    vein: (tint: TintRole, alpha?: number) => string;
    fill: (tint: TintRole, alpha?: number) => string;
    wash: (tint: TintRole, alpha?: number) => string;
    waterline: (tint: TintRole, alpha?: number) => string;
    inkGrade: (
        grade: "jiao" | "nong" | "zhong" | "dan" | "qing",
        alpha?: number,
    ) => string;
    goldDust: (alpha?: number) => string;
    highlight: (alpha?: number) => string;
    luminous: (alpha?: number) => string;
}

export interface BotanicalDockInsets {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
}

export interface BotanicalPointerState {
    x: number;
    y: number;
    vx: number;
    vy: number;
    lastT: number;
    lastRustleSpawn: number;
}

export interface GenerateBotanicalSceneOptions {
    sceneSide?: "left" | "right";
    archetype?: BotanicalArchetype;
}

export interface BotanicalSceneGenContext {
    readonly w: number;
    readonly h: number;
    readonly S: number;
    readonly isNarrow: boolean;
    readonly isWide: boolean;
    readonly embedded: boolean;
    readonly archetype: BotanicalArchetype;
    readonly solar: SolarTermInfo;
    readonly rng: () => number;
    readonly rand: (lo: number, hi: number) => number;
    readonly rootX: number;
    readonly rootY: number;
    readonly dockTop: number;
    readonly dockRight: number;
    readonly dockBottom: number;
    readonly topShift: number;
    readonly narrowRootY: number;
    readonly branches: BranchData[];
    readonly ornaments: BotanicalOrnament[];
    readonly rocks: RockStroke[];
}

export interface BotanicalSpeciesModule {
    readonly species: ConcreteBotanicalSpecies;
    readonly populateEchoOrnaments: (
        ctx: BotanicalSceneGenContext,
        echo: BranchData,
        echoScale: number,
    ) => void;
    readonly generateMain: (ctx: BotanicalSceneGenContext) => void;
    readonly buildAnchors: (
        ctx: BotanicalSceneGenContext,
        fgBranches: readonly BranchData[],
        fireflies: readonly FireflySeed[],
    ) => {
        visitorAnchor: BotanicalVisitorAnchor | null;
        rewardAnchor: BotanicalRewardAnchor | null;
    };
    readonly drawOrnament: (
        ctx: CanvasRenderingContext2D,
        o: BotanicalOrnament,
        wx: number,
        wy: number,
        angle: number,
        op: number,
        pal: BotanicalPalette,
        layerA: number,
    ) => void;
    readonly traceDrifterPath: (
        ctx: CanvasRenderingContext2D,
        size: number,
    ) => void;
    readonly drawReward: (
        ctx: CanvasRenderingContext2D,
        scene: BotanicalScene,
        reward: BotanicalRewardAnchor,
        tipPt: WorldSample,
        bloomP: number,
        pal: BotanicalPalette,
        evalBranch: (branch: BranchData) => WorldSample[],
    ) => void;
}

export interface BotanicalSceneBounds {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
}

export interface BotanicalScene {
    species: ConcreteBotanicalSpecies;
    readonly module: BotanicalSpeciesModule;
    side: "left" | "right";
    archetype: BotanicalArchetype;
    visitorPresent: boolean;
    branches: BranchData[];
    ornaments: BotanicalOrnament[];
    rocks: RockStroke[];
    scale: number;
    visitorAnchor: BotanicalVisitorAnchor | null;
    rewardAnchor: BotanicalRewardAnchor | null;
    bounds?: BotanicalSceneBounds;
    fgSpeckBranches?: readonly BranchData[];
    dewOrnIndex?: number;
}

export interface BotanicalRenderParams {
    ctx: CanvasRenderingContext2D;
    scene: BotanicalScene;
    width: number;
    height: number;
    timeSec: number;
    dt: number;
    rawProgress: number;
    reducedMotion: boolean;
    windCalm: number;
    searchFocused: boolean;
    embedded: boolean;
    palette: BotanicalPalette;
    pointer: BotanicalPointerState;
    drifters: Drifter[];
    lastDriftSpawn: number;
    frameSeq: number;
    runtime?: BotanicalRuntimeState;
    sceneSide?: "left" | "right";
    forceVisitor?: boolean;
    cache?: BotanicalRenderCache;
    dpr?: number;
}
