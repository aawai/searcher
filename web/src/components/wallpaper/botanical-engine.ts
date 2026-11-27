import type { BotanicalSpecies } from "@shared/wallpaper.ts";
import type { BotanicalResonanceKind } from "./botanical-resonance.ts";

export type ConcreteBotanicalSpecies = Exclude<BotanicalSpecies, "auto">;

type Rgb = readonly [number, number, number];
type TintRole = "ink" | "accent" | "sub";

interface Point2D {
    x: number;
    y: number;
}

interface BranchSample {
    x: number;
    y: number;
    lx: number;
    ly: number;
    angle: number;
    u: number;
    localFlex: number;
}

interface WorldSample {
    x: number;
    y: number;
    angle: number;
    dAngle: number;
}

interface BranchParentRef {
    branch: BranchData;
    idx: number;
}

interface BranchData {
    points: BranchSample[];
    widthStart: number;
    widthEnd: number;
    t0: number;
    t1: number;
    phase: number;
    waveLag?: number;
    ghost: boolean;
    bambooNodes?: readonly number[];
    snowCushions?: boolean;
    parentRef: BranchParentRef | null;
    frameId: number;
    worldCache: WorldSample[] | null;
}

interface BaseOrnament {
    branch: BranchData;
    idx: number;
    ghost: boolean;
    t0: number;
    t1: number;
    phase: number;
    angleOffset: number;
    tint: TintRole;
    profile: boolean;
    push: number;
    vel: number;
}

interface GinkgoOrnament extends BaseOrnament {
    kind: "ginkgo";
    size: number;
    notch: number;
    stemLen: number;
}

interface EucalyptusOrnament extends BaseOrnament {
    kind: "eucalyptus";
    rx: number;
    ry: number;
    stemLen: number;
}

interface PlumOrnament extends BaseOrnament {
    kind: "plumBlossom" | "plumBud";
    size: number;
    rotation: number;
}

interface FernPinnaOrnament extends BaseOrnament {
    kind: "fernPinna";
    side: -1 | 1;
    len: number;
    width: number;
    curve: number;
    inkWeight: number;
    whip: number;
    feibai: boolean;
}

interface OrchidBlossomOrnament extends BaseOrnament {
    kind: "orchidBlossom";
    size: number;
    rotation: number;
}

interface BambooLeafOrnament extends BaseOrnament {
    kind: "bambooLeaf";
    len: number;
    width: number;
    curve: number;
    feibai: boolean;
}

interface MapleLeafOrnament extends BaseOrnament {
    kind: "mapleLeaf";
    size: number;
    stemLen: number;
    rotation: number;
}

type BotanicalOrnament =
    | GinkgoOrnament
    | EucalyptusOrnament
    | PlumOrnament
    | FernPinnaOrnament
    | OrchidBlossomOrnament
    | BambooLeafOrnament
    | MapleLeafOrnament;

interface Drifter {
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
        kind: "butterfly";
        branch: BranchData;
        idx: number;
        fireflies: readonly FireflySeed[];
    }
    | {
        kind: "dragonfly";
        branch: BranchData;
        idx: number;
        fireflies: readonly FireflySeed[];
    }
    | {
        kind: "dew-or-firefly";
        branch: BranchData;
        idx: number;
        tipOffsetX: number;
        tipOffsetY: number;
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
}

export function createBotanicalRuntimeState(): BotanicalRuntimeState {
    return {
        breezeImpulseStartSec: -999,
        breezeImpulseStrength: 0,
        awakened: false,
        awakenStartSec: -999,
        haloPulseStartSec: -999,
        visitorMode: "perched",
        visitorStateStartSec: -999,
        visitorX: 0,
        visitorY: 0,
        visitorVx: 0,
        visitorVy: 0,
        dewState: "hanging",
        dewStateStartSec: -999,
        dewFallDist: 0,
        dewImpactX: 0,
        dewImpactY: 0,
        fireflyBoostStartSec: -999,
    };
}

export interface BotanicalScene {
    species: ConcreteBotanicalSpecies;
    branches: BranchData[];
    ornaments: BotanicalOrnament[];
    scale: number;
    visitorAnchor: BotanicalVisitorAnchor | null;
    rewardAnchor: BotanicalRewardAnchor | null;
}

export interface BotanicalViewportMetrics {
    sceneWidth: number;
    sceneHeight: number;
    renderScale: number;
}

/**
 * Resolves the virtual coordinate space for botanical scene generation.
 * Embedded previews render a full desktop-proportioned scene (1440px wide)
 * scaled down to fit the preview container without cropping or distortion.
 */
export function resolveBotanicalViewport(
    width: number,
    height: number,
    embedded: boolean,
): BotanicalViewportMetrics {
    if (!embedded || width <= 0 || height <= 0) {
        return { sceneWidth: width, sceneHeight: height, renderScale: 1 };
    }
    const sceneWidth = 1440;
    const sceneHeight = Math.max(1, Math.round(sceneWidth * (height / width)));
    return {
        sceneWidth,
        sceneHeight,
        renderScale: width / sceneWidth,
    };
}

export interface BotanicalPalette {
    isDark: boolean;
    overPhoto: boolean;
    stroke: (tint: TintRole, alpha?: number) => string;
    vein: (tint: TintRole, alpha?: number) => string;
    fill: (tint: TintRole, alpha?: number) => string;
    wash: (tint: TintRole, alpha?: number) => string;
    highlight: (alpha?: number) => string;
}

export interface BotanicalPointerState {
    x: number;
    y: number;
    vx: number;
    vy: number;
    lastT: number;
    lastRustleSpawn: number;
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
    dateKey?: string;
    localHour?: number;
}

export interface SolarTermInfo {
    readonly term: string;
    readonly season: "spring" | "summer" | "autumn" | "winter";
    readonly isSnowSeason: boolean;
}

const SOLAR_TERMS_BY_MMDD: ReadonlyArray<{
    readonly mmdd: number;
    readonly term: string;
    readonly season: "spring" | "summer" | "autumn" | "winter";
}> = [
    { mmdd: 105, term: "小寒", season: "winter" },
    { mmdd: 120, term: "大寒", season: "winter" },
    { mmdd: 204, term: "立春", season: "spring" },
    { mmdd: 219, term: "雨水", season: "spring" },
    { mmdd: 306, term: "惊蛰", season: "spring" },
    { mmdd: 321, term: "春分", season: "spring" },
    { mmdd: 405, term: "清明", season: "spring" },
    { mmdd: 420, term: "谷雨", season: "spring" },
    { mmdd: 506, term: "立夏", season: "summer" },
    { mmdd: 521, term: "小满", season: "summer" },
    { mmdd: 606, term: "芒种", season: "summer" },
    { mmdd: 621, term: "夏至", season: "summer" },
    { mmdd: 707, term: "小暑", season: "summer" },
    { mmdd: 723, term: "大暑", season: "summer" },
    { mmdd: 807, term: "立秋", season: "autumn" },
    { mmdd: 823, term: "处暑", season: "autumn" },
    { mmdd: 907, term: "白露", season: "autumn" },
    { mmdd: 923, term: "秋分", season: "autumn" },
    { mmdd: 1008, term: "寒露", season: "autumn" },
    { mmdd: 1023, term: "霜降", season: "autumn" },
    { mmdd: 1107, term: "立冬", season: "winter" },
    { mmdd: 1122, term: "小雪", season: "winter" },
    { mmdd: 1207, term: "大雪", season: "winter" },
    { mmdd: 1222, term: "冬至", season: "winter" },
];

export function resolveSolarTerm(dateKey: string): SolarTermInfo {
    const match = dateKey.match(/^\d{4}-(\d{2})-(\d{2})$/);
    const mmdd = match ? Number(match[1]) * 100 + Number(match[2]) : 1122;
    let chosen = SOLAR_TERMS_BY_MMDD[SOLAR_TERMS_BY_MMDD.length - 1];
    for (const entry of SOLAR_TERMS_BY_MMDD) {
        if (mmdd >= entry.mmdd) chosen = entry;
    }
    const isSnowSeason = mmdd >= 1122 || mmdd < 219;
    return {
        term: chosen.term,
        season: chosen.season,
        isSnowSeason,
    };
}

export function resolveDiurnalWindScale(localHour?: number): number {
    if (localHour === undefined || !Number.isFinite(localHour)) return 1.0;
    const h = ((Math.floor(localHour) % 24) + 24) % 24;
    if (h >= 5 && h <= 8) return 0.92;
    if (h >= 9 && h <= 16) return 1.0;
    if (h >= 17 && h <= 19) return 0.86;
    if (h >= 20 && h <= 21) return 0.74;
    return 0.58;
}

const SEASONAL_SPECIES_POOLS: Readonly<
    Record<SolarTermInfo["season"], readonly ConcreteBotanicalSpecies[]>
> = {
    spring: ["orchid", "fern", "eucalyptus"],
    summer: ["bamboo", "fern", "eucalyptus"],
    autumn: ["ginkgo", "maple", "bamboo"],
    winter: ["plum", "bamboo", "eucalyptus"],
};

// Seasonal species pools are used by resolveBotanicalSpecies.

function hashString(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

function easeOutQuart(t: number): number {
    return 1 - Math.pow(1 - clamp(t, 0, 1), 4);
}

function _easeInOutQuad(t: number): number {
    const x = clamp(t, 0, 1);
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
    return [
        Math.round(lerp(a[0], b[0], t)),
        Math.round(lerp(a[1], b[1], t)),
        Math.round(lerp(a[2], b[2], t)),
    ];
}

function rgba(rgb: Rgb, a: number): string {
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${clamp(a, 0, 1).toFixed(4)})`;
}

function splitTopLevelComma(inner: string): [string, string] | null {
    let depth = 0;
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        else if (ch === "," && depth === 0) {
            return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
        }
    }
    return null;
}

function parseCssColorToRgb(
    value: string,
    fallback: Rgb,
    isDark = false,
): Rgb {
    const trimmed = value.trim();
    if (/^light-dark\(/i.test(trimmed) && trimmed.endsWith(")")) {
        const inner = trimmed.slice(trimmed.indexOf("(") + 1, -1);
        const parts = splitTopLevelComma(inner);
        if (parts) {
            return parseCssColorToRgb(
                isDark ? parts[1] : parts[0],
                fallback,
                isDark,
            );
        }
    }
    if (trimmed.startsWith("#")) {
        const hex = trimmed.slice(1);
        if (hex.length === 6) {
            const n = parseInt(hex, 16);
            if (Number.isFinite(n)) {
                return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
            }
        } else if (hex.length === 3) {
            const r = parseInt(hex[0] + hex[0], 16);
            const g = parseInt(hex[1] + hex[1], 16);
            const b = parseInt(hex[2] + hex[2], 16);
            if (
                Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)
            ) {
                return [r, g, b];
            }
        }
    }
    const rgbMatch = trimmed.match(
        /rgba?\(\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)\s*[, ]\s*(\d+(?:\.\d+)?)/i,
    );
    if (rgbMatch) {
        return [
            clamp(Math.round(Number(rgbMatch[1])), 0, 255),
            clamp(Math.round(Number(rgbMatch[2])), 0, 255),
            clamp(Math.round(Number(rgbMatch[3])), 0, 255),
        ];
    }
    return fallback;
}

function shiftHueRgb(rgb: Rgb, degrees: number): Rgb {
    const r = rgb[0] / 255;
    const g = rgb[1] / 255;
    const b = rgb[2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 2;
    if (d < 0.01) {
        return rgb;
    }
    const s = d / (1 - Math.abs(2 * l - 1));
    let h = 0;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + degrees + 360) % 360;

    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r1 = 0;
    let g1 = 0;
    let b1 = 0;
    if (h < 60) [r1, g1, b1] = [c, x, 0];
    else if (h < 120) [r1, g1, b1] = [x, c, 0];
    else if (h < 180) [r1, g1, b1] = [0, c, x];
    else if (h < 240) [r1, g1, b1] = [0, x, c];
    else if (h < 300) [r1, g1, b1] = [x, 0, c];
    else [r1, g1, b1] = [c, 0, x];

    return [
        clamp(Math.round((r1 + m) * 255), 0, 255),
        clamp(Math.round((g1 + m) * 255), 0, 255),
        clamp(Math.round((b1 + m) * 255), 0, 255),
    ];
}

export function formatLocalDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

export function resolveBotanicalSpecies(
    species: BotanicalSpecies,
    dateKey: string,
): ConcreteBotanicalSpecies {
    if (species !== "auto") return species;
    const { season } = resolveSolarTerm(dateKey);
    const pool = SEASONAL_SPECIES_POOLS[season];
    return pool[hashString(dateKey) % pool.length];
}

export function buildBotanicalPalette(
    isDark: boolean,
    accentCss: string,
    foregroundCss: string,
    overPhoto = false,
    localHour?: number,
): BotanicalPalette {
    const fallbackAccent: Rgb = isDark ? [93, 169, 255] : [10, 102, 194];
    const fallbackInk: Rgb = isDark ? [232, 234, 240] : [28, 30, 34];
    const rawAccRgb = parseCssColorToRgb(accentCss, fallbackAccent, isDark);
    const accRgb = isDark
        ? mixRgb(rawAccRgb, [212, 214, 224], 0.10)
        : mixRgb(rawAccRgb, [236, 232, 224], 0.12);
    const shiftedSub = shiftHueRgb(accRgb, -12);
    let subRgb = isDark
        ? mixRgb(shiftedSub, [186, 192, 206], 0.18)
        : mixRgb(shiftedSub, [244, 240, 234], 0.22);
    const baseInk = parseCssColorToRgb(foregroundCss, fallbackInk, isDark);

    // Moonlight silver-slate ink in dark mode; warm pine-soot ink in light mode
    const inkStrokeRgb = isDark
        ? mixRgb(mixRgb(baseInk, [194, 200, 212], 0.52), accRgb, 0.06)
        : mixRgb(mixRgb(baseInk, [44, 37, 31], 0.40), accRgb, 0.04);
    let inkWashRgb = isDark
        ? mixRgb(mixRgb(baseInk, [168, 178, 194], 0.50), accRgb, 0.08)
        : mixRgb(mixRgb(baseInk, [52, 58, 66], 0.36), accRgb, 0.06);

    if (localHour !== undefined && Number.isFinite(localHour)) {
        const h = ((Math.floor(localHour) % 24) + 24) % 24;
        if (h >= 17 && h <= 19) {
            const duskOchre: Rgb = isDark ? [196, 152, 118] : [188, 134, 88];
            subRgb = mixRgb(subRgb, duskOchre, 0.06);
            inkWashRgb = mixRgb(inkWashRgb, duskOchre, 0.06);
        } else if (h >= 5 && h <= 8) {
            const dawnMist: Rgb = isDark ? [154, 178, 208] : [142, 170, 198];
            subRgb = mixRgb(subRgb, dawnMist, 0.04);
            inkWashRgb = mixRgb(inkWashRgb, dawnMist, 0.04);
        }
    }

    const highlightRgb: Rgb = isDark ? [18, 19, 22] : [250, 248, 243];
    const harmony = isDark && overPhoto ? 0.52 : 1;

    const strokeA = (isDark ? 0.46 : 0.62) * harmony;
    const veinA = (isDark ? 0.28 : 0.34) * harmony;
    const fillA = (isDark ? 0.125 : 0.135) * harmony;
    const accA = (isDark ? 0.82 : 0.78) * harmony;
    const accFill = (isDark ? 0.30 : 0.27) * harmony;
    const subA = (isDark ? 0.66 : 0.64) * harmony;
    const subFill = (isDark ? 0.23 : 0.21) * harmony;

    const accWash = (isDark ? 0.42 : 0.40) * harmony;
    const subWash = (isDark ? 0.32 : 0.29) * harmony;
    const inkWash = (isDark ? 0.21 : 0.23) * harmony;

    return {
        isDark,
        overPhoto,
        stroke: (tint, a = 1) => {
            if (tint === "accent") return rgba(accRgb, accA * a);
            if (tint === "sub") return rgba(subRgb, subA * a);
            return rgba(inkStrokeRgb, strokeA * a);
        },
        vein: (tint, a = 1) => {
            if (tint === "accent") return rgba(accRgb, accA * 0.54 * a);
            if (tint === "sub") return rgba(subRgb, subA * 0.54 * a);
            return rgba(inkStrokeRgb, veinA * a);
        },
        fill: (tint, a = 1) => {
            if (tint === "accent") return rgba(accRgb, accFill * a);
            if (tint === "sub") return rgba(subRgb, subFill * a);
            return rgba(inkWashRgb, fillA * a);
        },
        wash: (tint, a = 1) => {
            if (tint === "accent") return rgba(accRgb, accWash * a);
            if (tint === "sub") return rgba(subRgb, subWash * a);
            return rgba(inkWashRgb, inkWash * a);
        },
        highlight: (a = 1) => rgba(highlightRgb, 0.72 * a),
    };
}

function cubicPoint(
    p0: Point2D,
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    t: number,
): Point2D {
    const u = 1 - t;
    const tt = t * t;
    const uu = u * u;
    return {
        x: uu * u * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x +
            tt * t * p3.x,
        y: uu * u * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y +
            tt * t * p3.y,
    };
}

function cubicTangent(
    p0: Point2D,
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    t: number,
): number {
    const u = 1 - t;
    const dx = 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) +
        3 * t * t * (p3.x - p2.x);
    const dy = 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) +
        3 * t * t * (p3.y - p2.y);
    return Math.atan2(dy, dx);
}

function _strokeProgressive(
    ctx: CanvasRenderingContext2D,
    perim: number,
    progress: number,
): void {
    if (progress >= 0.995) {
        ctx.stroke();
        return;
    }
    const drawLen = Math.max(0.5, perim * clamp(progress, 0, 1));
    ctx.setLineDash([drawLen, perim + 16]);
    ctx.stroke();
    ctx.setLineDash([]);
}

interface SampleBranchOpts {
    steps?: number;
    widthStart: number;
    widthEnd: number;
    t0: number;
    t1: number;
    flexSpan?: number;
    phase?: number;
    waveLag?: number;
    ghost?: boolean;
    bambooNodes?: readonly number[];
    snowCushions?: boolean;
    wobble?: number;
    parentRef?: BranchParentRef | null;
}

function sampleBranch(
    p0: Point2D,
    p1: Point2D,
    p2: Point2D,
    p3: Point2D,
    opts: SampleBranchOpts,
    rng: () => number,
): BranchData {
    const steps = opts.steps ?? 36;
    const points: BranchSample[] = [];
    const wobble = opts.wobble ?? 0;
    const phaseW = rng() * 6.28;
    for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const pt = cubicPoint(p0, p1, p2, p3, u);
        const ang = cubicTangent(p0, p1, p2, p3, u);
        const env = Math.sin(u * Math.PI);
        const off = wobble
            ? Math.sin(u * Math.PI * 2.8 + phaseW) * wobble * env
            : 0;
        const rx = pt.x - Math.sin(ang) * off;
        const ry = pt.y + Math.cos(ang) * off;
        points.push({
            x: rx,
            y: ry,
            lx: rx - p0.x,
            ly: ry - p0.y,
            angle: ang,
            u,
            localFlex: Math.pow(u, 1.55) * (opts.flexSpan ?? 1.0),
        });
    }
    return {
        points,
        widthStart: opts.widthStart,
        widthEnd: opts.widthEnd,
        t0: opts.t0,
        t1: opts.t1,
        phase: opts.phase ?? 0,
        waveLag: opts.waveLag,
        ghost: Boolean(opts.ghost),
        bambooNodes: opts.bambooNodes,
        snowCushions: opts.snowCushions,
        parentRef: opts.parentRef ?? null,
        frameId: -1,
        worldCache: null,
    };
}

export function generateBotanicalScene(
    species: ConcreteBotanicalSpecies,
    w: number,
    h: number,
    dateKey: string,
    embedded = false,
): BotanicalScene {
    const rng = mulberry32(hashString(`${dateKey}:${species}:v6`));
    const rand = (lo: number, hi: number) => lo + rng() * (hi - lo);
    const isNarrow = !embedded && w < 720;
    const isWide = embedded || w >= 1024;
    const S = isNarrow
        ? clamp(Math.min(w / 500, h / 860), 0.62, 0.82)
        : clamp(Math.min(w / 1440, h / 900), 0.56, 1.18);

    const branches: BranchData[] = [];
    const ornaments: BotanicalOrnament[] = [];
    const narrowRootY = h - Math.max(92, h * 0.115);
    const rootX = isNarrow ? w + 10 * S : w + 16 * S;
    const rootY = isNarrow ? narrowRootY : h + 16 * S;

    if (isWide || isNarrow) {
        const echoScale = isNarrow ? 0.9 : 1;
        const tr0 = isNarrow
            ? { x: w + 8, y: rand(215, 235) * S }
            : { x: w + 10, y: rand(96, 118) * S };
        const tr3 = isNarrow
            ? {
                x: w - rand(130, 158) * S,
                y: tr0.y + rand(72, 92) * S,
            }
            : {
                x: w - rand(180, 225) * S,
                y: tr0.y + rand(112, 142) * S,
            };
        const echo = sampleBranch(
            tr0,
            {
                x: tr0.x - (isNarrow ? 50 : 75) * S,
                y: tr0.y + (isNarrow ? 6 : 8) * S,
            },
            {
                x: tr3.x + (isNarrow ? 42 : 65) * S,
                y: tr3.y - (isNarrow ? 30 : 46) * S,
            },
            tr3,
            {
                steps: 26,
                widthStart: (isNarrow ? 1.05 : 1.3) * S,
                widthEnd: 0.42 * S,
                t0: 0.22,
                t1: 0.62,
                flexSpan: 0.95,
                phase: 2.6,
                ghost: true,
                wobble: 0.9 * S * echoScale,
            },
            rng,
        );
        branches.push(echo);

        if (species === "ginkgo") {
            const echoLeaves: ReadonlyArray<{
                u: number;
                ang: number;
                sz: number;
                tint: TintRole;
                profile: boolean;
            }> = [
                { u: 0.42, ang: 0.65, sz: 34, tint: "ink", profile: true },
                { u: 0.72, ang: -0.58, sz: 38, tint: "sub", profile: false },
                { u: 0.98, ang: 0.18, sz: 32, tint: "ink", profile: false },
            ];
            for (const lf of echoLeaves) {
                const idx = Math.round(lf.u * (echo.points.length - 1));
                ornaments.push({
                    kind: "ginkgo",
                    ghost: true,
                    branch: echo,
                    idx,
                    angleOffset: lf.ang,
                    size: lf.sz * S * echoScale,
                    notch: 0.22,
                    stemLen: 12 * S * echoScale,
                    tint: lf.tint,
                    profile: lf.profile,
                    t0: lerp(echo.t0, echo.t1, lf.u) + 0.04,
                    t1: lerp(echo.t0, echo.t1, lf.u) + 0.34,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            }
        } else if (species === "eucalyptus") {
            const us = [0.34, 0.56, 0.76, 0.95];
            us.forEach((u, i) => {
                const idx = Math.round(u * (echo.points.length - 1));
                const sz = lerp(23, 12, i / 3) * S * echoScale;
                for (const side of [-1, 1] as const) {
                    if (i === 3 && side === -1) continue;
                    ornaments.push({
                        kind: "eucalyptus",
                        ghost: true,
                        branch: echo,
                        idx,
                        angleOffset: i === 3 ? 0.08 : side * 0.85,
                        rx: sz,
                        ry: sz * (i === 1 ? 0.55 : 0.82),
                        stemLen: 5 * S * echoScale,
                        tint: i === 2 && side === 1 ? "sub" : "ink",
                        profile: i === 1 && side === -1,
                        t0: lerp(echo.t0, echo.t1, u) + 0.04,
                        t1: lerp(echo.t0, echo.t1, u) + 0.28,
                        phase: rand(0, 6.28),
                        push: 0,
                        vel: 0,
                    });
                }
            });
        } else if (species === "plum") {
            const echoPlums: ReadonlyArray<{
                u: number;
                kind: "plumBlossom" | "plumBud";
                sz: number;
                ang: number;
                tint: TintRole;
            }> = [
                {
                    u: 0.44,
                    kind: "plumBlossom",
                    sz: 16,
                    ang: 0.65,
                    tint: "sub",
                },
                {
                    u: 0.74,
                    kind: "plumBlossom",
                    sz: 13,
                    ang: -0.55,
                    tint: "accent",
                },
                {
                    u: 0.96,
                    kind: "plumBud",
                    sz: 4.8,
                    ang: 0.15,
                    tint: "accent",
                },
            ];
            for (const sp of echoPlums) {
                const idx = Math.round(sp.u * (echo.points.length - 1));
                ornaments.push({
                    kind: sp.kind,
                    ghost: true,
                    branch: echo,
                    idx,
                    angleOffset: sp.ang,
                    size: sp.sz * S * echoScale,
                    rotation: rand(0, 6.28),
                    tint: sp.tint,
                    profile: false,
                    t0: lerp(echo.t0, echo.t1, sp.u) + 0.06,
                    t1: lerp(echo.t0, echo.t1, sp.u) + 0.34,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            }
        } else if (species === "fern") {
            const echoPairs = 5;
            for (let i = 1; i <= echoPairs; i++) {
                const rawT = i / echoPairs;
                const easedT = 1 - Math.pow(1 - rawT, 1.15);
                const u = lerp(0.24, 0.88, easedT);
                const idx = Math.round(u * (echo.points.length - 1));
                const env = Math.sin(Math.pow(u, 0.70) * Math.PI);
                const pl = 66 * S * echoScale * (0.28 + env * 0.78);
                const ts = lerp(echo.t0, echo.t1, u) + 0.02;
                for (const side of [-1, 1] as const) {
                    const jIdx = clamp(
                        idx + (side > 0 ? 0 : -1),
                        2,
                        echo.points.length - 2,
                    );
                    const actualLen = pl * (side > 0 ? 0.94 : 1.02);
                    ornaments.push({
                        kind: "fernPinna",
                        ghost: true,
                        branch: echo,
                        idx: jIdx,
                        side,
                        angleOffset: side * lerp(0.84, 0.34, u),
                        len: actualLen,
                        width: actualLen * 0.105,
                        curve: side * -0.18,
                        inkWeight: i % 2 === 0 ? 0.76 : 0.96,
                        whip: side * 0.07,
                        feibai: false,
                        tint: i === echoPairs ? "sub" : "ink",
                        profile: i === 2 && side === 1,
                        t0: ts,
                        t1: ts + 0.24,
                        phase: u * 3.5 + side * 0.3,
                        push: 0,
                        vel: 0,
                    });
                }
            }
            ornaments.push({
                kind: "fernPinna",
                ghost: true,
                branch: echo,
                idx: echo.points.length - 1,
                side: 1,
                angleOffset: 0.03,
                len: 42 * S * echoScale,
                width: 4.2 * S * echoScale,
                curve: -0.10,
                inkWeight: 0.92,
                whip: 0.06,
                feibai: false,
                tint: "sub",
                profile: false,
                t0: echo.t1 - 0.02,
                t1: echo.t1 + 0.22,
                phase: 4.2,
                push: 0,
                vel: 0,
            });
        } else if (species === "orchid") {
            const echoBlades: ReadonlyArray<{
                u: number;
                ang: number;
                len: number;
                tint: TintRole;
            }> = [
                { u: 0.42, ang: 0.45, len: 68, tint: "ink" },
                { u: 0.72, ang: -0.35, len: 74, tint: "sub" },
            ];
            for (const eb of echoBlades) {
                const idx = Math.round(eb.u * (echo.points.length - 1));
                ornaments.push({
                    kind: "fernPinna",
                    ghost: true,
                    branch: echo,
                    idx,
                    side: 1,
                    angleOffset: eb.ang,
                    len: eb.len * S * echoScale,
                    width: 6.2 * S * echoScale,
                    curve: -0.22,
                    inkWeight: 0.85,
                    whip: 0.08,
                    feibai: false,
                    tint: eb.tint,
                    profile: false,
                    t0: lerp(echo.t0, echo.t1, eb.u) + 0.04,
                    t1: lerp(echo.t0, echo.t1, eb.u) + 0.30,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            }
            ornaments.push({
                kind: "orchidBlossom",
                ghost: true,
                branch: echo,
                idx: echo.points.length - 1,
                angleOffset: 0.1,
                size: 14 * S * echoScale,
                rotation: rand(0, 6.28),
                tint: "sub",
                profile: false,
                t0: echo.t1,
                t1: echo.t1 + 0.28,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        } else if (species === "bamboo") {
            const echoNodes = [0.35, 0.65, 0.94];
            echoNodes.forEach((u, ni) => {
                const idx = Math.round(u * (echo.points.length - 1));
                for (let li = 0; li < 2; li++) {
                    ornaments.push({
                        kind: "bambooLeaf",
                        ghost: true,
                        branch: echo,
                        idx,
                        angleOffset: (li === 0 ? 0.55 : -0.45) + ni * 0.08,
                        len: (38 - li * 8) * S * echoScale,
                        width: 5.5 * S * echoScale,
                        curve: li === 0 ? 0.16 : -0.14,
                        feibai: false,
                        tint: ni === 2 && li === 0 ? "sub" : "ink",
                        profile: false,
                        t0: lerp(echo.t0, echo.t1, u) + 0.04,
                        t1: lerp(echo.t0, echo.t1, u) + 0.28,
                        phase: rand(0, 6.28),
                        push: 0,
                        vel: 0,
                    });
                }
            });
        } else if (species === "maple") {
            const echoMaples: ReadonlyArray<{
                u: number;
                ang: number;
                sz: number;
                tint: TintRole;
            }> = [
                { u: 0.45, ang: 0.55, sz: 20, tint: "ink" },
                { u: 0.78, ang: -0.42, sz: 24, tint: "sub" },
                { u: 0.98, ang: 0.15, sz: 18, tint: "accent" },
            ];
            for (const em of echoMaples) {
                const idx = Math.round(em.u * (echo.points.length - 1));
                ornaments.push({
                    kind: "mapleLeaf",
                    ghost: true,
                    branch: echo,
                    idx,
                    angleOffset: em.ang,
                    size: em.sz * S * echoScale,
                    stemLen: 10 * S * echoScale,
                    rotation: rand(-0.4, 0.4),
                    tint: em.tint,
                    profile: false,
                    t0: lerp(echo.t0, echo.t1, em.u) + 0.05,
                    t1: lerp(echo.t0, echo.t1, em.u) + 0.32,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            }
        }
    }

    if (species === "ginkgo") {
        const ginkgoLeafScale = isNarrow ? 0.84 : 1;
        const g0 = isNarrow
            ? { x: rootX - 6 * S, y: rootY - 26 * S }
            : { x: rootX - 10 * S, y: rootY - 70 * S };
        const g3 = isNarrow
            ? {
                x: w - rand(105, 138) * S,
                y: rootY - rand(195, 225) * S,
            }
            : {
                x: w - rand(160, 215) * S,
                y: h - rand(460, 525) * S,
            };
        const ghost = sampleBranch(
            g0,
            {
                x: g0.x - (isNarrow ? 28 : 45) * S,
                y: g0.y - (isNarrow ? 105 : 195) * S,
            },
            {
                x: g3.x + (isNarrow ? 42 : 68) * S,
                y: g3.y + (isNarrow ? 65 : 115) * S,
            },
            g3,
            {
                steps: 28,
                widthStart: (isNarrow ? 1.1 : 1.25) * S,
                widthEnd: 0.45 * S,
                t0: 0.08,
                t1: 0.52,
                flexSpan: 1.05,
                phase: 1.8,
                ghost: true,
                wobble: 1.3 * S * ginkgoLeafScale,
            },
            rng,
        );
        branches.push(ghost);
        [0.52, 0.78, 1.0].forEach((u, i) => {
            const idx = Math.round(u * (ghost.points.length - 1));
            ornaments.push({
                kind: "ginkgo",
                ghost: true,
                branch: ghost,
                idx,
                angleOffset: i % 2 === 0 ? -0.62 : 0.52,
                size: rand(35, 43) * S * ginkgoLeafScale,
                notch: rand(0.18, 0.28),
                stemLen: rand(12, 18) * S * ginkgoLeafScale,
                tint: i === 2 ? "sub" : "ink",
                profile: i === 1,
                t0: lerp(ghost.t0, ghost.t1, u) + 0.05,
                t1: lerp(ghost.t0, ghost.t1, u) + 0.34,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });

        const mainLen = (isNarrow ? 250 : 590) * S;
        const p0 = isNarrow
            ? { x: rootX - rand(10, 22) * S, y: rootY }
            : { x: rootX - rand(52, 95) * S, y: rootY };
        const p3 = isNarrow
            ? {
                x: w - rand(225, 260) * S,
                y: rootY - rand(195, 225) * S,
            }
            : {
                x: w - rand(300, 375) * S,
                y: h - mainLen * rand(0.75, 0.85),
            };
        const p1 = {
            x: p0.x - (isNarrow ? rand(24, 48) : rand(42, 84)) * S,
            y: p0.y - mainLen * 0.34,
        };
        const p2 = {
            x: p3.x + (isNarrow ? rand(48, 78) : rand(84, 136)) * S,
            y: p3.y + mainLen * 0.26,
        };

        const main = sampleBranch(
            p0,
            p1,
            p2,
            p3,
            {
                steps: 40,
                widthStart: (isNarrow ? 2.1 : 2.55) * S,
                widthEnd: 0.75 * S,
                t0: 0.0,
                t1: 0.46,
                flexSpan: 0.95,
                phase: 0,
                wobble: 1.4 * S * ginkgoLeafScale,
            },
            rng,
        );
        branches.push(main);

        const subs = isNarrow
            ? [
                { u: 0.28, dir: -1, len: 128 * S, lift: 68 * S },
                { u: 0.48, dir: 1, len: 106 * S, lift: 72 * S },
                { u: 0.66, dir: -1, len: 96 * S, lift: 52 * S },
                { u: 0.82, dir: 1, len: 72 * S, lift: 44 * S },
            ]
            : [
                { u: 0.28, dir: -1, len: 215 * S, lift: 115 * S },
                { u: 0.48, dir: 1, len: 180 * S, lift: 120 * S },
                { u: 0.66, dir: -1, len: 168 * S, lift: 85 * S },
                { u: 0.82, dir: 1, len: 118 * S, lift: 72 * S },
            ];
        const subTints:
            readonly (readonly [TintRole, TintRole, TintRole, TintRole])[] = [
                ["accent", "ink", "sub", "ink"],
                ["ink", "ink", "sub", "ink"],
                ["ink", "ink", "accent", "ink"],
                ["ink", "sub", "ink", "ink"],
            ];

        subs.forEach((cfg, si) => {
            const bi = Math.round(cfg.u * (main.points.length - 1));
            const anc = main.points[bi];
            const ang = anc.angle + cfg.dir * rand(0.42, 0.66);
            const sp0 = { x: anc.x, y: anc.y };
            const sp3 = {
                x: anc.x + Math.cos(ang) * cfg.len,
                y: anc.y + Math.sin(ang) * cfg.len - cfg.lift * 0.25,
            };
            const sp1 = {
                x: lerp(sp0.x, sp3.x, 0.36) + cfg.dir * 13 * S,
                y: lerp(sp0.y, sp3.y, 0.36) - 18 * S,
            };
            const sp2 = {
                x: lerp(sp0.x, sp3.x, 0.72),
                y: lerp(sp0.y, sp3.y, 0.72) - 10 * S,
            };
            const ts = lerp(main.t0, main.t1, cfg.u);
            const sub = sampleBranch(
                sp0,
                sp1,
                sp2,
                sp3,
                {
                    steps: 24,
                    widthStart: 1.45 * S,
                    widthEnd: 0.52 * S,
                    t0: ts,
                    t1: ts + 0.24,
                    flexSpan: 0.55,
                    phase: 0.7 + si * 0.8,
                    wobble: 1.0 * S,
                    parentRef: { branch: main, idx: bi },
                },
                rng,
            );
            branches.push(sub);

            const tSet = subTints[si];
            const clusters = [
                {
                    u: 0.54,
                    leaves: [
                        {
                            ang: cfg.dir * 0.76,
                            sz: 42,
                            tint: tSet[0],
                            profile: false,
                        },
                        {
                            ang: cfg.dir * 0.34,
                            sz: 34,
                            tint: tSet[1],
                            profile: true,
                        },
                    ],
                },
                {
                    u: 0.96,
                    leaves: [
                        { ang: -0.22, sz: 46, tint: tSet[2], profile: false },
                        {
                            ang: 0.42,
                            sz: 37,
                            tint: tSet[3],
                            profile: si % 2 === 0,
                        },
                    ],
                },
            ];
            for (const cl of clusters) {
                const lIdx = Math.round(cl.u * (sub.points.length - 1));
                const lt = lerp(sub.t0, sub.t1, cl.u) + 0.03;
                cl.leaves.forEach((lf, li) => {
                    ornaments.push({
                        kind: "ginkgo",
                        ghost: false,
                        branch: sub,
                        idx: lIdx,
                        angleOffset: lf.ang + rand(-0.08, 0.08),
                        size: lf.sz * rand(0.92, 1.08) * S * ginkgoLeafScale,
                        notch: rand(0.18, 0.28),
                        stemLen: rand(12, 19) * S * ginkgoLeafScale,
                        tint: lf.tint,
                        profile: lf.profile,
                        t0: lt + li * 0.05,
                        t1: lt + 0.36 + li * 0.05,
                        phase: rand(0, 6.28),
                        push: 0,
                        vel: 0,
                    });
                });
            }
        });

        const topLeaves: ReadonlyArray<{
            u: number;
            ang: number;
            sz: number;
            tint: TintRole;
            profile: boolean;
        }> = [
            { u: 0.93, ang: -0.50, sz: 40, tint: "ink", profile: true },
            { u: 1.00, ang: 0.08, sz: 45, tint: "accent", profile: false },
        ];
        topLeaves.forEach((ls, li) => {
            const lIdx = Math.round(ls.u * (main.points.length - 1));
            ornaments.push({
                kind: "ginkgo",
                ghost: false,
                branch: main,
                idx: lIdx,
                angleOffset: ls.ang,
                size: ls.sz * S * ginkgoLeafScale,
                notch: rand(0.18, 0.28),
                stemLen: rand(13, 19) * S * ginkgoLeafScale,
                tint: ls.tint,
                profile: ls.profile,
                t0: main.t1 - 0.04 + li * 0.06,
                t1: main.t1 + 0.34 + li * 0.06,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });
    } else if (species === "eucalyptus") {
        const eucLeafScale = isNarrow ? 0.86 : 1;
        const configs = isNarrow
            ? [
                {
                    ghost: true,
                    len: 255,
                    rx: 4,
                    tx: 135,
                    ty: 0.86,
                    count: 6,
                    t0: 0.12,
                },
                {
                    ghost: false,
                    len: 310,
                    rx: 14,
                    tx: 255,
                    ty: 0.72,
                    count: 8,
                    t0: 0.00,
                },
            ]
            : [
                {
                    ghost: true,
                    len: 460,
                    rx: 14,
                    tx: 130,
                    ty: 0.92,
                    count: 8,
                    t0: 0.10,
                },
                {
                    ghost: false,
                    len: 645,
                    rx: 98,
                    tx: 445,
                    ty: 0.72,
                    count: 10,
                    t0: 0.00,
                },
                {
                    ghost: false,
                    len: 500,
                    rx: 26,
                    tx: 225,
                    ty: 0.88,
                    count: 8,
                    t0: 0.14,
                },
            ];

        configs.forEach((cfg, ci) => {
            const len = cfg.len * S;
            const p0 = {
                x: rootX - cfg.rx * S,
                y: isNarrow ? rootY + 6 * S : rootY + 12 * S,
            };
            const p3 = {
                x: w - cfg.tx * S * rand(0.95, 1.05),
                y: (isNarrow ? rootY : h) - len * cfg.ty,
            };
            const p1 = {
                x: p0.x - (isNarrow ? rand(28, 48) : rand(45, 80)) * S,
                y: p0.y - len * 0.45,
            };
            const p2 = {
                x: p3.x + (isNarrow ? rand(75, 110) : rand(125, 180)) * S,
                y: p3.y - (isNarrow ? rand(10, 24) : rand(16, 42)) * S,
            };

            const stem = sampleBranch(
                p0,
                p1,
                p2,
                p3,
                {
                    steps: 44,
                    widthStart: (cfg.ghost ? 1.15 : 1.95) * S,
                    widthEnd: 0.48 * S,
                    t0: cfg.t0,
                    t1: cfg.t0 + 0.52,
                    flexSpan: 1.12,
                    phase: ci * 1.4,
                    ghost: cfg.ghost,
                    wobble: 1.1 * S * eucLeafScale,
                },
                rng,
            );
            branches.push(stem);

            for (let i = 1; i <= cfg.count; i++) {
                const rawT = i / cfg.count;
                const easedT = 1 - Math.pow(1 - rawT, 1.32);
                const u = lerp(0.18, 0.94, easedT);
                const idx = Math.round(u * (stem.points.length - 1));
                const env = Math.sin(u * Math.PI * 0.82 + 0.25);
                const sz = lerp(29, 12.5, Math.pow(u, 1.15)) * S *
                    eucLeafScale *
                    (0.86 + env * 0.24);

                for (const side of [-1, 1] as const) {
                    if (i === 1 && side === 1) continue;
                    const jIdx = clamp(
                        idx + (side > 0 ? 0 : -2),
                        2,
                        stem.points.length - 1,
                    );
                    const ts = lerp(stem.t0, stem.t1, u) + 0.03;
                    const tint: TintRole =
                        (i === cfg.count - 1 && side === 1) ||
                            (ci === 1 && i === 4 && side === -1)
                            ? "accent"
                            : i % 3 === 0 && side === 1
                            ? "sub"
                            : "ink";
                    const isProfile = (i + (side > 0 ? 1 : 0)) % 3 === 0;
                    ornaments.push({
                        kind: "eucalyptus",
                        ghost: cfg.ghost,
                        branch: stem,
                        idx: jIdx,
                        angleOffset: side * rand(0.68, 1.08),
                        rx: sz * rand(0.90, 1.10),
                        ry: sz *
                            (isProfile ? rand(0.42, 0.54) : rand(0.78, 0.96)),
                        stemLen: rand(5, 9) * S * eucLeafScale,
                        tint,
                        profile: isProfile,
                        t0: ts,
                        t1: ts + 0.30,
                        phase: rand(0, 6.28),
                        push: 0,
                        vel: 0,
                    });
                }
            }
            ornaments.push({
                kind: "eucalyptus",
                ghost: cfg.ghost,
                branch: stem,
                idx: stem.points.length - 1,
                angleOffset: rand(-0.1, 0.1),
                rx: 12 * S * eucLeafScale,
                ry: 9 * S * eucLeafScale,
                stemLen: 3 * S * eucLeafScale,
                tint: "accent",
                profile: false,
                t0: stem.t1,
                t1: stem.t1 + 0.28,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });
    } else if (species === "plum") {
        const plumScale = isNarrow ? 0.86 : 1;
        const g0 = isNarrow
            ? { x: rootX - 6 * S, y: rootY - 30 * S }
            : { x: rootX - 10 * S, y: rootY - 95 * S };
        const g3 = isNarrow
            ? {
                x: w - rand(120, 150) * S,
                y: rootY - rand(195, 225) * S,
            }
            : {
                x: w - rand(195, 250) * S,
                y: h - rand(460, 525) * S,
            };
        const ghost = sampleBranch(
            g0,
            {
                x: lerp(g0.x, g3.x, 0.35) + 22 * S * plumScale,
                y: lerp(g0.y, g3.y, 0.35) - 28 * S * plumScale,
            },
            {
                x: lerp(g0.x, g3.x, 0.70) - 18 * S * plumScale,
                y: lerp(g0.y, g3.y, 0.70) + 16 * S * plumScale,
            },
            g3,
            {
                steps: 26,
                widthStart: 1.55 * S * plumScale,
                widthEnd: 0.45 * S,
                t0: 0.10,
                t1: 0.54,
                flexSpan: 0.85,
                phase: 2.0,
                ghost: true,
                wobble: 1.5 * S * plumScale,
            },
            rng,
        );
        branches.push(ghost);
        [0.60, 0.84, 0.98].forEach((u, i) => {
            const idx = Math.round(u * (ghost.points.length - 1));
            const isBud = i === 2;
            ornaments.push({
                kind: isBud ? "plumBud" : "plumBlossom",
                ghost: true,
                branch: ghost,
                idx,
                angleOffset: i % 2 === 0 ? -0.6 : 0.6,
                size: (isBud ? 4.8 : rand(14, 18)) * S * plumScale,
                rotation: rand(0, 6.28),
                tint: "accent",
                profile: false,
                t0: lerp(ghost.t0, ghost.t1, u) + 0.08,
                t1: lerp(ghost.t0, ghost.t1, u) + 0.36,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });

        const p0 = isNarrow
            ? { x: rootX - rand(8, 20) * S, y: rootY }
            : { x: rootX - rand(40, 72) * S, y: rootY - rand(6, 26) * S };
        const mid1 = isNarrow
            ? {
                x: w - rand(110, 132) * S,
                y: rootY - rand(72, 92) * S,
            }
            : {
                x: w - rand(195, 232) * S,
                y: h - rand(165, 200) * S,
            };
        const mid2 = isNarrow
            ? {
                x: w - rand(180, 208) * S,
                y: rootY - rand(148, 174) * S,
            }
            : {
                x: w - rand(285, 332) * S,
                y: h - rand(320, 360) * S,
            };
        const tip = isNarrow
            ? {
                x: w - rand(278, 312) * S,
                y: rootY - rand(182, 210) * S,
            }
            : {
                x: w - rand(465, 525) * S,
                y: h - rand(380, 428) * S,
            };

        const seg1 = sampleBranch(
            p0,
            {
                x: lerp(p0.x, mid1.x, 0.4) + 14 * S,
                y: lerp(p0.y, mid1.y, 0.4) - 18 * S,
            },
            {
                x: lerp(p0.x, mid1.x, 0.8) - 8 * S,
                y: lerp(p0.y, mid1.y, 0.8) + 10 * S,
            },
            mid1,
            {
                steps: 20,
                widthStart: 4.2 * S,
                widthEnd: 2.55 * S,
                t0: 0.0,
                t1: 0.21,
                flexSpan: 0.18,
                phase: 0,
                wobble: 1.2 * S,
            },
            rng,
        );
        const seg2 = sampleBranch(
            mid1,
            {
                x: lerp(mid1.x, mid2.x, 0.35) + 18 * S,
                y: lerp(mid1.y, mid2.y, 0.35) - 24 * S,
            },
            {
                x: lerp(mid1.x, mid2.x, 0.78) - 12 * S,
                y: lerp(mid1.y, mid2.y, 0.78) + 8 * S,
            },
            mid2,
            {
                steps: 22,
                widthStart: 2.55 * S,
                widthEnd: 1.55 * S,
                t0: 0.20,
                t1: 0.40,
                flexSpan: 0.35,
                phase: 0.3,
                wobble: 1.4 * S,
                parentRef: { branch: seg1, idx: seg1.points.length - 1 },
            },
            rng,
        );
        const seg3 = sampleBranch(
            mid2,
            {
                x: lerp(mid2.x, tip.x, 0.35) - 12 * S,
                y: lerp(mid2.y, tip.y, 0.35) - 24 * S,
            },
            {
                x: lerp(mid2.x, tip.x, 0.76) + 18 * S,
                y: lerp(mid2.y, tip.y, 0.76) - 8 * S,
            },
            tip,
            {
                steps: 22,
                widthStart: 1.55 * S,
                widthEnd: 0.62 * S,
                t0: 0.39,
                t1: 0.56,
                flexSpan: 0.42,
                phase: 0.6,
                wobble: 1.2 * S,
                parentRef: { branch: seg2, idx: seg2.points.length - 1 },
            },
            rng,
        );
        branches.push(seg1, seg2, seg3);

        [
            { parent: seg1, u: 0.94, ang: -0.75, len: 22 * S },
            { parent: seg2, u: 0.96, ang: -0.92, len: 18 * S },
            { parent: seg3, u: 0.36, ang: -2.95, len: 16 * S },
        ].forEach((sp, si) => {
            const pIdx = Math.round(sp.u * (sp.parent.points.length - 1));
            const anc = sp.parent.points[pIdx];
            const tp3 = {
                x: anc.x + Math.cos(sp.ang) * sp.len,
                y: anc.y + Math.sin(sp.ang) * sp.len,
            };
            const ts = lerp(sp.parent.t0, sp.parent.t1, sp.u);
            branches.push(sampleBranch(
                { x: anc.x, y: anc.y },
                { x: lerp(anc.x, tp3.x, 0.4), y: lerp(anc.y, tp3.y, 0.4) },
                { x: lerp(anc.x, tp3.x, 0.7), y: lerp(anc.y, tp3.y, 0.7) },
                tp3,
                {
                    steps: 8,
                    widthStart: 1.3 * S,
                    widthEnd: 0.32 * S,
                    t0: ts,
                    t1: ts + 0.12,
                    flexSpan: 0.1,
                    phase: 1.1 + si,
                    parentRef: { branch: sp.parent, idx: pIdx },
                },
                rng,
            ));
        });

        const twigs = isNarrow
            ? [
                { parent: seg1, u: 0.78, ang: -1.92, len: 112 * S },
                { parent: seg2, u: 0.52, ang: -1.36, len: 100 * S },
                { parent: seg2, u: 0.92, ang: -2.28, len: 82 * S },
                { parent: seg3, u: 0.58, ang: -1.58, len: 62 * S },
            ]
            : [
                { parent: seg1, u: 0.78, ang: -1.92, len: 205 * S },
                { parent: seg2, u: 0.52, ang: -1.36, len: 185 * S },
                { parent: seg2, u: 0.92, ang: -2.28, len: 150 * S },
                { parent: seg3, u: 0.58, ang: -1.58, len: 108 * S },
            ];
        twigs.forEach((tw, ti) => {
            const pIdx = Math.round(tw.u * (tw.parent.points.length - 1));
            const anc = tw.parent.points[pIdx];
            const ang = tw.ang + rand(-0.12, 0.12);
            const tp0 = { x: anc.x, y: anc.y };
            const tp3 = {
                x: anc.x + Math.cos(ang) * tw.len,
                y: anc.y + Math.sin(ang) * tw.len,
            };
            const tp1 = {
                x: lerp(tp0.x, tp3.x, 0.38) + rand(-14, 14) * S * plumScale,
                y: lerp(tp0.y, tp3.y, 0.38) - rand(10, 20) * S * plumScale,
            };
            const tp2 = {
                x: lerp(tp0.x, tp3.x, 0.74) + rand(-10, 10) * S * plumScale,
                y: lerp(tp0.y, tp3.y, 0.74) - rand(6, 14) * S * plumScale,
            };
            const ts = lerp(tw.parent.t0, tw.parent.t1, tw.u);
            const twig = sampleBranch(
                tp0,
                tp1,
                tp2,
                tp3,
                {
                    steps: 20,
                    widthStart: 1.4 * S,
                    widthEnd: 0.48 * S,
                    t0: ts,
                    t1: ts + 0.24,
                    flexSpan: 0.52,
                    phase: 0.7 + ti * 0.8,
                    wobble: 1.0 * S * plumScale,
                    parentRef: { branch: tw.parent, idx: pIdx },
                },
                rng,
            );
            branches.push(twig);

            const spots: ReadonlyArray<{
                u: number;
                kind: "plumBlossom" | "plumBud";
                sz: number;
                tint: TintRole;
                profile: boolean;
            }> = ti % 2 === 0
                ? [
                    {
                        u: 0.46,
                        kind: "plumBlossom",
                        sz: 22,
                        tint: "accent",
                        profile: false,
                    },
                    {
                        u: 0.74,
                        kind: "plumBlossom",
                        sz: 13.5,
                        tint: "sub",
                        profile: true,
                    },
                    {
                        u: 0.96,
                        kind: "plumBud",
                        sz: 5.0,
                        tint: "accent",
                        profile: false,
                    },
                ]
                : [
                    {
                        u: 0.38,
                        kind: "plumBud",
                        sz: 5.4,
                        tint: "accent",
                        profile: false,
                    },
                    {
                        u: 0.66,
                        kind: "plumBlossom",
                        sz: 16,
                        tint: "accent",
                        profile: false,
                    },
                    {
                        u: 0.86,
                        kind: "plumBud",
                        sz: 4.5,
                        tint: "sub",
                        profile: false,
                    },
                    {
                        u: 0.97,
                        kind: "plumBud",
                        sz: 3.8,
                        tint: "accent",
                        profile: false,
                    },
                ];

            spots.forEach((sp, si) => {
                const sIdx = Math.round(sp.u * (twig.points.length - 1));
                const tS = lerp(twig.t0, twig.t1, sp.u) + 0.06;
                ornaments.push({
                    kind: sp.kind,
                    ghost: false,
                    branch: twig,
                    idx: sIdx,
                    angleOffset: (si % 2 === 0 ? -1 : 1) * rand(0.42, 0.90),
                    size: sp.sz * rand(0.94, 1.06) * S * plumScale,
                    rotation: rand(0, 6.28),
                    tint: sp.tint,
                    profile: sp.profile,
                    t0: tS,
                    t1: tS + 0.34,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            });
        });

        const mainPlums: ReadonlyArray<{
            branch: BranchData;
            u: number;
            kind: "plumBlossom" | "plumBud";
            sz: number;
            tint: TintRole;
            profile: boolean;
        }> = [
            {
                branch: seg2,
                u: 0.72,
                kind: "plumBlossom",
                sz: 24,
                tint: "accent",
                profile: false,
            },
            {
                branch: seg3,
                u: 0.40,
                kind: "plumBud",
                sz: 5.2,
                tint: "accent",
                profile: false,
            },
            {
                branch: seg3,
                u: 0.80,
                kind: "plumBlossom",
                sz: 15,
                tint: "sub",
                profile: true,
            },
            {
                branch: seg3,
                u: 0.98,
                kind: "plumBud",
                sz: 4.4,
                tint: "accent",
                profile: false,
            },
        ];
        mainPlums.forEach((sp, si) => {
            const sIdx = Math.round(sp.u * (sp.branch.points.length - 1));
            const tS = lerp(sp.branch.t0, sp.branch.t1, sp.u) + 0.06;
            ornaments.push({
                kind: sp.kind,
                ghost: false,
                branch: sp.branch,
                idx: sIdx,
                angleOffset: si % 2 === 0 ? -0.55 : 0.65,
                size: sp.sz * S * plumScale,
                rotation: rand(0, 6.28),
                tint: sp.tint,
                profile: sp.profile,
                t0: tS,
                t1: tS + 0.34,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });
    } else if (species === "fern") {
        const fernScale = isNarrow ? 0.85 : 1;
        interface FernFrondConfig {
            ghost: boolean;
            role: "ghost" | "companion" | "hero";
            len: number;
            rx: number;
            tx: number;
            ty: number;
            pairs: number;
            pinnaBase: number;
            tipLen: number;
            t0: number;
            t1Span: number;
            c1x: number;
            c1y: number;
            c2x: number;
            c2y: number;
        }
        const configs: FernFrondConfig[] = isNarrow
            ? [
                {
                    ghost: true,
                    role: "ghost",
                    len: 265,
                    rx: 4,
                    tx: 118,
                    ty: 0.88,
                    pairs: 4,
                    pinnaBase: 54,
                    tipLen: 36,
                    t0: 0.10,
                    t1Span: 0.52,
                    c1x: 16,
                    c1y: 0.58,
                    c2x: 68,
                    c2y: 24,
                },
                {
                    ghost: false,
                    role: "hero",
                    len: 318,
                    rx: 18,
                    tx: 278,
                    ty: 0.66,
                    pairs: 6,
                    pinnaBase: 76,
                    tipLen: 54,
                    t0: 0.00,
                    t1Span: 0.54,
                    c1x: 24,
                    c1y: 0.56,
                    c2x: 96,
                    c2y: 34,
                },
            ]
            : [
                {
                    ghost: true,
                    role: "ghost",
                    len: 500,
                    rx: 8,
                    tx: 105,
                    ty: 0.93,
                    pairs: 4,
                    pinnaBase: 86,
                    tipLen: 56,
                    t0: 0.08,
                    t1Span: 0.52,
                    c1x: 16,
                    c1y: 0.60,
                    c2x: 78,
                    c2y: 32,
                },
                {
                    ghost: false,
                    role: "companion",
                    len: 555,
                    rx: 34,
                    tx: 190,
                    ty: 0.90,
                    pairs: 5,
                    pinnaBase: 102,
                    tipLen: 74,
                    t0: 0.10,
                    t1Span: 0.52,
                    c1x: 16,
                    c1y: 0.62,
                    c2x: 88,
                    c2y: 34,
                },
                {
                    ghost: false,
                    role: "hero",
                    len: 640,
                    rx: 96,
                    tx: 482,
                    ty: 0.66,
                    pairs: 6,
                    pinnaBase: 142,
                    tipLen: 94,
                    t0: 0.00,
                    t1Span: 0.54,
                    c1x: 42,
                    c1y: 0.58,
                    c2x: 182,
                    c2y: 62,
                },
            ];

        configs.forEach((cfg, ci) => {
            const len = cfg.len * S;
            const p0 = {
                x: rootX - cfg.rx * S,
                y: isNarrow ? rootY + 4 * S : rootY + 14 * S,
            };
            const p3 = {
                x: w - cfg.tx * S * rand(0.97, 1.03),
                y: (isNarrow ? rootY : h) - len * cfg.ty,
            };
            const p1 = {
                x: p0.x - cfg.c1x * S,
                y: p0.y - len * cfg.c1y,
            };
            const p2 = {
                x: p3.x + cfg.c2x * S,
                y: p3.y - cfg.c2y * S,
            };

            const frond = sampleBranch(
                p0,
                p1,
                p2,
                p3,
                {
                    steps: 46,
                    widthStart: (cfg.ghost ? 1.12 : 1.78) * S,
                    widthEnd: 0.40 * S,
                    t0: cfg.t0,
                    t1: cfg.t0 + cfg.t1Span,
                    flexSpan: 1.16,
                    phase: ci * 1.4,
                    waveLag: 1.9,
                    ghost: cfg.ghost,
                    wobble: 0.68 * S * fernScale,
                },
                rng,
            );
            branches.push(frond);

            const isHero = cfg.role === "hero";
            for (let i = 1; i <= cfg.pairs; i++) {
                const rawT = i / cfg.pairs;
                const easedT = 1 - Math.pow(1 - rawT, 1.15);
                const u = lerp(0.28, 0.90, easedT);
                const idx = Math.round(u * (frond.points.length - 1));
                const env = Math.sin(Math.pow(u, 0.68) * Math.PI);
                const pinnaLenBase = cfg.pinnaBase * S * (0.28 + env * 0.80);
                const ts = lerp(frond.t0, frond.t1, u) + 0.02;

                for (const side of [-1, 1] as const) {
                    const jIdx = clamp(
                        idx + (side > 0 ? 0 : -1),
                        2,
                        frond.points.length - 2,
                    );
                    const isUpperSide = side > 0;
                    const sideScale = isUpperSide ? 0.86 : 1.06;
                    const actualLen = pinnaLenBase * sideScale *
                        rand(0.94, 1.06);

                    // Five-shades-of-ink tonal contrast + restrained accent/sub highlights
                    const isFolded = !cfg.ghost &&
                        ((isHero && ((i === 2 && side === -1) ||
                            (i === 4 && side === 1) ||
                            (i === 5 && side === -1))) ||
                            (cfg.role === "companion" &&
                                ((i === 2 && side === 1) ||
                                    (i === 4 && side === -1))));
                    const isAccent = !cfg.ghost && isUpperSide &&
                        ((isHero && (i === 4 || i === 6)) ||
                            (cfg.role === "companion" && i === 4));
                    const isSub = !cfg.ghost && !isAccent &&
                        ((isHero && side === -1 && i === 5) ||
                            (cfg.role === "companion" && isUpperSide &&
                                i === 3));
                    const tint: TintRole = isAccent
                        ? "accent"
                        : isSub
                        ? "sub"
                        : "ink";

                    const inkWeight = cfg.role === "companion"
                        ? rand(0.68, 0.92)
                        : (i + (side > 0 ? 0 : 1)) % 2 === 0
                        ? rand(1.06, 1.24)
                        : rand(0.72, 0.88);

                    const angleSweep = lerp(0.84, 0.30, u) *
                        (isUpperSide ? 0.92 : 1.06);

                    ornaments.push({
                        kind: "fernPinna",
                        ghost: cfg.ghost,
                        branch: frond,
                        idx: jIdx,
                        side,
                        angleOffset: side * angleSweep,
                        len: actualLen,
                        width: actualLen * (isFolded ? 0.115 : 0.105),
                        curve: side * (-0.19 - (isUpperSide ? 0 : 0.05)),
                        inkWeight,
                        whip: side * (0.06 + (i % 2) * 0.04),
                        feibai: !cfg.ghost && !isFolded && actualLen >= 62 * S,
                        tint,
                        profile: isFolded,
                        t0: ts,
                        t1: ts + 0.26,
                        phase: u * 4.2 + side * 0.35 + ci * 0.7,
                        push: 0,
                        vel: 0,
                    });
                }
            }

            ornaments.push({
                kind: "fernPinna",
                ghost: cfg.ghost,
                branch: frond,
                idx: frond.points.length - 1,
                side: 1,
                angleOffset: 0.03,
                len: cfg.tipLen * S * fernScale,
                width: cfg.tipLen * 0.095 * S * fernScale,
                curve: -0.11,
                inkWeight: isHero ? 1.05 : 0.90,
                whip: 0.08,
                feibai: false,
                tint: cfg.ghost ? "sub" : "accent",
                profile: false,
                t0: frond.t1 - 0.04,
                t1: frond.t1 + 0.24,
                phase: ci + 2.4,
                push: 0,
                vel: 0,
            });
        });
    } else if (species === "orchid") {
        // Spring orchid: rock-clump fanning leaves + slender arched flower scapes
        const orchidScale = isNarrow ? 0.86 : 1;
        const bladeCfgs = isNarrow
            ? [
                {
                    ghost: true,
                    rx: 12,
                    tx: 105,
                    len: 175,
                    c1x: 18,
                    c2x: 44,
                    curve: -0.22,
                    w: 6.4,
                },
                {
                    ghost: false,
                    rx: 18,
                    tx: 235,
                    len: 215,
                    c1x: 24,
                    c2x: 84,
                    curve: -0.26,
                    w: 7.4,
                },
                {
                    ghost: false,
                    rx: 52,
                    tx: 315,
                    len: 235,
                    c1x: 42,
                    c2x: 112,
                    curve: -0.18,
                    w: 7.8,
                },
                {
                    ghost: false,
                    rx: 86,
                    tx: 165,
                    len: 165,
                    c1x: 16,
                    c2x: 52,
                    curve: 0.14,
                    w: 6.2,
                },
            ]
            : [
                {
                    ghost: true,
                    rx: 18,
                    tx: 125,
                    len: 390,
                    c1x: 22,
                    c2x: 78,
                    curve: -0.22,
                    w: 9.2,
                },
                {
                    ghost: false,
                    rx: 32,
                    tx: 295,
                    len: 470,
                    c1x: 34,
                    c2x: 148,
                    curve: -0.26,
                    w: 11.2,
                },
                {
                    ghost: false,
                    rx: 84,
                    tx: 465,
                    len: 510,
                    c1x: 58,
                    c2x: 192,
                    curve: -0.18,
                    w: 12.0,
                },
                {
                    ghost: false,
                    rx: 128,
                    tx: 355,
                    len: 380,
                    c1x: 38,
                    c2x: 128,
                    curve: -0.14,
                    w: 9.8,
                },
                {
                    ghost: false,
                    rx: 56,
                    tx: 190,
                    len: 340,
                    c1x: 20,
                    c2x: 76,
                    curve: 0.15,
                    w: 9.0,
                },
            ];
        bladeCfgs.forEach((cfg, bi) => {
            const len = cfg.len * S * orchidScale;
            const p0 = {
                x: rootX - cfg.rx * S,
                y: isNarrow ? rootY + 4 * S : rootY + 12 * S,
            };
            const p3 = {
                x: w - cfg.tx * S,
                y: (isNarrow ? rootY : h) - len * (isNarrow ? 0.84 : 0.72),
            };
            const leafBranch = sampleBranch(
                p0,
                { x: p0.x - cfg.c1x * S, y: p0.y - len * 0.54 },
                {
                    x: p3.x + cfg.c2x * S,
                    y: p3.y - 26 * S * (cfg.curve < 0 ? 1 : -0.5),
                },
                p3,
                {
                    steps: 34,
                    widthStart: cfg.w * 0.28 * S,
                    widthEnd: 0.35 * S,
                    t0: cfg.ghost ? 0.10 : bi * 0.04,
                    t1: 0.48 + bi * 0.04,
                    flexSpan: 1.15,
                    phase: bi * 1.1,
                    waveLag: 1.6,
                    ghost: cfg.ghost,
                    wobble: 0.8 * S,
                },
                rng,
            );
            branches.push(leafBranch);
            ornaments.push({
                kind: "fernPinna",
                ghost: cfg.ghost,
                branch: leafBranch,
                idx: Math.round(leafBranch.points.length * 0.18),
                side: 1,
                angleOffset: 0.02,
                len: len * 0.76,
                width: cfg.w * S,
                curve: cfg.curve,
                inkWeight: bi === 2 ? 1.15 : 0.92,
                whip: 0.07,
                feibai: !cfg.ghost && bi <= 2,
                tint: bi === 2 ? "sub" : "ink",
                profile: bi === 3,
                t0: leafBranch.t0 + 0.06,
                t1: leafBranch.t1 + 0.22,
                phase: bi * 0.9,
                push: 0,
                vel: 0,
            });
        });

        // Graceful arched flower scape
        const scapeP0 = {
            x: rootX - (isNarrow ? 42 : 76) * S,
            y: isNarrow ? rootY + 2 * S : rootY + 10 * S,
        };
        const scapeP3 = isNarrow
            ? { x: w - 265 * S, y: rootY - 215 * S }
            : { x: w - 395 * S, y: h - 465 * S };
        const scape = sampleBranch(
            scapeP0,
            {
                x: scapeP0.x - (isNarrow ? 26 : 44) * S,
                y: scapeP0.y - (isNarrow ? 125 : 265) * S,
            },
            {
                x: scapeP3.x + (isNarrow ? 55 : 95) * S,
                y: scapeP3.y - (isNarrow ? 18 : 34) * S,
            },
            scapeP3,
            {
                steps: 36,
                widthStart: 1.55 * S,
                widthEnd: 0.45 * S,
                t0: 0.08,
                t1: 0.54,
                flexSpan: 1.08,
                phase: 2.1,
                wobble: 0.7 * S,
            },
            rng,
        );
        branches.push(scape);
        [
            { u: 0.56, ang: -0.45, sz: 22, tint: "sub" as TintRole },
            { u: 0.78, ang: 0.42, sz: 25, tint: "accent" as TintRole },
            { u: 0.96, ang: -0.15, sz: 20, tint: "accent" as TintRole },
        ].forEach((fl, fi) => {
            const idx = Math.round(fl.u * (scape.points.length - 1));
            const ts = lerp(scape.t0, scape.t1, fl.u) + 0.06;
            ornaments.push({
                kind: "orchidBlossom",
                ghost: false,
                branch: scape,
                idx,
                angleOffset: fl.ang,
                size: fl.sz * S * orchidScale,
                rotation: rand(-0.35, 0.35),
                tint: fl.tint,
                profile: fi === 2,
                t0: ts,
                t1: ts + 0.32,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });
    } else if (species === "bamboo") {
        // Summer bamboo: segmented upright culms + antler twigs + sharp "个" leaves
        const bambooScale = isNarrow ? 0.85 : 1;
        const culms = isNarrow
            ? [
                {
                    ghost: true,
                    rx: 14,
                    tx: 108,
                    hSpan: 215,
                    w0: 1.8,
                    nodes: [0.28, 0.58, 0.86],
                    t0: 0.12,
                },
                {
                    ghost: false,
                    rx: 54,
                    tx: 185,
                    hSpan: 245,
                    w0: 3.1,
                    nodes: [0.22, 0.46, 0.70, 0.90],
                    t0: 0.0,
                },
                {
                    ghost: false,
                    rx: 96,
                    tx: 272,
                    hSpan: 210,
                    w0: 2.4,
                    nodes: [0.26, 0.54, 0.82],
                    t0: 0.08,
                },
            ]
            : [
                {
                    ghost: true,
                    rx: 22,
                    tx: 130,
                    hSpan: 440,
                    w0: 2.2,
                    nodes: [0.24, 0.48, 0.72, 0.92],
                    t0: 0.12,
                },
                {
                    ghost: false,
                    rx: 92,
                    tx: 260,
                    hSpan: 590,
                    w0: 4.0,
                    nodes: [0.18, 0.36, 0.54, 0.72, 0.88],
                    t0: 0.0,
                },
                {
                    ghost: false,
                    rx: 165,
                    tx: 420,
                    hSpan: 510,
                    w0: 3.0,
                    nodes: [0.22, 0.45, 0.68, 0.88],
                    t0: 0.08,
                },
            ];

        culms.forEach((cfg, ci) => {
            const p0 = {
                x: rootX - cfg.rx * S,
                y: isNarrow ? rootY + 2 * S : rootY + 12 * S,
            };
            const p3 = {
                x: w - cfg.tx * S,
                y: (isNarrow ? rootY : h) - cfg.hSpan * S,
            };
            const culm = sampleBranch(
                p0,
                {
                    x: lerp(p0.x, p3.x, 0.32) - 8 * S,
                    y: lerp(p0.y, p3.y, 0.35),
                },
                {
                    x: lerp(p0.x, p3.x, 0.68) + 10 * S,
                    y: lerp(p0.y, p3.y, 0.68),
                },
                p3,
                {
                    steps: 40,
                    widthStart: cfg.w0 * S,
                    widthEnd: cfg.w0 * 0.38 * S,
                    t0: cfg.t0,
                    t1: cfg.t0 + 0.44,
                    flexSpan: 0.65,
                    phase: ci * 1.1,
                    ghost: cfg.ghost,
                    bambooNodes: cfg.nodes,
                },
                rng,
            );
            branches.push(culm);

            cfg.nodes.forEach((nu, ni) => {
                if (ni === 0 && !cfg.ghost) return;
                const pIdx = Math.round(nu * (culm.points.length - 1));
                const anc = culm.points[pIdx];
                const dir = (ni + ci) % 2 === 0 ? -1 : 1;
                const twigAng = anc.angle + dir * rand(0.55, 0.82);
                const twigLen = (isNarrow ? 64 : 112) * S * (1 - nu * 0.25);
                const tp3 = {
                    x: anc.x + Math.cos(twigAng) * twigLen,
                    y: anc.y + Math.sin(twigAng) * twigLen,
                };
                const ts = lerp(culm.t0, culm.t1, nu);
                const twig = sampleBranch(
                    { x: anc.x, y: anc.y },
                    {
                        x: lerp(anc.x, tp3.x, 0.4),
                        y: lerp(anc.y, tp3.y, 0.4) - 6 * S,
                    },
                    {
                        x: lerp(anc.x, tp3.x, 0.75),
                        y: lerp(anc.y, tp3.y, 0.75) + 4 * S,
                    },
                    tp3,
                    {
                        steps: 14,
                        widthStart: 1.05 * S,
                        widthEnd: 0.35 * S,
                        t0: ts,
                        t1: ts + 0.18,
                        flexSpan: 0.48,
                        phase: ni * 0.9 + ci,
                        ghost: cfg.ghost,
                        parentRef: { branch: culm, idx: pIdx },
                    },
                    rng,
                );
                branches.push(twig);

                // Classic "个" / "介" 3-leaf cluster at twig tip
                const leafCluster = [
                    {
                        ang: -0.52,
                        len: 54,
                        curve: 0.14,
                        tint: "ink" as TintRole,
                    },
                    {
                        ang: 0.04,
                        len: 64,
                        curve: 0.08,
                        tint: (ni === cfg.nodes.length - 1 && !cfg.ghost)
                            ? "accent" as TintRole
                            : "ink" as TintRole,
                    },
                    {
                        ang: 0.56,
                        len: 48,
                        curve: -0.15,
                        tint: ni % 2 === 0
                            ? "sub" as TintRole
                            : "ink" as TintRole,
                    },
                ];
                leafCluster.forEach((lf, li) => {
                    ornaments.push({
                        kind: "bambooLeaf",
                        ghost: cfg.ghost,
                        branch: twig,
                        idx: twig.points.length - 1,
                        angleOffset: lf.ang + rand(-0.08, 0.08),
                        len: lf.len * S * bambooScale,
                        width: 6.2 * S * bambooScale,
                        curve: lf.curve,
                        feibai: !cfg.ghost && li === 1,
                        tint: lf.tint,
                        profile: false,
                        t0: twig.t1 - 0.02 + li * 0.04,
                        t1: twig.t1 + 0.24 + li * 0.04,
                        phase: rand(0, 6.28),
                        push: 0,
                        vel: 0,
                    });
                });
            });
        });
    } else if (species === "maple") {
        // Autumn maple: cliff-hanging sweeping branch (desktop) / gnarled lateral bough (narrow)
        const mapleScale = isNarrow ? 0.84 : 1;
        const mainP0 = isNarrow
            ? { x: rootX - 6 * S, y: rootY - 12 * S }
            : { x: rootX + 4 * S, y: Math.max(185 * S, h * 0.24) };
        const mainP3 = isNarrow
            ? { x: w - 265 * S, y: rootY - 195 * S }
            : { x: w - 455 * S, y: Math.min(h - 140 * S, h * 0.56) };
        const main = sampleBranch(
            mainP0,
            isNarrow
                ? { x: mainP0.x - 55 * S, y: mainP0.y - 95 * S }
                : { x: mainP0.x - 135 * S, y: mainP0.y + 42 * S },
            isNarrow
                ? { x: mainP3.x + 85 * S, y: mainP3.y + 24 * S }
                : { x: mainP3.x + 150 * S, y: mainP3.y - 75 * S },
            mainP3,
            {
                steps: 42,
                widthStart: (isNarrow ? 3.2 : 4.2) * S,
                widthEnd: 0.7 * S,
                t0: 0.0,
                t1: 0.48,
                flexSpan: 0.72,
                phase: 0.4,
                wobble: 1.8 * S,
            },
            rng,
        );
        branches.push(main);

        const subCfgs = isNarrow
            ? [
                { u: 0.34, ang: -1.95, len: 108 * S },
                { u: 0.62, ang: -1.42, len: 92 * S },
                { u: 0.82, ang: -2.45, len: 74 * S },
            ]
            : [
                { u: 0.28, ang: 2.25, len: 185 * S },
                { u: 0.54, ang: -2.35, len: 165 * S },
                { u: 0.78, ang: 2.55, len: 135 * S },
            ];
        subCfgs.forEach((sc, si) => {
            const pIdx = Math.round(sc.u * (main.points.length - 1));
            const anc = main.points[pIdx];
            const sp3 = {
                x: anc.x + Math.cos(sc.ang) * sc.len,
                y: anc.y + Math.sin(sc.ang) * sc.len,
            };
            const ts = lerp(main.t0, main.t1, sc.u);
            const sub = sampleBranch(
                { x: anc.x, y: anc.y },
                {
                    x: lerp(anc.x, sp3.x, 0.38) - 10 * S,
                    y: lerp(anc.y, sp3.y, 0.38) - 12 * S,
                },
                {
                    x: lerp(anc.x, sp3.x, 0.72) + 8 * S,
                    y: lerp(anc.y, sp3.y, 0.72) + 8 * S,
                },
                sp3,
                {
                    steps: 20,
                    widthStart: 1.55 * S,
                    widthEnd: 0.5 * S,
                    t0: ts,
                    t1: ts + 0.22,
                    flexSpan: 0.54,
                    phase: si * 1.1,
                    wobble: 1.1 * S,
                    parentRef: { branch: main, idx: pIdx },
                },
                rng,
            );
            branches.push(sub);

            [0.52, 0.96].forEach((lu, li) => {
                const lIdx = Math.round(lu * (sub.points.length - 1));
                const lt = lerp(sub.t0, sub.t1, lu) + 0.04;
                ornaments.push({
                    kind: "mapleLeaf",
                    ghost: false,
                    branch: sub,
                    idx: lIdx,
                    angleOffset: (li === 0 ? -0.55 : 0.25) + rand(-0.15, 0.15),
                    size: rand(26, 36) * S * mapleScale,
                    stemLen: 12 * S * mapleScale,
                    rotation: rand(-0.4, 0.4),
                    tint: (si + li) % 3 === 0
                        ? "accent"
                        : (si + li) % 2 === 0
                        ? "sub"
                        : "ink",
                    profile: false,
                    t0: lt,
                    t1: lt + 0.32,
                    phase: rand(0, 6.28),
                    push: 0,
                    vel: 0,
                });
            });
        });

        [0.88, 1.0].forEach((u, mi) => {
            const mIdx = Math.round(u * (main.points.length - 1));
            ornaments.push({
                kind: "mapleLeaf",
                ghost: false,
                branch: main,
                idx: mIdx,
                angleOffset: mi === 0 ? -0.45 : 0.18,
                size: (mi === 1 ? 38 : 30) * S * mapleScale,
                stemLen: 13 * S * mapleScale,
                rotation: rand(-0.3, 0.3),
                tint: mi === 1 ? "accent" : "sub",
                profile: false,
                t0: main.t1 - 0.04 + mi * 0.05,
                t1: main.t1 + 0.30 + mi * 0.05,
                phase: rand(0, 6.28),
                push: 0,
                vel: 0,
            });
        });
    }

    if (species === "plum" && resolveSolarTerm(dateKey).isSnowSeason) {
        for (const b of branches) {
            if (!b.ghost && b.widthStart >= 1.4 * S) {
                b.snowCushions = true;
            }
        }
    }

    if (embedded) {
        return {
            species,
            branches,
            ornaments,
            scale: S,
            visitorAnchor: null,
            rewardAnchor: null,
        };
    }

    // Post-generation anchors for micro-ecology visitors & reward blooms
    // (sampled after all branch/ornament geometry to preserve deterministic layout).
    const fgBranches = branches.filter((b) => !b.ghost);
    const fireflies: FireflySeed[] = [
        {
            x: w - (isNarrow ? 105 : 220) * S,
            y: h - (isNarrow ? 150 : 280) * S,
            phase: rand(0, 6.28),
            speed: 0.42,
        },
        {
            x: w - (isNarrow ? 175 : 350) * S,
            y: h - (isNarrow ? 210 : 390) * S,
            phase: rand(0, 6.28),
            speed: 0.33,
        },
    ];

    let visitorAnchor: BotanicalVisitorAnchor | null = null;
    let rewardAnchor: BotanicalRewardAnchor | null = null;

    if (species === "plum") {
        const perchBranch = fgBranches[1] ?? fgBranches[0] ?? branches[0];
        const perchIdx = Math.max(
            2,
            Math.round((perchBranch.points.length - 1) * 0.42),
        );
        visitorAnchor = {
            kind: "sparrow",
            branch: perchBranch,
            idx: perchIdx,
            fireflies,
        };
        const budIndices: number[] = [];
        for (let i = 0; i < ornaments.length && budIndices.length < 2; i++) {
            const orn = ornaments[i];
            if (!orn.ghost && orn.kind === "plumBud") {
                budIndices.push(i);
            }
        }
        const tipBranch = fgBranches[2] ?? fgBranches[0] ?? branches[0];
        rewardAnchor = {
            kind: "plum",
            branch: tipBranch,
            idx: Math.max(1, tipBranch.points.length - 1),
            budIndices,
        };
    } else if (species === "ginkgo") {
        const leafOrn = ornaments.find((o) =>
            o.kind === "ginkgo" && !o.ghost && !o.profile
        ) ?? ornaments.find((o) =>
            o.kind === "ginkgo" && !o.ghost
        );
        const perchBranch = leafOrn?.branch ?? fgBranches[0] ?? branches[0];
        const perchIdx = leafOrn?.idx ??
            Math.max(1, Math.round((perchBranch.points.length - 1) * 0.72));
        visitorAnchor = {
            kind: "ladybug",
            branch: perchBranch,
            idx: perchIdx,
            angleOffset: leafOrn?.angleOffset ?? 0.2,
            leafSize: leafOrn && leafOrn.kind === "ginkgo"
                ? leafOrn.size + leafOrn.stemLen
                : 46 * S,
            fireflies,
        };
        const mainBranch = fgBranches[0] ?? branches[0];
        rewardAnchor = {
            kind: "ginkgo",
            branch: mainBranch,
            idx: Math.max(1, mainBranch.points.length - 1),
            budIndices: [],
        };
    } else if (species === "fern") {
        const heroOrn = ornaments.find((o) =>
            o.kind === "fernPinna" && !o.ghost && !o.profile && o.len >= 50 * S
        ) ?? ornaments.find((o) =>
            o.kind === "fernPinna" && !o.ghost
        );
        const perchBranch = heroOrn?.branch ??
            fgBranches[fgBranches.length - 1] ??
            branches[0];
        const perchIdx = heroOrn?.idx ??
            Math.max(1, Math.round((perchBranch.points.length - 1) * 0.65));
        const ang = (perchBranch.points[perchIdx]?.angle ?? -1.2) +
            (heroOrn?.angleOffset ?? -0.5);
        const tipDist = heroOrn && heroOrn.kind === "fernPinna"
            ? heroOrn.len * 0.88
            : 64 * S;
        visitorAnchor = {
            kind: "dew-or-firefly",
            branch: perchBranch,
            idx: perchIdx,
            tipOffsetX: Math.cos(ang) * tipDist,
            tipOffsetY: Math.sin(ang) * tipDist,
            fireflies,
        };
        const heroBranch = fgBranches[fgBranches.length - 1] ?? branches[0];
        rewardAnchor = {
            kind: "fern",
            branch: heroBranch,
            idx: Math.max(1, heroBranch.points.length - 1),
            budIndices: [],
        };
    } else if (species === "eucalyptus") {
        const eucOrn = ornaments.find((o) =>
            o.kind === "eucalyptus" && !o.ghost && !o.profile
        ) ?? ornaments.find((o) =>
            o.kind === "eucalyptus" && !o.ghost
        );
        const perchBranch = eucOrn?.branch ?? fgBranches[0] ?? branches[0];
        const perchIdx = eucOrn?.idx ??
            Math.max(1, Math.round((perchBranch.points.length - 1) * 0.65));
        const ang = (perchBranch.points[perchIdx]?.angle ?? -1.4) +
            (eucOrn?.angleOffset ?? 0.7);
        const tipDist = eucOrn && eucOrn.kind === "eucalyptus"
            ? eucOrn.rx * 1.5 + eucOrn.stemLen
            : 32 * S;
        visitorAnchor = {
            kind: "dew-or-firefly",
            branch: perchBranch,
            idx: perchIdx,
            tipOffsetX: Math.cos(ang) * tipDist,
            tipOffsetY: Math.sin(ang) * tipDist,
            fireflies,
        };
        const mainBranch = fgBranches[0] ?? branches[0];
        rewardAnchor = {
            kind: "eucalyptus",
            branch: mainBranch,
            idx: Math.max(1, mainBranch.points.length - 1),
            budIndices: [],
        };
    } else if (species === "orchid") {
        const scapeBranch = fgBranches[fgBranches.length - 1] ?? branches[0];
        const perchIdx = Math.max(
            2,
            Math.round((scapeBranch.points.length - 1) * 0.62),
        );
        visitorAnchor = {
            kind: "butterfly",
            branch: scapeBranch,
            idx: perchIdx,
            fireflies,
        };
        rewardAnchor = {
            kind: "orchid",
            branch: scapeBranch,
            idx: Math.max(1, scapeBranch.points.length - 1),
            budIndices: [],
        };
    } else if (species === "bamboo") {
        const twigBranch = fgBranches.find((b) => b.parentRef !== null) ??
            fgBranches[0] ?? branches[0];
        visitorAnchor = {
            kind: "dragonfly",
            branch: twigBranch,
            idx: Math.max(1, twigBranch.points.length - 1),
            fireflies,
        };
        const mainCulm = fgBranches.find((b) => !b.parentRef) ??
            fgBranches[0] ??
            branches[0];
        rewardAnchor = {
            kind: "bamboo",
            branch: mainCulm,
            idx: Math.max(1, mainCulm.points.length - 1),
            budIndices: [],
        };
    } else {
        const perchBranch = fgBranches[0] ?? branches[0];
        const perchIdx = Math.max(
            2,
            Math.round((perchBranch.points.length - 1) * 0.45),
        );
        visitorAnchor = {
            kind: "sparrow",
            branch: perchBranch,
            idx: perchIdx,
            fireflies,
        };
        rewardAnchor = {
            kind: "maple",
            branch: perchBranch,
            idx: Math.max(1, perchBranch.points.length - 1),
            budIndices: [],
        };
    }

    return {
        species,
        branches,
        ornaments,
        scale: S,
        visitorAnchor,
        rewardAnchor,
    };
}

function computeBranchWorldPoints(
    branch: BranchData,
    timeSec: number,
    reducedMotion: boolean,
    windCalm: number,
    scale: number,
    frameSeq: number,
    breezeImpulse = 0,
): WorldSample[] {
    if (branch.frameId === frameSeq && branch.worldCache) {
        return branch.worldCache;
    }

    let baseDAngle = 0;
    let anchorX = branch.points[0].x;
    let anchorY = branch.points[0].y;

    if (branch.parentRef) {
        const pWorld = computeBranchWorldPoints(
            branch.parentRef.branch,
            timeSec,
            reducedMotion,
            windCalm,
            scale,
            frameSeq,
            breezeImpulse,
        );
        const pPt = pWorld[branch.parentRef.idx];
        baseDAngle = pPt.dAngle;
        anchorX = pPt.x;
        anchorY = pPt.y;
    }

    const cosA = Math.cos(baseDAngle);
    const sinA = Math.sin(baseDAngle);
    const waveLag = branch.waveLag ?? 0;
    const baseBreeze = reducedMotion
        ? 0
        : (Math.sin(timeSec * 0.66 + branch.phase) * 0.65 +
                    Math.sin(timeSec * 1.40 + branch.phase * 1.7 + 1.1) *
                        0.35) *
                windCalm +
            breezeImpulse;

    const out: WorldSample[] = new Array(branch.points.length);
    for (let i = 0; i < branch.points.length; i++) {
        const pt = branch.points[i];
        const rx = anchorX + pt.lx * cosA - pt.ly * sinA;
        const ry = anchorY + pt.lx * sinA + pt.ly * cosA;
        const breeze = waveLag && !reducedMotion
            ? (Math.sin(timeSec * 0.66 + branch.phase - pt.u * waveLag) *
                            0.65 +
                        Math.sin(
                                timeSec * 1.40 +
                                    (branch.phase - pt.u * waveLag) * 1.7 +
                                    1.1,
                            ) *
                            0.35) *
                    windCalm +
                breezeImpulse
            : baseBreeze;
        const amp = 7.5 * scale * pt.localFlex;
        const ldx = breeze * amp;
        const ldy = Math.abs(breeze) * amp * 0.24;
        const ldAngle = breeze * 0.032 * pt.localFlex;
        out[i] = {
            x: rx + ldx,
            y: ry + ldy,
            angle: pt.angle + baseDAngle + ldAngle,
            dAngle: baseDAngle + ldAngle,
        };
    }

    branch.frameId = frameSeq;
    branch.worldCache = out;
    return out;
}

function drawTaperedBranch(
    ctx: CanvasRenderingContext2D,
    branch: BranchData,
    species: ConcreteBotanicalSpecies,
    rawProgress: number,
    timeSec: number,
    reducedMotion: boolean,
    windCalm: number,
    scale: number,
    frameSeq: number,
    pal: BotanicalPalette,
    breezeImpulse = 0,
): void {
    const bp = easeOutCubic(
        clamp((rawProgress - branch.t0) / (branch.t1 - branch.t0), 0, 1),
    );
    if (bp <= 0.005) return;

    const pts = branch.points;
    const worldPts = computeBranchWorldPoints(
        branch,
        timeSec,
        reducedMotion,
        windCalm,
        scale,
        frameSeq,
        breezeImpulse,
    );
    const totalSegs = pts.length - 1;
    const maxFloat = bp * totalSegs;
    const maxIdx = Math.floor(maxFloat);
    const frac = maxFloat - maxIdx;
    const layerA = branch.ghost ? 0.22 : 1.0;
    const isFern = species === "fern";
    const widthBoost = isFern
        ? (branch.ghost ? 0.92 : 1.18)
        : (branch.ghost ? 1.0 : branch.parentRef ? 1.32 : 1.65);

    const calcHalfWidth = (u: number): number => {
        const cadenceAmp = isFern ? 0.09 : 0.24;
        const cadence = 1 +
            cadenceAmp * Math.sin(u * Math.PI * 4.5 + branch.phase * 2.1) *
                Math.sin(u * Math.PI);
        const tipTaper = u > 0.78 ? lerp(1, 0.22, (u - 0.78) / 0.22) : 1;
        return Math.max(
            0.25,
            lerp(branch.widthStart, branch.widthEnd, u) * widthBoost * cadence *
                tipTaper * 0.5,
        );
    };

    const spine: Array<
        { x: number; y: number; angle: number; hw: number; u: number }
    > = [];
    for (let i = 0; i <= maxIdx; i++) {
        const wp = worldPts[i];
        const u = i / totalSegs;
        spine.push({
            x: wp.x,
            y: wp.y,
            angle: wp.angle,
            hw: calcHalfWidth(u),
            u,
        });
    }
    if (maxIdx < totalSegs && frac > 0.01) {
        const pA = worldPts[maxIdx];
        const pB = worldPts[maxIdx + 1];
        const u = (maxIdx + frac) / totalSegs;
        spine.push({
            x: lerp(pA.x, pB.x, frac),
            y: lerp(pA.y, pB.y, frac),
            angle: lerp(pA.angle, pB.angle, frac),
            hw: calcHalfWidth(u),
            u,
        });
    }
    if (spine.length < 2) return;

    const leftEdge: Point2D[] = [];
    const rightEdge: Point2D[] = [];
    for (const p of spine) {
        const nx = -Math.sin(p.angle);
        const ny = Math.cos(p.angle);
        leftEdge.push({ x: p.x + nx * p.hw, y: p.y + ny * p.hw });
        rightEdge.push({ x: p.x - nx * p.hw, y: p.y - ny * p.hw });
    }

    // Layer A: Soft wet-ink bleed on Xuan paper
    if (!branch.ghost) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(spine[0].x, spine[0].y);
        for (let i = 1; i < spine.length; i++) {
            ctx.lineTo(spine[i].x, spine[i].y);
        }
        ctx.strokeStyle = pal.wash("ink", isFern ? 0.12 : 0.34);
        ctx.lineWidth = Math.max(
            1.2,
            (branch.widthStart + branch.widthEnd) * (isFern ? 0.56 : 0.72) +
                (isFern ? 1.1 : 2.4) * scale,
        );
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();
    }

    // Layer B: Expressive sumi-ink trunk body
    ctx.beginPath();
    ctx.moveTo(leftEdge[0].x, leftEdge[0].y);
    for (let i = 1; i < leftEdge.length; i++) {
        ctx.lineTo(leftEdge[i].x, leftEdge[i].y);
    }
    const tip = spine[spine.length - 1];
    ctx.arc(
        tip.x,
        tip.y,
        tip.hw,
        tip.angle + Math.PI * 0.5,
        tip.angle - Math.PI * 0.5,
        true,
    );
    for (let i = rightEdge.length - 1; i >= 0; i--) {
        ctx.lineTo(rightEdge[i].x, rightEdge[i].y);
    }
    const start = spine[0];
    ctx.arc(
        start.x,
        start.y,
        start.hw,
        start.angle - Math.PI * 0.5,
        start.angle + Math.PI * 0.5,
        true,
    );
    ctx.closePath();
    ctx.fillStyle = pal.stroke("ink", layerA);
    ctx.fill();

    // Layer C: True transparent dry-brush flying-white (feibai) streaks & moss dots
    if (
        !isFern &&
        !branch.ghost &&
        branch.widthStart > 1.8 * scale &&
        spine.length > 6
    ) {
        const streakOffsets = [-0.26, 0.19];
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineCap = "round";
        for (let sIdx = 0; sIdx < streakOffsets.length; sIdx++) {
            const offRatio = streakOffsets[sIdx];
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < spine.length; i++) {
                const p = spine[i];
                if (p.u < 0.16 || p.u > 0.84) continue;
                const nx = -Math.sin(p.angle);
                const ny = Math.cos(p.angle);
                const px = p.x + nx * p.hw * offRatio;
                const py = p.y + ny * p.hw * offRatio;
                if (!started) {
                    ctx.moveTo(px, py);
                    started = true;
                } else {
                    ctx.lineTo(px, py);
                }
            }
            if (started) {
                const j1 = 7 + ((Math.round(branch.phase * 13) + sIdx * 5) % 9);
                const j2 = 9 + ((Math.round(branch.phase * 7) + sIdx * 3) % 7);
                const j3 = 4 + ((Math.round(branch.phase * 17) + sIdx * 2) % 6);
                const j4 = 12 +
                    ((Math.round(branch.phase * 11) + sIdx * 4) % 11);
                ctx.setLineDash([
                    j1 * scale,
                    j2 * scale,
                    j3 * scale,
                    j4 * scale,
                ]);
                ctx.strokeStyle = "rgba(0,0,0,0.68)";
                ctx.lineWidth = Math.max(0.5, 0.78 * scale);
                ctx.stroke();
            }
        }
        ctx.setLineDash([]);
        ctx.restore();

        // Horizontal moss dots (taidian) along main branch turns
        const knotTargets = [0.24, 0.46, 0.68, 0.82];
        ctx.fillStyle = pal.stroke("ink", 0.82);
        for (let k = 0; k < knotTargets.length; k++) {
            const targetU = knotTargets[k];
            if (bp < targetU + 0.05) continue;
            const idx = Math.min(
                spine.length - 1,
                Math.floor(targetU * totalSegs),
            );
            const kp = spine[idx];
            const side = (k + Math.round(branch.phase * 2)) % 2 === 0 ? 1 : -1;
            const nx = -Math.sin(kp.angle) * side;
            const ny = Math.cos(kp.angle) * side;
            ctx.beginPath();
            ctx.ellipse(
                kp.x + nx * kp.hw * 0.92,
                kp.y + ny * kp.hw * 0.92,
                Math.max(1.1, kp.hw * 0.68),
                Math.max(0.65, kp.hw * 0.36),
                kp.angle + 0.35 * side,
                0,
                Math.PI * 2,
            );
            ctx.fill();
        }
    }

    // Bamboo nodes (crisp breathing gap + ink joint ridge)
    if (
        branch.bambooNodes && branch.bambooNodes.length > 0 && spine.length > 4
    ) {
        for (const nu of branch.bambooNodes) {
            if (bp < nu + 0.04) continue;
            const nIdx = Math.min(
                spine.length - 1,
                Math.floor(nu * totalSegs),
            );
            const np = spine[nIdx];
            const nx = -Math.sin(np.angle);
            const ny = Math.cos(np.angle);
            const ridgeW = np.hw * 1.32;
            ctx.beginPath();
            ctx.moveTo(np.x - nx * ridgeW, np.y - ny * ridgeW);
            ctx.quadraticCurveTo(
                np.x - Math.cos(np.angle) * 2.2 * scale,
                np.y - Math.sin(np.angle) * 2.2 * scale,
                np.x + nx * ridgeW,
                np.y + ny * ridgeW,
            );
            ctx.strokeStyle = pal.stroke("ink", branch.ghost ? 0.25 : 0.92);
            ctx.lineWidth = Math.max(0.85, 1.35 * scale);
            ctx.lineCap = "round";
            ctx.stroke();
        }
    }

    // Winter snow cushions on upper edge of plum branches
    if (branch.snowCushions && !branch.ghost && spine.length > 8) {
        ctx.save();
        ctx.strokeStyle = pal.highlight(pal.isDark ? 0.45 : 0.88);
        ctx.lineCap = "round";
        for (let i = 3; i < spine.length - 3; i++) {
            if (i % 7 > 3) continue;
            const p0 = spine[i];
            const p1 = spine[i + 1];
            const nx = -Math.sin(p0.angle);
            const ny = Math.cos(p0.angle);
            const sign = ny < 0 ? 1 : -1;
            const ox = nx * sign * (p0.hw + 0.9 * scale);
            const oy = ny * sign * (p0.hw + 0.9 * scale) - 0.6 * scale;
            ctx.beginPath();
            ctx.moveTo(p0.x + ox, p0.y + oy);
            ctx.lineTo(p1.x + ox, p1.y + oy);
            ctx.lineWidth = Math.max(1.2, p0.hw * 0.72);
            ctx.stroke();
        }
        ctx.restore();
    }

    if (!reducedMotion && !branch.ghost && bp > 0.02 && bp < 0.98) {
        const tipFade = Math.sin(bp * Math.PI);
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = pal.stroke("accent", 0.85 * tipFade);
        ctx.fill();
    }
}

function drawGinkgoLeaf(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: GinkgoOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const stemP = easeOutCubic(clamp(p / 0.24, 0, 1));
    const washP = easeOutCubic(clamp((p - 0.14) / 0.58, 0, 1));
    const detailP = easeOutCubic(clamp((p - 0.45) / 0.55, 0, 1));
    if (stemP <= 0.01) return;

    const s = o.size;
    const stem = o.stemLen * stemP;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Calligraphic stem
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(stem * 0.5, -stem * 0.14, stem, 0);
    ctx.strokeStyle = pal.stroke("ink", 0.78 * layerA);
    ctx.lineWidth = o.ghost ? 0.65 : 1.05;
    ctx.lineCap = "round";
    ctx.stroke();

    if (washP <= 0.01) {
        ctx.restore();
        return;
    }
    ctx.translate(o.stemLen, 0);

    const spreadL = o.profile ? -0.54 : -0.92;
    const spreadR = o.profile ? 0.78 : 0.92;
    const lx = Math.cos(spreadL) * s;
    const ly = Math.sin(spreadL) * s;
    const rx = Math.cos(spreadR) * s;
    const ry = Math.sin(spreadR) * s;
    const midX = s * (1 - o.notch);
    const midY = o.profile ? s * 0.08 : 0;

    const traceFan = () => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(lx * 0.5, ly * 0.42, lx, ly);
        ctx.bezierCurveTo(s * 0.95, ly * 0.9, s * 1.08, ly * 0.34, midX, midY);
        ctx.bezierCurveTo(s * 1.08, ry * 0.34, s * 0.95, ry * 0.9, rx, ry);
        ctx.quadraticCurveTo(rx * 0.5, ry * 0.42, 0, 0);
        ctx.closePath();
    };

    // Boneless side-brush splash 1: rich base bleeding softly outward
    const rOuter = Math.max(2, s * 1.15);
    const grad = ctx.createRadialGradient(
        s * 0.14,
        0,
        Math.max(1, s * 0.08),
        s * 0.2,
        0,
        rOuter,
    );
    grad.addColorStop(0, pal.wash(o.tint, 1.32 * washP * layerA));
    grad.addColorStop(0.55, pal.fill(o.tint, 1.08 * washP * layerA));
    grad.addColorStop(1, pal.fill(o.tint, 0.12 * washP * layerA));
    traceFan();
    ctx.fillStyle = grad;
    ctx.fill();

    // Boneless side-brush splash 2: slightly offset overlapping brushstroke
    if (!o.ghost) {
        ctx.save();
        ctx.rotate(0.065 * Math.sin(o.phase * 2.1 + 0.7));
        ctx.scale(0.92, 0.94);
        traceFan();
        ctx.fillStyle = pal.wash(o.tint, 0.62 * washP * layerA);
        ctx.fill();
        ctx.restore();
    }

    // Expressive dry-ink vein accents (no closed outline)
    if (detailP > 0.02) {
        const veins = o.profile ? 3 : 5;
        ctx.strokeStyle = pal.stroke(
            o.tint === "ink" ? "ink" : "ink",
            0.52 * detailP * layerA,
        );
        ctx.lineCap = "round";
        for (let i = 0; i < veins; i++) {
            const frac = i / (veins - 1);
            const va = lerp(spreadL * 0.76, spreadR * 0.76, frac);
            const rLen = s *
                (0.48 + 0.32 * Math.abs(Math.sin(o.phase + i * 1.4))) * detailP;
            ctx.beginPath();
            ctx.moveTo(1.5, 0);
            ctx.quadraticCurveTo(
                Math.cos(va + 0.04) * rLen * 0.5,
                Math.sin(va + 0.04) * rLen * 0.5,
                Math.cos(va) * rLen,
                Math.sin(va) * rLen,
            );
            ctx.lineWidth = i % 2 === 0 ? 0.78 : 0.52;
            ctx.stroke();
        }
    }
    ctx.restore();
}

function drawEucalyptusLeaf(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: EucalyptusOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const stemP = easeOutCubic(clamp(p / 0.22, 0, 1));
    const washP = easeOutCubic(clamp((p - 0.14) / 0.56, 0, 1));
    const detailP = easeOutCubic(clamp((p - 0.42) / 0.58, 0, 1));
    if (stemP <= 0.01) return;

    const rx = o.rx;
    const ry = o.ry;
    const stem = o.stemLen * stemP;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(stem, 0);
    ctx.strokeStyle = pal.stroke("ink", 0.72 * layerA);
    ctx.lineWidth = o.ghost ? 0.65 : 0.95;
    ctx.lineCap = "round";
    ctx.stroke();

    if (washP <= 0.01) {
        ctx.restore();
        return;
    }
    ctx.translate(o.stemLen, 0);

    const traceLeaf = () => {
        ctx.beginPath();
        ctx.moveTo(0, 0);
        if (o.profile) {
            ctx.bezierCurveTo(
                rx * 0.28,
                -ry * 1.38,
                rx * 1.32,
                -ry * 0.86,
                rx * 1.66,
                -ry * 0.18,
            );
            ctx.bezierCurveTo(rx * 1.24, ry * 0.44, rx * 0.35, ry * 0.50, 0, 0);
        } else {
            ctx.bezierCurveTo(
                rx * 0.12,
                -ry * 1.08,
                rx * 1.38,
                -ry * 1.04,
                rx * 1.68,
                0,
            );
            ctx.bezierCurveTo(rx * 1.38, ry * 1.04, rx * 0.12, ry * 1.08, 0, 0);
        }
        ctx.closePath();
    };

    // Softly feathered two-layer ink/pigment wash (no hard-edged center spot)
    const cx = rx * 0.66;
    const cy = o.profile ? -ry * 0.24 : -ry * 0.08;
    const grad = ctx.createRadialGradient(
        cx,
        cy,
        Math.max(1, ry * 0.12),
        rx * 0.84,
        0,
        Math.max(2, rx * 1.12),
    );
    grad.addColorStop(0, pal.wash(o.tint, 1.38 * washP * layerA));
    grad.addColorStop(0.55, pal.fill(o.tint, 1.12 * washP * layerA));
    grad.addColorStop(1, pal.fill(o.tint, 0.14 * washP * layerA));
    traceLeaf();
    ctx.fillStyle = grad;
    ctx.fill();

    if (!o.ghost) {
        const coreGrad = ctx.createRadialGradient(
            rx * 0.56,
            cy * 1.2,
            0.5,
            rx * 0.68,
            cy * 0.5,
            Math.max(2, rx * 0.72),
        );
        coreGrad.addColorStop(0, pal.wash(o.tint, 0.85 * washP * layerA));
        coreGrad.addColorStop(0.6, pal.fill(o.tint, 0.45 * washP * layerA));
        coreGrad.addColorStop(1, pal.fill(o.tint, 0));
        traceLeaf();
        ctx.fillStyle = coreGrad;
        ctx.fill();
    }

    // Crisp calligraphic midrib only
    if (detailP > 0.02) {
        ctx.strokeStyle = pal.stroke("ink", 0.58 * detailP * layerA);
        ctx.lineWidth = o.ghost ? 0.45 : 0.78;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(1, 0);
        if (o.profile) {
            ctx.quadraticCurveTo(
                rx * 0.72,
                -ry * 0.28,
                rx * 1.44 * detailP,
                -ry * 0.16 * detailP,
            );
        } else {
            ctx.lineTo(rx * 1.42 * detailP, 0);
        }
        ctx.stroke();
    }
    ctx.restore();
}

function drawPlumBlossom(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: PlumOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const washP = easeOutCubic(clamp(p / 0.65, 0, 1));
    const stP = easeOutCubic(clamp((p - 0.36) / 0.64, 0, 1));
    if (washP <= 0.01) return;

    const r = o.size;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(o.rotation + angle * 0.2);
    if (o.profile) ctx.scale(1.0, 0.74);

    // Boneless 5-petal sumi-e dabs with side-brush ellipticity & pigment-edge bloom
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + Math.sin(o.phase + i * 1.7) * 0.06;
        const dist = r * (0.52 + Math.cos(o.phase * 1.4 + i) * 0.04) * washP;
        const px = Math.cos(a) * dist;
        const py = Math.sin(a) * dist;
        const pr = Math.max(2, r * (0.52 + (i % 2) * 0.05) * washP);
        const grad = ctx.createRadialGradient(
            px * 0.82,
            py * 0.82,
            Math.max(0.5, pr * 0.08),
            px,
            py,
            pr,
        );
        grad.addColorStop(0, pal.wash(o.tint, 1.42 * washP * layerA));
        grad.addColorStop(0.58, pal.fill(o.tint, 1.22 * washP * layerA));
        grad.addColorStop(0.78, pal.wash(o.tint, 0.92 * washP * layerA));
        grad.addColorStop(0.98, pal.fill(o.tint, 0));
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(
            px,
            py,
            pr,
            pr * 0.84,
            a + Math.sin(o.phase * 2 + i) * 0.16,
            0,
            Math.PI * 2,
        );
        ctx.fill();
    }

    if (stP > 0.04) {
        // Dark sumi-ink calyx center dot
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(1.2, r * 0.14 * stP), 0, Math.PI * 2);
        ctx.fillStyle = pal.stroke("ink", 0.9 * stP * layerA);
        ctx.fill();

        const stamenCount = r >= 18 ? 7 : 5;
        for (let i = 0; i < stamenCount; i++) {
            const a = (i / stamenCount) * Math.PI * 2 + 0.25;
            const len = r * (i % 2 === 0 ? 0.52 : 0.36) * stP;
            const ex = Math.cos(a) * len;
            const ey = Math.sin(a) * len;
            const cx = Math.cos(a + 0.18) * len * 0.54;
            const cy = Math.sin(a + 0.18) * len * 0.54;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(cx, cy, ex, ey);
            ctx.strokeStyle = pal.stroke("ink", 0.88 * stP * layerA);
            ctx.lineWidth = 0.65;
            ctx.lineCap = "round";
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(ex, ey, (r >= 18 ? 1.55 : 1.25) * stP, 0, Math.PI * 2);
            ctx.fillStyle = pal.stroke("ink", 0.92 * stP * layerA);
            ctx.fill();
        }
    }
    ctx.restore();
}

function drawPlumBud(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: PlumOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const washP = easeOutCubic(clamp(p / 0.72, 0, 1));
    if (washP <= 0.02) return;
    const r = o.size;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const grad = ctx.createRadialGradient(
        r * 0.6,
        0,
        Math.max(0.5, r * 0.12),
        r * 0.85,
        0,
        Math.max(2, r * 1.15),
    );
    grad.addColorStop(0, pal.wash(o.tint, 1.45 * washP * layerA));
    grad.addColorStop(0.65, pal.fill(o.tint, 1.15 * washP * layerA));
    grad.addColorStop(1, pal.fill(o.tint, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(r * 0.85, 0, r * 1.12, r * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();

    // Crisp sumi-ink calyx cup
    ctx.beginPath();
    ctx.arc(r * 0.15, 0, r * 0.56, -0.92, 0.92);
    ctx.strokeStyle = pal.stroke("ink", 0.92 * washP * layerA);
    ctx.lineWidth = 1.25;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.restore();
}

function drawFernPinna(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: FernPinnaOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const strokeP = easeOutQuart(clamp(p / 0.72, 0, 1));
    const veinP = easeOutCubic(clamp((p - 0.24) / 0.65, 0, 1));
    if (strokeP <= 0.02) return;

    const len = o.len * strokeP;
    const w = o.width * 0.92;
    const midPt = (t: number): Point2D => {
        const foldKick = o.profile && t > 0.44
            ? Math.sin((t - 0.44) * Math.PI * 1.1) * len * 0.04 * o.side
            : 0;
        return {
            x: t * len,
            y: o.curve * len * Math.pow(t, 1.55) +
                o.whip * len * Math.sin(t * Math.PI) * t +
                foldKick,
        };
    };

    const samples = 26;
    const upper: Point2D[] = [];
    const lower: Point2D[] = [];
    const spine: Point2D[] = [];
    const widths: number[] = [];

    for (let i = 0; i <= samples; i++) {
        const t = i / samples;
        const mp = midPt(t);
        const mpNext = midPt(Math.min(1, t + 0.02));
        const tang = Math.atan2(mpNext.y - mp.y, mpNext.x - mp.x);
        const nx = -Math.sin(tang);
        const ny = Math.cos(tang);

        let hw: number;
        if (o.profile) {
            if (t < 0.45) {
                const lt = t / 0.45;
                hw = w * (0.18 + 0.88 * Math.sin(lt * Math.PI * 0.72)) *
                    lerp(1, 0.18, Math.pow(lt, 2.2));
            } else {
                const rt = (t - 0.45) / 0.55;
                hw = w *
                    (0.18 + 0.42 * Math.sin(rt * Math.PI * 0.88)) *
                    Math.pow(1 - rt, 0.78);
            }
        } else {
            const belly = t < 0.30
                ? lerp(0.20, 1.05, Math.sin((t / 0.30) * Math.PI * 0.5))
                : 1.05 * Math.pow(1 - (t - 0.30) / 0.70, 1.38);
            hw = w * belly;
        }
        hw = Math.max(0.18, hw);

        const asym = o.profile && t > 0.45 ? 0.85 : 1.08;
        upper.push({ x: mp.x - nx * hw * asym, y: mp.y - ny * hw * asym });
        lower.push({ x: mp.x + nx * hw, y: mp.y + ny * hw });
        spine.push(mp);
        widths.push(hw);
    }

    const tipPt = spine[spine.length - 1];

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const iw = o.inkWeight;
    const grad = ctx.createLinearGradient(0, 0, Math.max(1, tipPt.x), tipPt.y);
    if (o.tint === "ink") {
        grad.addColorStop(0, pal.wash("ink", 1.24 * iw * strokeP * layerA));
        grad.addColorStop(0.55, pal.fill("ink", 1.05 * iw * strokeP * layerA));
        grad.addColorStop(1, pal.fill("ink", 0.12 * strokeP * layerA));
    } else {
        grad.addColorStop(0, pal.wash(o.tint, 1.26 * iw * strokeP * layerA));
        grad.addColorStop(
            0.55,
            pal.fill(o.tint, 1.08 * iw * strokeP * layerA),
        );
        grad.addColorStop(1, pal.fill(o.tint, 0.14 * strokeP * layerA));
    }

    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 1; i < upper.length; i++) {
        ctx.lineTo(upper[i].x, upper[i].y);
    }
    for (let i = lower.length - 2; i >= 0; i--) {
        ctx.lineTo(lower[i].x, lower[i].y);
    }
    ctx.closePath();

    // True transparent dry-brush flying-white (feibai) bristle slits via evenodd
    const useFeibai = o.feibai && !o.ghost && !o.profile && len >= 62 &&
        strokeP > 0.72;
    if (useFeibai) {
        const slits = [
            { t0: 0.36, t1: 0.78, off: 0.24, r: 0.13 },
            { t0: 0.44, t1: 0.70, off: -0.22, r: 0.10 },
        ];
        for (const sl of slits) {
            const i0 = Math.round(sl.t0 * samples);
            const i1 = Math.round(sl.t1 * samples);
            if (i1 - i0 < 4) continue;
            const sUp: Point2D[] = [];
            const sLo: Point2D[] = [];
            for (let i = i0; i <= i1; i++) {
                const u = (i - i0) / (i1 - i0);
                const env = Math.sin(u * Math.PI);
                const mp = spine[i];
                const mpN = spine[Math.min(samples, i + 1)];
                const tang = Math.atan2(mpN.y - mp.y, mpN.x - mp.x);
                const nx = -Math.sin(tang);
                const ny = Math.cos(tang);
                const hw = widths[i];
                const cx = mp.x + nx * hw * sl.off;
                const cy = mp.y + ny * hw * sl.off;
                const sr = Math.max(0.28, hw * sl.r * env);
                sUp.push({ x: cx - nx * sr, y: cy - ny * sr });
                sLo.push({ x: cx + nx * sr, y: cy + ny * sr });
            }
            ctx.moveTo(sUp[0].x, sUp[0].y);
            for (let k = 1; k < sUp.length; k++) {
                ctx.lineTo(sUp[k].x, sUp[k].y);
            }
            for (let k = sLo.length - 1; k >= 0; k--) {
                ctx.lineTo(sLo[k].x, sLo[k].y);
            }
            ctx.closePath();
        }
    }

    ctx.fillStyle = grad;
    ctx.fill(useFeibai ? "evenodd" : "nonzero");

    // Half-length calligraphic midrib fading into the boneless whip tip
    if (veinP > 0.02) {
        const vEnd = midPt(0.54 * veinP);
        const vCtrl = midPt(0.27 * veinP);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(vCtrl.x, vCtrl.y, vEnd.x, vEnd.y);
        ctx.strokeStyle = pal.stroke("ink", 0.52 * veinP * layerA);
        ctx.lineWidth = o.ghost ? 0.42 : 0.66;
        ctx.lineCap = "round";
        ctx.stroke();
    }
    ctx.restore();
}

function spawnDrifter(
    scene: BotanicalScene,
    drifters: Drifter[],
    timeSec: number,
    windCalm: number,
    frameSeq: number,
    fromOrn: BotanicalOrnament | null = null,
): void {
    if (!scene.ornaments.length) return;
    let cand = fromOrn;
    if (!cand) {
        const fgOrns = scene.ornaments.filter((o) => !o.ghost);
        const pool = fgOrns.length ? fgOrns : scene.ornaments;
        cand = pool[Math.floor(Math.random() * pool.length)];
    }
    const wp = computeBranchWorldPoints(
        cand.branch,
        timeSec,
        false,
        windCalm,
        scene.scale,
        frameSeq,
    )[cand.idx];
    drifters.push({
        species: scene.species,
        x: wp.x,
        y: wp.y,
        vx: -14 - Math.random() * 14,
        vy: 15 + Math.random() * 11,
        rot: Math.random() * Math.PI * 2,
        vrot: (Math.random() - 0.5) * 0.8,
        phase: Math.random() * Math.PI * 2,
        size: (7 + Math.random() * 5) * scene.scale,
        tint: Math.random() < 0.55 ? "accent" : "sub",
        born: timeSec,
        life: 6.5 + Math.random() * 3,
    });
}

function drawDrifters(
    ctx: CanvasRenderingContext2D,
    drifters: Drifter[],
    height: number,
    timeSec: number,
    dt: number,
    pal: BotanicalPalette,
): void {
    for (let i = drifters.length - 1; i >= 0; i--) {
        const d = drifters[i];
        const age = timeSec - d.born;
        if (age >= d.life || d.y > height + 40) {
            drifters.splice(i, 1);
            continue;
        }
        d.x += (d.vx + Math.sin(timeSec * 1.4 + d.phase) * 14) * dt;
        d.y += d.vy * dt;
        d.rot += d.vrot * dt;

        const fadeIn = clamp(age / 0.6, 0, 1);
        const fadeOut = clamp((d.life - age) / 1.4, 0, 1);
        const alpha = fadeIn * fadeOut * 0.8;
        const flipY = 0.38 + 0.62 * Math.abs(Math.cos(timeSec * 1.9 + d.phase));

        ctx.save();
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        ctx.scale(1, flipY);

        if (d.species === "ginkgo") {
            const s = d.size * 1.15;
            ctx.beginPath();
            ctx.moveTo(-s * 0.35, 0);
            ctx.lineTo(s * 0.6, -s * 0.52);
            ctx.quadraticCurveTo(s * 0.85, 0, s * 0.6, s * 0.52);
            ctx.closePath();
        } else if (d.species === "plum") {
            ctx.beginPath();
            ctx.ellipse(0, 0, d.size * 0.62, d.size * 0.48, 0, 0, Math.PI * 2);
        } else if (d.species === "fern") {
            const s = d.size * 1.25;
            ctx.beginPath();
            ctx.moveTo(-s * 0.72, 0);
            ctx.bezierCurveTo(
                -s * 0.2,
                -s * 0.34,
                s * 0.38,
                -s * 0.22,
                s * 0.82,
                -s * 0.14,
            );
            ctx.bezierCurveTo(
                s * 0.36,
                s * 0.18,
                -s * 0.2,
                s * 0.28,
                -s * 0.72,
                0,
            );
            ctx.closePath();
        } else if (d.species === "orchid") {
            ctx.beginPath();
            ctx.ellipse(0, 0, d.size * 0.84, d.size * 0.36, 0, 0, Math.PI * 2);
        } else if (d.species === "bamboo") {
            const s = d.size * 1.25;
            ctx.beginPath();
            ctx.moveTo(-s * 0.85, 0);
            ctx.quadraticCurveTo(0, -s * 0.28, s * 0.85, 0);
            ctx.quadraticCurveTo(0, s * 0.28, -s * 0.85, 0);
            ctx.closePath();
        } else if (d.species === "maple") {
            const s = d.size * 0.95;
            ctx.beginPath();
            ctx.moveTo(0, -s);
            ctx.lineTo(s * 0.32, -s * 0.32);
            ctx.lineTo(s * 0.95, -s * 0.22);
            ctx.lineTo(s * 0.42, s * 0.24);
            ctx.lineTo(s * 0.56, s * 0.88);
            ctx.lineTo(0, s * 0.45);
            ctx.lineTo(-s * 0.56, s * 0.88);
            ctx.lineTo(-s * 0.42, s * 0.24);
            ctx.lineTo(-s * 0.95, -s * 0.22);
            ctx.lineTo(-s * 0.32, -s * 0.32);
            ctx.closePath();
        } else {
            ctx.beginPath();
            ctx.ellipse(0, 0, d.size * 0.88, d.size * 0.54, 0, 0, Math.PI * 2);
        }

        const rGrad = Math.max(2, d.size);
        const grad = ctx.createRadialGradient(0, 0, 0.5, 0, 0, rGrad);
        grad.addColorStop(0, pal.wash(d.tint, alpha * 1.3));
        grad.addColorStop(0.65, pal.fill(d.tint, alpha * 0.9));
        grad.addColorStop(1, pal.fill(d.tint, 0));
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
    }
}

function drawOrchidBlossom(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: OrchidBlossomOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const washP = easeOutCubic(clamp(p / 0.7, 0, 1));
    const dotP = easeOutCubic(clamp((p - 0.38) / 0.62, 0, 1));
    if (washP <= 0.02) return;
    const r = o.size * washP;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(o.rotation + angle * 0.25);
    if (o.profile) ctx.scale(1, 0.78);

    // 5 slender orchid petals (3 outer sepals + 2 inner petals)
    const petalAngles = [-1.57, -0.45, 0.45, -2.55, 2.55];
    for (let i = 0; i < petalAngles.length; i++) {
        const pa = petalAngles[i];
        const plen = r * (i < 3 ? 1.05 : 0.78);
        const pw = plen * 0.24;
        ctx.save();
        ctx.rotate(pa);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(plen * 0.35, -pw, plen * 0.78, -pw * 0.7, plen, 0);
        ctx.bezierCurveTo(plen * 0.78, pw * 0.7, plen * 0.35, pw, 0, 0);
        ctx.closePath();
        const grad = ctx.createRadialGradient(
            plen * 0.3,
            0,
            0.5,
            plen * 0.5,
            0,
            Math.max(2, plen * 0.7),
        );
        grad.addColorStop(0, pal.wash(o.tint, 1.25 * washP * layerA));
        grad.addColorStop(1, pal.fill(o.tint, 0.35 * washP * layerA));
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.restore();
    }

    // Labellum (lip) with vermilion/accent spots
    if (dotP > 0.02) {
        ctx.beginPath();
        ctx.ellipse(0, r * 0.28, r * 0.22, r * 0.30, 0, 0, Math.PI * 2);
        ctx.fillStyle = pal.wash("accent", 1.15 * dotP * layerA);
        ctx.fill();

        ctx.fillStyle = pal.stroke("ink", 0.9 * dotP * layerA);
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0.8, r * 0.09 * dotP), 0, Math.PI * 2);
        ctx.arc(
            -r * 0.07,
            r * 0.26,
            Math.max(0.5, r * 0.05 * dotP),
            0,
            Math.PI * 2,
        );
        ctx.arc(
            r * 0.07,
            r * 0.30,
            Math.max(0.5, r * 0.05 * dotP),
            0,
            Math.PI * 2,
        );
        ctx.fill();
    }
    ctx.restore();
}

function drawBambooLeaf(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: BambooLeafOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const strokeP = easeOutQuart(clamp(p / 0.75, 0, 1));
    if (strokeP <= 0.02) return;
    const len = o.len * strokeP;
    const w = o.width;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(
        len * 0.28,
        -w + o.curve * len * 0.3,
        len * 0.65,
        -w * 0.55 + o.curve * len * 0.7,
        len,
        o.curve * len,
    );
    ctx.bezierCurveTo(
        len * 0.62,
        w * 0.45 + o.curve * len * 0.7,
        len * 0.24,
        w * 0.85 + o.curve * len * 0.3,
        0,
        0,
    );
    ctx.closePath();

    const grad = ctx.createLinearGradient(
        0,
        0,
        Math.max(1, len),
        o.curve * len,
    );
    grad.addColorStop(0, pal.wash(o.tint, 1.32 * strokeP * layerA));
    grad.addColorStop(0.65, pal.fill(o.tint, 1.08 * strokeP * layerA));
    grad.addColorStop(1, pal.fill(o.tint, 0.24 * strokeP * layerA));
    ctx.fillStyle = grad;
    ctx.fill();

    // Crisp central vein
    ctx.beginPath();
    ctx.moveTo(1, 0);
    ctx.quadraticCurveTo(
        len * 0.45,
        o.curve * len * 0.42,
        len * 0.75,
        o.curve * len * 0.72,
    );
    ctx.strokeStyle = pal.vein(o.tint, 0.65 * strokeP * layerA);
    ctx.lineWidth = o.ghost ? 0.38 : 0.55;
    ctx.stroke();

    ctx.restore();
}

function drawMapleLeaf(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    o: MapleLeafOrnament,
    p: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    const stemP = easeOutCubic(clamp(p / 0.25, 0, 1));
    const washP = easeOutCubic(clamp((p - 0.12) / 0.62, 0, 1));
    if (stemP <= 0.02) return;
    const stem = o.stemLen * stemP;
    const s = o.size * Math.max(0.15, washP);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(stem, 0);
    ctx.strokeStyle = pal.stroke("ink", 0.72 * layerA);
    ctx.lineWidth = o.ghost ? 0.55 : 0.85;
    ctx.lineCap = "round";
    ctx.stroke();

    if (washP <= 0.05) {
        ctx.restore();
        return;
    }

    ctx.translate(stem, 0);
    ctx.rotate(o.rotation);

    // 5-lobed palmate maple silhouette
    const lobes = [-1.45, -0.72, 0, 0.72, 1.45];
    const lobeLens = [0.58, 0.86, 1.0, 0.86, 0.58];
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 0; i < lobes.length; i++) {
        const la = lobes[i];
        const ll = s * lobeLens[i];
        const tipX = Math.cos(la) * ll;
        const tipY = Math.sin(la) * ll;
        const prevA = i === 0 ? -1.85 : (lobes[i - 1] + la) * 0.5;
        const notchR = s * (i === 0 ? 0.22 : 0.34);
        ctx.lineTo(Math.cos(prevA) * notchR, Math.sin(prevA) * notchR);
        ctx.lineTo(tipX, tipY);
    }
    ctx.lineTo(Math.cos(1.85) * s * 0.22, Math.sin(1.85) * s * 0.22);
    ctx.closePath();

    const grad = ctx.createRadialGradient(
        s * 0.25,
        0,
        Math.max(0.5, s * 0.08),
        s * 0.45,
        0,
        Math.max(2, s * 1.05),
    );
    grad.addColorStop(0, pal.wash(o.tint, 1.38 * washP * layerA));
    grad.addColorStop(0.65, pal.fill(o.tint, 1.15 * washP * layerA));
    grad.addColorStop(1, pal.fill(o.tint, 0.25 * washP * layerA));
    ctx.fillStyle = grad;
    ctx.fill();

    // 5 radiating palmate veins
    ctx.strokeStyle = pal.vein("ink", 0.58 * washP * layerA);
    ctx.lineWidth = o.ghost ? 0.38 : 0.55;
    ctx.lineCap = "round";
    for (let i = 0; i < lobes.length; i++) {
        const la = lobes[i];
        const ll = s * lobeLens[i] * 0.74;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(la) * ll, Math.sin(la) * ll);
        ctx.stroke();
    }
    ctx.restore();
}

function renderOrnamentItem(
    ctx: CanvasRenderingContext2D,
    o: BotanicalOrnament,
    wx: number,
    wy: number,
    angle: number,
    op: number,
    pal: BotanicalPalette,
    layerA: number,
): void {
    if (o.kind === "ginkgo") {
        drawGinkgoLeaf(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "eucalyptus") {
        drawEucalyptusLeaf(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "plumBlossom") {
        drawPlumBlossom(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "plumBud") {
        drawPlumBud(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "fernPinna") {
        drawFernPinna(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "orchidBlossom") {
        drawOrchidBlossom(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "bambooLeaf") {
        drawBambooLeaf(ctx, wx, wy, angle, o, op, pal, layerA);
    } else if (o.kind === "mapleLeaf") {
        drawMapleLeaf(ctx, wx, wy, angle, o, op, pal, layerA);
    }
}

export function triggerBotanicalResonance(
    runtime: BotanicalRuntimeState,
    kind: BotanicalResonanceKind,
    timeSec: number,
    scene: BotanicalScene | null,
    drifters: Drifter[],
    windCalm: number,
    frameSeq: number,
): void {
    switch (kind) {
        case "quick-capture": {
            runtime.breezeImpulseStartSec = timeSec;
            runtime.breezeImpulseStrength = 1.15;
            runtime.fireflyBoostStartSec = timeSec;
            if (scene && drifters.length < 4) {
                spawnDrifter(
                    scene,
                    drifters,
                    timeSec,
                    windCalm,
                    frameSeq,
                    null,
                );
            }
            if (runtime.visitorMode === "perched") {
                runtime.visitorMode = "departing";
                runtime.visitorStateStartSec = timeSec;
                runtime.visitorVx = -74;
                runtime.visitorVy = -62;
            }
            if (runtime.dewState === "hanging") {
                runtime.dewState = "falling";
                runtime.dewStateStartSec = timeSec;
                runtime.dewFallDist = 0;
            }
            break;
        }
        case "task-completed": {
            runtime.breezeImpulseStartSec = timeSec;
            runtime.breezeImpulseStrength = 0.72;
            runtime.fireflyBoostStartSec = timeSec;
            if (runtime.dewState === "hanging") {
                runtime.dewState = "falling";
                runtime.dewStateStartSec = timeSec;
                runtime.dewFallDist = 0;
            }
            break;
        }
        case "tasks-cleared": {
            runtime.breezeImpulseStartSec = timeSec;
            runtime.breezeImpulseStrength = 1.35;
            runtime.awakened = true;
            runtime.awakenStartSec = timeSec;
            runtime.haloPulseStartSec = timeSec;
            runtime.fireflyBoostStartSec = timeSec;
            break;
        }
        case "theme-ripple": {
            runtime.breezeImpulseStartSec = timeSec;
            runtime.breezeImpulseStrength = 0.9;
            break;
        }
        case "search-submit": {
            runtime.breezeImpulseStartSec = timeSec;
            runtime.breezeImpulseStrength = 0.8;
            runtime.fireflyBoostStartSec = timeSec;
            if (runtime.visitorMode === "perched") {
                runtime.visitorMode = "departing";
                runtime.visitorStateStartSec = timeSec;
                runtime.visitorVx = -70;
                runtime.visitorVy = -58;
            }
            if (runtime.dewState === "hanging") {
                runtime.dewState = "falling";
                runtime.dewStateStartSec = timeSec;
                runtime.dewFallDist = 0;
            }
            break;
        }
    }
}

function drawSparrow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    alpha: number,
    pal: BotanicalPalette,
    flapping: boolean,
    timeSec: number,
    reducedMotion: boolean,
): void {
    if (alpha <= 0.02) return;
    const s = scale;
    const bob = reducedMotion || flapping
        ? 0
        : Math.sin(timeSec * 2.2) * 0.7 * s;
    const tailAngle = reducedMotion || flapping
        ? -0.35
        : -0.38 + Math.sin(timeSec * 1.4 + 0.8) * 0.08;

    ctx.save();
    ctx.translate(x, y + bob);

    // Claws gripping the branch (when perched)
    if (!flapping) {
        ctx.strokeStyle = pal.stroke("ink", 0.85 * alpha);
        ctx.lineWidth = Math.max(0.7, 0.9 * s);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(-2 * s, -4 * s);
        ctx.lineTo(-3 * s, 0.5 * s);
        ctx.moveTo(2.5 * s, -4 * s);
        ctx.lineTo(2 * s, 0.5 * s);
        ctx.stroke();
    }

    // Tail feathers
    ctx.save();
    ctx.translate(7 * s, -7 * s);
    ctx.rotate(tailAngle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(13 * s, -3.5 * s);
    ctx.lineTo(11.5 * s, 1.5 * s);
    ctx.closePath();
    ctx.fillStyle = pal.stroke("ink", 0.82 * alpha);
    ctx.fill();
    ctx.restore();

    // Plump ink-wash belly
    const bellyGrad = ctx.createRadialGradient(
        -2 * s,
        -9 * s,
        0.5,
        0,
        -8 * s,
        11 * s,
    );
    bellyGrad.addColorStop(0, pal.wash("ink", 1.15 * alpha));
    bellyGrad.addColorStop(0.7, pal.fill("ink", 0.9 * alpha));
    bellyGrad.addColorStop(1, pal.fill("ink", 0.25 * alpha));
    ctx.beginPath();
    ctx.ellipse(0, -8 * s, 8.8 * s, 6.2 * s, -0.22, 0, Math.PI * 2);
    ctx.fillStyle = bellyGrad;
    ctx.fill();

    // Warm accent throat wash
    ctx.beginPath();
    ctx.ellipse(-5 * s, -9.5 * s, 4.2 * s, 3.4 * s, -0.1, 0, Math.PI * 2);
    ctx.fillStyle = pal.wash("accent", 0.36 * alpha);
    ctx.fill();

    // Head & crown
    ctx.beginPath();
    ctx.arc(-6.2 * s, -13.5 * s, 4.6 * s, 0, Math.PI * 2);
    ctx.fillStyle = pal.stroke("ink", 0.88 * alpha);
    ctx.fill();

    // Cheek highlight
    ctx.beginPath();
    ctx.ellipse(-5.2 * s, -12.6 * s, 2.2 * s, 1.5 * s, 0.1, 0, Math.PI * 2);
    ctx.fillStyle = pal.highlight(0.75 * alpha);
    ctx.fill();

    // Beak
    ctx.beginPath();
    ctx.moveTo(-10.2 * s, -14.2 * s);
    ctx.lineTo(-14.2 * s, -13.1 * s);
    ctx.lineTo(-10.2 * s, -12.1 * s);
    ctx.closePath();
    ctx.fillStyle = pal.stroke("ink", 0.92 * alpha);
    ctx.fill();

    // Bright eye
    ctx.beginPath();
    ctx.arc(-7.8 * s, -14.2 * s, Math.max(0.9, 1.05 * s), 0, Math.PI * 2);
    ctx.fillStyle = pal.highlight(0.95 * alpha);
    ctx.fill();

    // Folded or flapping wings
    if (flapping) {
        const flap = Math.sin(timeSec * 36) * 0.65;
        for (const side of [-1, 1] as const) {
            ctx.save();
            ctx.translate(-1 * s, -11 * s);
            ctx.rotate(-0.4 + flap * side);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(6 * s, -14 * s, 14 * s, -8 * s);
            ctx.quadraticCurveTo(7 * s, -2 * s, 0, 0);
            ctx.fillStyle = pal.stroke("ink", 0.78 * alpha);
            ctx.fill();
            ctx.restore();
        }
    } else {
        ctx.beginPath();
        ctx.moveTo(-2 * s, -11.5 * s);
        ctx.quadraticCurveTo(5 * s, -12.5 * s, 9.5 * s, -6.5 * s);
        ctx.quadraticCurveTo(3 * s, -5.5 * s, -2 * s, -11.5 * s);
        ctx.fillStyle = pal.stroke("ink", 0.85 * alpha);
        ctx.fill();
    }

    ctx.restore();
}

function drawLadybug(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    scale: number,
    alpha: number,
    pal: BotanicalPalette,
    flying: boolean,
    timeSec: number,
    reducedMotion: boolean,
): void {
    if (alpha <= 0.02) return;
    const s = scale;
    const antTwitch = reducedMotion ? 0 : Math.sin(timeSec * 4.5) * 0.14;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Subtle open translucent wings when flying
    if (flying) {
        const wingFlap = Math.sin(timeSec * 42) * 0.25;
        for (const side of [-1, 1] as const) {
            ctx.save();
            ctx.rotate(side * (0.65 + wingFlap));
            ctx.beginPath();
            ctx.ellipse(3.5 * s, 0, 4.5 * s, 1.8 * s, 0, 0, Math.PI * 2);
            ctx.fillStyle = pal.highlight(0.45 * alpha);
            ctx.fill();
            ctx.restore();
        }
    }

    // Accent/vermilion shell
    const shellGrad = ctx.createRadialGradient(
        -0.5 * s,
        -0.5 * s,
        0.3,
        0,
        0,
        4.6 * s,
    );
    shellGrad.addColorStop(0, pal.wash("accent", 1.35 * alpha));
    shellGrad.addColorStop(1, pal.stroke("accent", 0.92 * alpha));
    ctx.beginPath();
    ctx.ellipse(0, 0, 4.2 * s, 3.3 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = shellGrad;
    ctx.fill();
    ctx.strokeStyle = pal.stroke("ink", 0.72 * alpha);
    ctx.lineWidth = Math.max(0.55, 0.7 * s);
    ctx.stroke();

    // Pronotum (head cap)
    ctx.beginPath();
    ctx.arc(-3.5 * s, 0, 1.65 * s, 0, Math.PI * 2);
    ctx.fillStyle = pal.stroke("ink", 0.92 * alpha);
    ctx.fill();

    // Antennae
    ctx.strokeStyle = pal.stroke("ink", 0.8 * alpha);
    ctx.lineWidth = Math.max(0.45, 0.55 * s);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-4.8 * s, -0.5 * s);
    ctx.lineTo(-6.8 * s, (-1.6 + antTwitch) * s);
    ctx.moveTo(-4.8 * s, 0.5 * s);
    ctx.lineTo(-6.8 * s, (1.6 - antTwitch) * s);
    ctx.stroke();

    // Center suture & spots
    ctx.beginPath();
    ctx.moveTo(-2.2 * s, 0);
    ctx.lineTo(4.0 * s, 0);
    ctx.stroke();

    ctx.fillStyle = pal.stroke("ink", 0.9 * alpha);
    const spots: readonly [number, number, number][] = [
        [-0.4, -1.4, 0.65],
        [1.6, -1.1, 0.55],
        [0.4, 1.3, 0.65],
        [2.1, 0.9, 0.5],
    ];
    for (const [sx, sy, sr] of spots) {
        ctx.beginPath();
        ctx.arc(sx * s, sy * s, Math.max(0.45, sr * s), 0, Math.PI * 2);
        ctx.fill();
    }

    // Specular highlight dot
    ctx.beginPath();
    ctx.arc(-0.8 * s, -1.1 * s, Math.max(0.4, 0.65 * s), 0, Math.PI * 2);
    ctx.fillStyle = pal.highlight(0.85 * alpha);
    ctx.fill();

    ctx.restore();
}

function drawDewdropAndRipple(
    ctx: CanvasRenderingContext2D,
    tipX: number,
    tipY: number,
    runtime: BotanicalRuntimeState,
    timeSec: number,
    dt: number,
    scale: number,
    pal: BotanicalPalette,
    reducedMotion: boolean,
): void {
    if (reducedMotion) {
        // Static crystal dewdrop at leaf tip
        ctx.save();
        ctx.translate(tipX, tipY + 2 * scale);
        ctx.beginPath();
        ctx.moveTo(0, -3.5 * scale);
        ctx.bezierCurveTo(
            2.5 * scale,
            -0.5 * scale,
            2.6 * scale,
            3.2 * scale,
            0,
            3.6 * scale,
        );
        ctx.bezierCurveTo(
            -2.6 * scale,
            3.2 * scale,
            -2.5 * scale,
            -0.5 * scale,
            0,
            -3.5 * scale,
        );
        ctx.fillStyle = pal.highlight(0.85);
        ctx.fill();
        ctx.strokeStyle = pal.stroke("accent", 0.65);
        ctx.lineWidth = Math.max(0.55, 0.75 * scale);
        ctx.stroke();
        ctx.restore();
        return;
    }

    if (runtime.dewState === "hanging") {
        if (runtime.dewStateStartSec < -100) {
            runtime.dewStateStartSec = timeSec;
        }
        if (timeSec - runtime.dewStateStartSec > 26) {
            runtime.dewState = "falling";
            runtime.dewStateStartSec = timeSec;
            runtime.dewFallDist = 0;
        }
    }

    if (runtime.dewState === "falling") {
        const fallAge = timeSec - runtime.dewStateStartSec;
        runtime.dewFallDist = 0.5 * 360 * scale * fallAge * fallAge;
        const dropY = tipY + 2 * scale + runtime.dewFallDist;
        const maxFall = 95 * scale;
        if (runtime.dewFallDist >= maxFall) {
            runtime.dewState = "ripple";
            runtime.dewStateStartSec = timeSec;
            runtime.dewImpactX = tipX;
            runtime.dewImpactY = tipY + maxFall;
        } else {
            ctx.save();
            ctx.translate(tipX, dropY);
            ctx.beginPath();
            ctx.ellipse(0, 0, 1.8 * scale, 2.8 * scale, 0, 0, Math.PI * 2);
            ctx.fillStyle = pal.highlight(0.88);
            ctx.fill();
            ctx.strokeStyle = pal.stroke("accent", 0.7);
            ctx.lineWidth = Math.max(0.55, 0.75 * scale);
            ctx.stroke();
            ctx.restore();
            return;
        }
    }

    if (runtime.dewState === "ripple") {
        const rAge = timeSec - runtime.dewStateStartSec;
        const dur = 1.6;
        if (rAge >= dur) {
            runtime.dewState = "regrowing";
            runtime.dewStateStartSec = timeSec;
        } else {
            const p = rAge / dur;
            for (let k = 0; k < 2; k++) {
                const kp = clamp((p - k * 0.22) / (1 - k * 0.22), 0, 1);
                if (kp <= 0) continue;
                const rx = (4 + easeOutCubic(kp) * 26) * scale;
                const ry = rx * 0.3;
                const a = (1 - kp) * 0.58;
                ctx.beginPath();
                ctx.ellipse(
                    runtime.dewImpactX,
                    runtime.dewImpactY,
                    rx,
                    ry,
                    0,
                    0,
                    Math.PI * 2,
                );
                ctx.strokeStyle = k === 0
                    ? pal.stroke("ink", a)
                    : pal.stroke("accent", a * 0.85);
                ctx.lineWidth = Math.max(0.5, (1.1 - kp * 0.6) * scale);
                ctx.stroke();
            }
            return;
        }
    }

    let growScale = 1;
    if (runtime.dewState === "regrowing") {
        const gAge = timeSec - runtime.dewStateStartSec;
        if (gAge >= 6.0) {
            runtime.dewState = "hanging";
            runtime.dewStateStartSec = timeSec;
            growScale = 1;
        } else {
            growScale = easeOutCubic(clamp(gAge / 6.0, 0.05, 1));
        }
    }

    const tremble = Math.sin(timeSec * 3.2) * 0.35 * scale * dt * 60 * 0.016;
    const ds = scale * growScale;
    ctx.save();
    ctx.translate(tipX + tremble, tipY + 2 * ds);
    ctx.beginPath();
    ctx.moveTo(0, -3.2 * ds);
    ctx.bezierCurveTo(2.4 * ds, -0.4 * ds, 2.5 * ds, 3.0 * ds, 0, 3.4 * ds);
    ctx.bezierCurveTo(-2.5 * ds, 3.0 * ds, -2.4 * ds, -0.4 * ds, 0, -3.2 * ds);
    ctx.fillStyle = pal.highlight(0.86 * growScale);
    ctx.fill();
    ctx.strokeStyle = pal.stroke("accent", 0.68 * growScale);
    ctx.lineWidth = Math.max(0.5, 0.72 * ds);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-0.7 * ds, 0.8 * ds, Math.max(0.35, 0.7 * ds), 0, Math.PI * 2);
    ctx.fillStyle = pal.highlight(0.95 * growScale);
    ctx.fill();
    ctx.restore();
}

function drawFireflies(
    ctx: CanvasRenderingContext2D,
    seeds: readonly FireflySeed[],
    runtime: BotanicalRuntimeState,
    timeSec: number,
    scale: number,
    pal: BotanicalPalette,
    pointer: BotanicalPointerState,
    reducedMotion: boolean,
): void {
    const boostAge = timeSec - runtime.fireflyBoostStartSec;
    const boost = !reducedMotion && boostAge >= 0 && boostAge < 1.8
        ? 1 + Math.sin((boostAge / 1.8) * Math.PI) * 0.65
        : 1;

    for (const f of seeds) {
        const driftX = reducedMotion
            ? 0
            : Math.sin(timeSec * f.speed + f.phase) * 22 * scale;
        const driftY = reducedMotion
            ? 0
            : Math.cos(timeSec * f.speed * 0.82 + f.phase * 1.3) * 16 * scale;
        let fx = f.x + driftX;
        let fy = f.y + driftY;

        if (!reducedMotion && pointer.x > -1000) {
            const dx = fx - pointer.x;
            const dy = fy - pointer.y;
            const dist = Math.hypot(dx, dy);
            const repulseR = 110 * scale;
            if (dist > 1 && dist < repulseR) {
                const push = ((repulseR - dist) / repulseR) * 28 * scale;
                fx += (dx / dist) * push;
                fy += (dy / dist) * push;
            }
        }

        const breath = reducedMotion ? 0.75 : 0.42 +
            0.58 *
                (0.5 +
                    0.5 *
                        Math.sin(
                            timeSec * f.speed * Math.PI * 2 + f.phase,
                        ));
        const glowR = Math.max(4, 16 * scale * breath * boost);

        const glow = ctx.createRadialGradient(fx, fy, 0.5, fx, fy, glowR);
        glow.addColorStop(
            0,
            pal.wash("accent", clamp(0.85 * breath * boost, 0, 1)),
        );
        glow.addColorStop(
            0.4,
            pal.fill("accent", clamp(0.45 * breath * boost, 0, 1)),
        );
        glow.addColorStop(1, pal.fill("accent", 0));

        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(fx, fy, glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(fx, fy, Math.max(0.8, 1.5 * scale), 0, Math.PI * 2);
        ctx.fillStyle = pal.highlight(clamp(0.95 * breath, 0.3, 1));
        ctx.fill();
    }
}

function drawButterfly(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    alpha: number,
    pal: BotanicalPalette,
    flying: boolean,
    timeSec: number,
    reducedMotion: boolean,
): void {
    if (alpha <= 0.02) return;
    const s = scale;
    const flap = reducedMotion
        ? 0.85
        : flying
        ? 0.25 + 0.75 * Math.abs(Math.sin(timeSec * 24))
        : 0.72 + 0.28 * Math.sin(timeSec * 1.6);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.35);

    for (const side of [-1, 1] as const) {
        ctx.save();
        ctx.scale(1, side * flap);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(-4 * s, -12 * s, 9 * s, -13 * s, 7 * s, -2 * s);
        ctx.bezierCurveTo(6 * s, 2 * s, 1 * s, 2 * s, 0, 0);
        ctx.fillStyle = pal.wash("sub", 0.95 * alpha);
        ctx.fill();
        ctx.strokeStyle = pal.stroke("ink", 0.55 * alpha);
        ctx.lineWidth = Math.max(0.45, 0.65 * s);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(4 * s, -5 * s, Math.max(0.8, 1.4 * s), 0, Math.PI * 2);
        ctx.fillStyle = pal.stroke("accent", 0.85 * alpha);
        ctx.fill();
        ctx.restore();
    }

    ctx.beginPath();
    ctx.ellipse(0, 0, 4.5 * s, 0.9 * s, 0, 0, Math.PI * 2);
    ctx.fillStyle = pal.stroke("ink", 0.9 * alpha);
    ctx.fill();
    ctx.restore();
}

function drawDragonfly(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    alpha: number,
    pal: BotanicalPalette,
    flying: boolean,
    timeSec: number,
    reducedMotion: boolean,
): void {
    if (alpha <= 0.02) return;
    const s = scale;
    const wingBuzz = reducedMotion
        ? 0
        : flying
        ? Math.sin(timeSec * 45) * 0.28
        : Math.sin(timeSec * 2.1) * 0.04;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.48);

    // 4 translucent veined wings
    for (const side of [-1, 1] as const) {
        for (const pair of [0, 1] as const) {
            ctx.save();
            ctx.translate(-1 * s + pair * 2 * s, 0);
            ctx.rotate(side * (1.15 - pair * 0.25 + wingBuzz));
            ctx.beginPath();
            ctx.ellipse(6.5 * s, 0, 6.8 * s, 1.5 * s, 0, 0, Math.PI * 2);
            ctx.fillStyle = pal.highlight(0.48 * alpha);
            ctx.fill();
            ctx.strokeStyle = pal.stroke("ink", 0.45 * alpha);
            ctx.lineWidth = Math.max(0.4, 0.52 * s);
            ctx.stroke();
            ctx.restore();
        }
    }

    // Slender segmented crimson/accent abdomen
    ctx.beginPath();
    ctx.moveTo(-4 * s, 0);
    ctx.lineTo(14 * s, 0);
    ctx.strokeStyle = pal.stroke("accent", 0.92 * alpha);
    ctx.lineWidth = Math.max(1.0, 1.65 * s);
    ctx.lineCap = "round";
    ctx.stroke();

    // Head & eyes
    ctx.beginPath();
    ctx.arc(-4.6 * s, 0, Math.max(1.1, 1.7 * s), 0, Math.PI * 2);
    ctx.fillStyle = pal.stroke("ink", 0.92 * alpha);
    ctx.fill();
    ctx.restore();
}

function drawSolarTermSeal(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scale: number,
    term: string,
    sceneSide: "left" | "right",
    pal: BotanicalPalette,
    alpha: number,
): void {
    if (alpha <= 0.02 || !term) return;
    const s = scale;
    const isNarrow = width < 720;
    const wBox = 15 * s;
    const hBox = 28 * s;
    const x = sceneSide === "left" ? 28 * s : width - 28 * s;
    const y = isNarrow ? height - 118 * s : height - 46 * s;
    const sealAlpha = (pal.overPhoto ? 0.34 : 0.48) * alpha;

    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(-wBox / 2 + 2 * s, -hBox / 2);
    ctx.lineTo(wBox / 2 - 2 * s, -hBox / 2);
    ctx.quadraticCurveTo(wBox / 2, -hBox / 2, wBox / 2, -hBox / 2 + 2 * s);
    ctx.lineTo(wBox / 2, hBox / 2 - 2 * s);
    ctx.quadraticCurveTo(wBox / 2, hBox / 2, wBox / 2 - 2 * s, hBox / 2);
    ctx.lineTo(-wBox / 2 + 2 * s, hBox / 2);
    ctx.quadraticCurveTo(-wBox / 2, hBox / 2, -wBox / 2, hBox / 2 - 2 * s);
    ctx.lineTo(-wBox / 2, -hBox / 2 + 2 * s);
    ctx.quadraticCurveTo(-wBox / 2, -hBox / 2, -wBox / 2 + 2 * s, -hBox / 2);
    ctx.closePath();

    ctx.fillStyle = pal.fill("accent", sealAlpha * 0.45);
    ctx.fill();
    ctx.strokeStyle = pal.stroke("accent", sealAlpha);
    ctx.lineWidth = Math.max(0.75, 1.05 * s);
    ctx.stroke();

    if (typeof ctx.fillText === "function") {
        const chars = Array.from(term).slice(0, 2);
        const fontSize = Math.max(8, Math.round(9.5 * s));
        ctx.font = `${fontSize}px "Noto Serif SC", "Songti SC", serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = pal.stroke("accent", Math.min(1, sealAlpha * 1.35));
        if (chars.length === 2) {
            ctx.fillText(chars[0], 0, -5.5 * s);
            ctx.fillText(chars[1], 0, 5.5 * s);
        } else if (chars.length === 1) {
            ctx.fillText(chars[0], 0, 0);
        }
    }
    ctx.restore();
}

function drawRewardBloom(
    ctx: CanvasRenderingContext2D,
    scene: BotanicalScene,
    reward: BotanicalRewardAnchor,
    runtime: BotanicalRuntimeState,
    timeSec: number,
    reducedMotion: boolean,
    windCalm: number,
    frameSeq: number,
    breezeImpulse: number,
    pal: BotanicalPalette,
): void {
    const bloomP = reducedMotion
        ? 1
        : easeOutCubic(clamp((timeSec - runtime.awakenStartSec) / 1.8, 0, 1));
    if (bloomP <= 0.02) return;

    const tipPt = computeBranchWorldPoints(
        reward.branch,
        timeSec,
        reducedMotion,
        windCalm,
        scene.scale,
        frameSeq,
        breezeImpulse,
    )[reward.idx];
    const s = scene.scale;

    // Subtle expanding halo pulse when tasks are cleared
    const haloAge = timeSec - runtime.haloPulseStartSec;
    if (!reducedMotion && haloAge >= 0 && haloAge < 1.4) {
        const hp = haloAge / 1.4;
        const hr = (10 + easeOutCubic(hp) * 48) * s;
        ctx.beginPath();
        ctx.arc(tipPt.x, tipPt.y, hr, 0, Math.PI * 2);
        ctx.strokeStyle = pal.stroke("accent", (1 - hp) * 0.42);
        ctx.lineWidth = Math.max(0.6, (1.4 - hp) * s);
        ctx.stroke();
    }

    if (reward.kind === "plum") {
        // Buds bloom into five-petal accent blossoms
        for (const budIdx of reward.budIndices) {
            const bud = scene.ornaments[budIdx];
            if (!bud || bud.kind !== "plumBud") continue;
            const wp = computeBranchWorldPoints(
                bud.branch,
                timeSec,
                reducedMotion,
                windCalm,
                s,
                frameSeq,
                breezeImpulse,
            )[bud.idx];
            const blossom: PlumOrnament = {
                ...bud,
                kind: "plumBlossom",
                size: Math.max(bud.size * 2.8, 14 * s) * bloomP,
                tint: "accent",
            };
            drawPlumBlossom(
                ctx,
                wp.x,
                wp.y,
                wp.angle + bud.angleOffset,
                blossom,
                bloomP,
                pal,
                1.0,
            );
        }
    } else if (reward.kind === "ginkgo") {
        for (const angOff of [-0.42, 0.36]) {
            const shoot: GinkgoOrnament = {
                kind: "ginkgo",
                branch: reward.branch,
                idx: reward.idx,
                ghost: false,
                t0: 0,
                t1: 1,
                phase: 1.2,
                angleOffset: angOff,
                tint: "accent",
                profile: angOff > 0,
                push: 0,
                vel: 0,
                size: 26 * s * bloomP,
                notch: 0.22,
                stemLen: 10 * s,
            };
            drawGinkgoLeaf(
                ctx,
                tipPt.x,
                tipPt.y,
                tipPt.angle + angOff,
                shoot,
                bloomP,
                pal,
                1.0,
            );
        }
    } else if (reward.kind === "eucalyptus") {
        const rays = 14;
        const rLen = 16 * s * bloomP;
        ctx.save();
        ctx.translate(tipPt.x, tipPt.y);
        for (let i = 0; i < rays; i++) {
            const a = (i / rays) * Math.PI * 2 + 0.2;
            const ex = Math.cos(a) * rLen;
            const ey = Math.sin(a) * rLen;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(ex, ey);
            ctx.strokeStyle = pal.stroke("accent", 0.72 * bloomP);
            ctx.lineWidth = Math.max(0.55, 0.75 * s);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(ex, ey, Math.max(0.9, 1.4 * s * bloomP), 0, Math.PI * 2);
            ctx.fillStyle = pal.stroke("accent", 0.9 * bloomP);
            ctx.fill();
        }
        ctx.restore();
    } else if (reward.kind === "fern") {
        // Fern spiral fiddlehead crozier at hero tip
        ctx.save();
        ctx.translate(tipPt.x, tipPt.y);
        ctx.rotate(tipPt.angle);
        const r = 10 * s * bloomP;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(
            14 * s * bloomP,
            -2 * s * bloomP,
            18 * s * bloomP,
            -16 * s * bloomP,
            8 * s * bloomP,
            -16 * s * bloomP,
        );
        ctx.bezierCurveTo(
            2 * s * bloomP,
            -16 * s * bloomP,
            2 * s * bloomP,
            -8 * s * bloomP,
            8 * s * bloomP,
            -9 * s * bloomP,
        );
        ctx.strokeStyle = pal.stroke("accent", 0.88 * bloomP);
        ctx.lineWidth = Math.max(1.0, 1.65 * s);
        ctx.lineCap = "round";
        ctx.stroke();
        const glow = ctx.createRadialGradient(
            8 * s * bloomP,
            -11 * s * bloomP,
            0.5,
            8 * s * bloomP,
            -11 * s * bloomP,
            Math.max(2, r * 1.4),
        );
        glow.addColorStop(0, pal.wash("accent", 0.45 * bloomP));
        glow.addColorStop(1, pal.fill("accent", 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(
            8 * s * bloomP,
            -11 * s * bloomP,
            Math.max(2, r * 1.4),
            0,
            Math.PI * 2,
        );
        ctx.fill();
        ctx.restore();
    } else if (reward.kind === "orchid") {
        const bloom: OrchidBlossomOrnament = {
            kind: "orchidBlossom",
            branch: reward.branch,
            idx: reward.idx,
            ghost: false,
            t0: 0,
            t1: 1,
            phase: 0.4,
            angleOffset: -0.2,
            tint: "accent",
            profile: false,
            push: 0,
            vel: 0,
            size: 26 * s * bloomP,
            rotation: -0.25,
        };
        drawOrchidBlossom(
            ctx,
            tipPt.x,
            tipPt.y,
            tipPt.angle,
            bloom,
            bloomP,
            pal,
            1.0,
        );
    } else if (reward.kind === "bamboo") {
        for (const angOff of [-0.46, 0.06, 0.52]) {
            const shoot: BambooLeafOrnament = {
                kind: "bambooLeaf",
                branch: reward.branch,
                idx: reward.idx,
                ghost: false,
                t0: 0,
                t1: 1,
                phase: 0.7,
                angleOffset: angOff,
                tint: "accent",
                profile: false,
                push: 0,
                vel: 0,
                len: 52 * s * bloomP,
                width: 5.8 * s,
                curve: angOff * 0.2,
                feibai: false,
            };
            drawBambooLeaf(
                ctx,
                tipPt.x,
                tipPt.y,
                tipPt.angle + angOff,
                shoot,
                bloomP,
                pal,
                1.0,
            );
        }
    } else if (reward.kind === "maple") {
        const leaf: MapleLeafOrnament = {
            kind: "mapleLeaf",
            branch: reward.branch,
            idx: reward.idx,
            ghost: false,
            t0: 0,
            t1: 1,
            phase: 0.5,
            angleOffset: 0.1,
            tint: "accent",
            profile: false,
            push: 0,
            vel: 0,
            size: 36 * s * bloomP,
            stemLen: 12 * s,
            rotation: 0.15,
        };
        drawMapleLeaf(
            ctx,
            tipPt.x,
            tipPt.y,
            tipPt.angle + 0.15,
            leaf,
            bloomP,
            pal,
            1.0,
        );
    }
}

export function renderBotanicalFrame(params: BotanicalRenderParams): number {
    const {
        ctx,
        scene,
        width,
        height,
        timeSec,
        dt,
        rawProgress,
        reducedMotion,
        windCalm,
        searchFocused,
        embedded,
        palette,
        pointer: rawPointer,
        drifters,
        frameSeq,
        runtime,
        sceneSide = "right",
        dateKey = "2026-11-27",
    } = params;
    let nextDriftSpawn = params.lastDriftSpawn;

    const mirrorLeft = !embedded && sceneSide === "left" && width >= 768;
    const pointer: BotanicalPointerState = mirrorLeft
        ? {
            ...rawPointer,
            x: rawPointer.x > -1000 ? width - rawPointer.x : rawPointer.x,
            vx: -rawPointer.vx,
        }
        : rawPointer;

    const impulseAge = runtime ? timeSec - runtime.breezeImpulseStartSec : -1;
    const breezeImpulse = !reducedMotion &&
            runtime &&
            impulseAge >= 0 &&
            impulseAge < 2.6
        ? Math.sin(impulseAge * 4.2) *
            Math.exp(-impulseAge * 1.65) *
            runtime.breezeImpulseStrength
        : 0;

    ctx.clearRect(0, 0, width, height);
    if (mirrorLeft) {
        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
    }

    // Precompute ornament world transforms & interactive physics once per frame
    const pSpeed = embedded ? 0 : Math.hypot(pointer.vx, pointer.vy);
    const activeOrns: Array<{
        o: BotanicalOrnament;
        wx: number;
        wy: number;
        angle: number;
        op: number;
    }> = [];

    for (const o of scene.ornaments) {
        const op = clamp((rawProgress - o.t0) / (o.t1 - o.t0), 0, 1);
        if (op <= 0.005) continue;

        const wp = computeBranchWorldPoints(
            o.branch,
            timeSec,
            reducedMotion,
            windCalm,
            scene.scale,
            frameSeq,
            breezeImpulse,
        )[o.idx];

        if (!reducedMotion && !o.ghost && !embedded) {
            if (pSpeed > 18) {
                const dist = Math.hypot(wp.x - pointer.x, wp.y - pointer.y);
                if (dist < 88) {
                    const influence = (1 - dist / 88) *
                        clamp(pointer.vx * 0.00055, -0.22, 0.22);
                    o.vel += influence * 14 * dt;
                    if (
                        rawProgress >= 1 &&
                        pSpeed > 260 &&
                        drifters.length < 3 &&
                        timeSec - pointer.lastRustleSpawn > 2.8
                    ) {
                        spawnDrifter(
                            scene,
                            drifters,
                            timeSec,
                            windCalm,
                            frameSeq,
                            o,
                        );
                        pointer.lastRustleSpawn = timeSec;
                    }
                }
            }
            o.vel += -o.push * 22 * dt;
            o.vel *= Math.pow(0.08, dt);
            o.push = clamp(o.push + o.vel * dt * 12, -0.32, 0.32);
        } else {
            o.push = 0;
            o.vel = 0;
        }

        const sway = reducedMotion
            ? 0
            : Math.sin(timeSec * 1.15 + o.phase) * 0.036 * windCalm + o.push;
        activeOrns.push({
            o,
            wx: wp.x,
            wy: wp.y,
            angle: wp.angle + o.angleOffset + sway,
            op,
        });
    }

    // Layer 1: Distant ghost echo branches & ornaments
    for (const b of scene.branches) {
        if (b.ghost) {
            drawTaperedBranch(
                ctx,
                b,
                scene.species,
                rawProgress,
                timeSec,
                reducedMotion,
                windCalm,
                scene.scale,
                frameSeq,
                palette,
                breezeImpulse,
            );
        }
    }
    for (const item of activeOrns) {
        if (item.o.ghost) {
            renderOrnamentItem(
                ctx,
                item.o,
                item.wx,
                item.wy,
                item.angle,
                item.op,
                palette,
                0.22,
            );
        }
    }

    // Layer 2: Foreground calligraphic branches
    for (const b of scene.branches) {
        if (!b.ghost) {
            drawTaperedBranch(
                ctx,
                b,
                scene.species,
                rawProgress,
                timeSec,
                reducedMotion,
                windCalm,
                scene.scale,
                frameSeq,
                palette,
                breezeImpulse,
            );
        }
    }

    // Layer 3: Foreground botanical ornaments
    for (const item of activeOrns) {
        if (!item.o.ghost) {
            if (
                palette.isDark &&
                !embedded &&
                !palette.overPhoto &&
                item.o.tint === "accent"
            ) {
                const isFernPinna = item.o.kind === "fernPinna";
                const haloRadius = item.o.kind === "fernPinna"
                    ? Math.min(Math.max(item.o.len * 0.24, 10), 22)
                    : ("size" in item.o ? item.o.size : 24) * 1.75;
                const haloX = item.o.kind === "fernPinna"
                    ? item.wx + Math.cos(item.angle) * item.o.len * 0.28
                    : item.wx;
                const haloY = item.o.kind === "fernPinna"
                    ? item.wy + Math.sin(item.angle) * item.o.len * 0.28
                    : item.wy;
                const peakAlpha = isFernPinna ? 0.08 : 0.24;
                const glow = ctx.createRadialGradient(
                    haloX,
                    haloY,
                    0,
                    haloX,
                    haloY,
                    haloRadius,
                );
                glow.addColorStop(
                    0,
                    palette.wash("accent", peakAlpha * item.op),
                );
                glow.addColorStop(
                    0.34,
                    palette.wash("accent", peakAlpha * 0.42 * item.op),
                );
                glow.addColorStop(
                    0.68,
                    palette.wash("accent", peakAlpha * 0.10 * item.op),
                );
                glow.addColorStop(1, palette.wash("accent", 0));
                ctx.save();
                ctx.globalCompositeOperation = "screen";
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(haloX, haloY, haloRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            renderOrnamentItem(
                ctx,
                item.o,
                item.wx,
                item.wy,
                item.angle,
                item.op,
                palette,
                1.0,
            );
        }
    }

    // Layer 4: Expressive ink & vermilion/accent splatter dots near foreground branch tips
    if (rawProgress > 0.72) {
        const speckFade = easeOutCubic(
            clamp((rawProgress - 0.72) / 0.28, 0, 1),
        );
        const fgBranches = scene.branches.filter((b) =>
            !b.ghost && (scene.species !== "fern" || b.points.length >= 40)
        );
        for (let bi = 0; bi < Math.min(2, fgBranches.length); bi++) {
            const b = fgBranches[bi];
            const pts = computeBranchWorldPoints(
                b,
                timeSec,
                reducedMotion,
                windCalm,
                scene.scale,
                frameSeq,
                breezeImpulse,
            );
            if (pts.length < 3) continue;
            const anchorIdx = Math.floor(pts.length * (bi === 0 ? 0.88 : 0.72));
            const anchor = pts[anchorIdx];
            for (let k = 0; k < 4; k++) {
                const seedAngle = b.phase * 3.1 + k * 1.65 + bi * 1.2;
                const dist = (14 + k * 14) * scene.scale;
                const sx = anchor.x + Math.cos(seedAngle) * dist;
                const sy = anchor.y + Math.sin(seedAngle) * dist * 0.78;
                const sr = (scene.species === "fern"
                    ? (0.85 + ((k + bi) % 2) * 0.55)
                    : (1.1 + ((k + bi) % 3) * 0.9)) * scene.scale;
                ctx.beginPath();
                ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                ctx.fillStyle = k % 2 === 0
                    ? palette.stroke("accent", 0.52 * speckFade)
                    : palette.stroke("ink", 0.40 * speckFade);
                ctx.fill();
            }
        }
    }

    if (!embedded) {
        pointer.vx *= 0.82;
        pointer.vy *= 0.82;
    }

    // Layer 5: 3D-tumbling drifters
    if (!reducedMotion && !embedded && rawProgress >= 1) {
        if (
            !searchFocused &&
            timeSec - nextDriftSpawn > 7.5 &&
            drifters.length < 2
        ) {
            spawnDrifter(scene, drifters, timeSec, windCalm, frameSeq);
            nextDriftSpawn = timeSec;
        }
        drawDrifters(ctx, drifters, height, timeSec, dt, palette);
    }

    // Layer 6: Micro-ecology visitors & tasks-cleared reward blooms
    if (!embedded && runtime && rawProgress > 0.78) {
        const visFade = easeOutCubic(clamp((rawProgress - 0.78) / 0.22, 0, 1));
        if (scene.visitorAnchor) {
            const va = scene.visitorAnchor;
            const anchorPt = computeBranchWorldPoints(
                va.branch,
                timeSec,
                reducedMotion,
                windCalm,
                scene.scale,
                frameSeq,
                breezeImpulse,
            )[va.idx];

            if (va.kind === "sparrow") {
                if (runtime.visitorMode === "perched") {
                    if (
                        !reducedMotion &&
                        pSpeed > 30 &&
                        Math.hypot(
                                anchorPt.x - pointer.x,
                                anchorPt.y - pointer.y,
                            ) < 96 * scene.scale
                    ) {
                        runtime.visitorMode = "departing";
                        runtime.visitorStateStartSec = timeSec;
                        runtime.visitorX = anchorPt.x;
                        runtime.visitorY = anchorPt.y;
                        runtime.visitorVx = -74;
                        runtime.visitorVy = -62;
                    } else {
                        runtime.visitorX = anchorPt.x;
                        runtime.visitorY = anchorPt.y;
                        drawSparrow(
                            ctx,
                            anchorPt.x,
                            anchorPt.y,
                            scene.scale,
                            visFade,
                            palette,
                            false,
                            timeSec,
                            reducedMotion,
                        );
                    }
                } else if (runtime.visitorMode === "departing") {
                    const dAge = timeSec - runtime.visitorStateStartSec;
                    if (dAge > 2.4) {
                        runtime.visitorMode = "returning";
                        runtime.visitorStateStartSec = timeSec;
                    } else {
                        runtime.visitorX += runtime.visitorVx * scene.scale *
                            dt;
                        runtime.visitorY += runtime.visitorVy * scene.scale *
                            dt;
                        const flyAlpha = clamp(1 - dAge / 2.2, 0, 1) * visFade;
                        drawSparrow(
                            ctx,
                            runtime.visitorX,
                            runtime.visitorY,
                            scene.scale,
                            flyAlpha,
                            palette,
                            true,
                            timeSec,
                            reducedMotion,
                        );
                    }
                } else {
                    const rAge = timeSec - runtime.visitorStateStartSec;
                    if (rAge > 18) {
                        runtime.visitorMode = "perched";
                    } else if (rAge > 16.5) {
                        const retAlpha = clamp((rAge - 16.5) / 1.5, 0, 1) *
                            visFade;
                        drawSparrow(
                            ctx,
                            anchorPt.x,
                            anchorPt.y,
                            scene.scale,
                            retAlpha,
                            palette,
                            false,
                            timeSec,
                            reducedMotion,
                        );
                    }
                }
            } else if (va.kind === "ladybug") {
                const lx = anchorPt.x +
                    Math.cos(anchorPt.angle + va.angleOffset) * va.leafSize *
                        0.72;
                const ly = anchorPt.y +
                    Math.sin(anchorPt.angle + va.angleOffset) * va.leafSize *
                        0.72;
                if (runtime.visitorMode === "perched") {
                    if (
                        !reducedMotion &&
                        pSpeed > 25 &&
                        Math.hypot(lx - pointer.x, ly - pointer.y) <
                            88 * scene.scale
                    ) {
                        runtime.visitorMode = "departing";
                        runtime.visitorStateStartSec = timeSec;
                        runtime.visitorX = lx;
                        runtime.visitorY = ly;
                        runtime.visitorVx = -52;
                        runtime.visitorVy = -46;
                    } else {
                        drawLadybug(
                            ctx,
                            lx,
                            ly,
                            anchorPt.angle + va.angleOffset,
                            scene.scale,
                            visFade,
                            palette,
                            false,
                            timeSec,
                            reducedMotion,
                        );
                    }
                } else if (runtime.visitorMode === "departing") {
                    const dAge = timeSec - runtime.visitorStateStartSec;
                    if (dAge > 2.2) {
                        runtime.visitorMode = "returning";
                        runtime.visitorStateStartSec = timeSec;
                    } else {
                        runtime.visitorX += (runtime.visitorVx +
                            Math.sin(dAge * 5) * 28) * scene.scale * dt;
                        runtime.visitorY += runtime.visitorVy * scene.scale *
                            dt;
                        drawLadybug(
                            ctx,
                            runtime.visitorX,
                            runtime.visitorY,
                            -0.6,
                            scene.scale,
                            clamp(1 - dAge / 2.0, 0, 1) * visFade,
                            palette,
                            true,
                            timeSec,
                            reducedMotion,
                        );
                    }
                } else {
                    const rAge = timeSec - runtime.visitorStateStartSec;
                    if (rAge > 16) {
                        runtime.visitorMode = "perched";
                    } else if (rAge > 14.5) {
                        drawLadybug(
                            ctx,
                            lx,
                            ly,
                            anchorPt.angle + va.angleOffset,
                            scene.scale,
                            clamp((rAge - 14.5) / 1.5, 0, 1) * visFade,
                            palette,
                            false,
                            timeSec,
                            reducedMotion,
                        );
                    }
                }
            } else if (va.kind === "butterfly" || va.kind === "dragonfly") {
                const drawInsect = va.kind === "butterfly"
                    ? drawButterfly
                    : drawDragonfly;
                if (runtime.visitorMode === "perched") {
                    if (
                        !reducedMotion &&
                        pSpeed > 25 &&
                        Math.hypot(
                                anchorPt.x - pointer.x,
                                anchorPt.y - pointer.y,
                            ) < 92 * scene.scale
                    ) {
                        runtime.visitorMode = "departing";
                        runtime.visitorStateStartSec = timeSec;
                        runtime.visitorX = anchorPt.x;
                        runtime.visitorY = anchorPt.y;
                        runtime.visitorVx = -64;
                        runtime.visitorVy = -54;
                    } else {
                        drawInsect(
                            ctx,
                            anchorPt.x,
                            anchorPt.y,
                            scene.scale,
                            visFade,
                            palette,
                            false,
                            timeSec,
                            reducedMotion,
                        );
                    }
                } else if (runtime.visitorMode === "departing") {
                    const dAge = timeSec - runtime.visitorStateStartSec;
                    if (dAge > 2.2) {
                        runtime.visitorMode = "returning";
                        runtime.visitorStateStartSec = timeSec;
                    } else {
                        runtime.visitorX += (runtime.visitorVx +
                            Math.sin(dAge * 5) * 32) * scene.scale * dt;
                        runtime.visitorY += runtime.visitorVy * scene.scale *
                            dt;
                        drawInsect(
                            ctx,
                            runtime.visitorX,
                            runtime.visitorY,
                            scene.scale,
                            clamp(1 - dAge / 2.0, 0, 1) * visFade,
                            palette,
                            true,
                            timeSec,
                            reducedMotion,
                        );
                    }
                } else {
                    const rAge = timeSec - runtime.visitorStateStartSec;
                    if (rAge > 16) {
                        runtime.visitorMode = "perched";
                    } else if (rAge > 14.5) {
                        drawInsect(
                            ctx,
                            anchorPt.x,
                            anchorPt.y,
                            scene.scale,
                            clamp((rAge - 14.5) / 1.5, 0, 1) * visFade,
                            palette,
                            false,
                            timeSec,
                            reducedMotion,
                        );
                    }
                }
            } else {
                const tipX = anchorPt.x + va.tipOffsetX;
                const tipY = anchorPt.y + va.tipOffsetY;
                if (!palette.isDark) {
                    if (
                        !reducedMotion &&
                        runtime.dewState === "hanging" &&
                        pSpeed > 25 &&
                        Math.hypot(tipX - pointer.x, tipY - pointer.y) <
                            84 * scene.scale
                    ) {
                        runtime.dewState = "falling";
                        runtime.dewStateStartSec = timeSec;
                        runtime.dewFallDist = 0;
                    }
                    drawDewdropAndRipple(
                        ctx,
                        tipX,
                        tipY,
                        runtime,
                        timeSec,
                        dt,
                        scene.scale,
                        palette,
                        reducedMotion,
                    );
                }
            }

            if (palette.isDark) {
                drawFireflies(
                    ctx,
                    va.fireflies,
                    runtime,
                    timeSec,
                    scene.scale,
                    palette,
                    pointer,
                    reducedMotion,
                );
            }
        }

        if (runtime.awakened && scene.rewardAnchor) {
            drawRewardBloom(
                ctx,
                scene,
                scene.rewardAnchor,
                runtime,
                timeSec,
                reducedMotion,
                windCalm,
                frameSeq,
                breezeImpulse,
                palette,
            );
        }
    }

    if (mirrorLeft) {
        ctx.restore();
    }

    if (!embedded && rawProgress > 0.85) {
        const sealFade = easeOutCubic(clamp((rawProgress - 0.85) / 0.15, 0, 1));
        const { term } = resolveSolarTerm(dateKey);
        drawSolarTermSeal(
            ctx,
            width,
            height,
            scene.scale,
            term,
            mirrorLeft ? "left" : "right",
            palette,
            sealFade,
        );
    }

    return nextDriftSpawn;
}
