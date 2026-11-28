import { drawAtmosphericStage } from "./atmosphere.ts";
import { drawRockBase } from "./strokes.ts";
import type {
    BotanicalOrnament,
    BotanicalPalette,
    BotanicalScene,
} from "./types.ts";

export type OffscreenSurface = HTMLCanvasElement | OffscreenCanvas;

export interface OffscreenSurfaceBundle {
    readonly canvas: OffscreenSurface;
    readonly ctx: CanvasRenderingContext2D;
}

export type SurfaceFactory = (
    pixelWidth: number,
    pixelHeight: number,
) => OffscreenSurfaceBundle | null;

export interface TightSpriteCache {
    readonly canvas: OffscreenSurface;
    readonly minX: number;
    readonly minY: number;
    readonly logicalW: number;
    readonly logicalH: number;
}

export interface BotanicalRenderCache {
    scene: BotanicalScene | null;
    palette: BotanicalPalette | null;
    width: number;
    height: number;
    dpr: number;
    sceneSide: "left" | "right";
    atmosphereCanvas: OffscreenSurface | null;
    rocksCache: TightSpriteCache | null;
    readonly ornaments: Map<BotanicalOrnament, TightSpriteCache>;
    readonly createSurface: SurfaceFactory;
}

function defaultCreateSurface(
    pixelWidth: number,
    pixelHeight: number,
): OffscreenSurfaceBundle | null {
    if (
        typeof document === "undefined" ||
        typeof document.createElement !== "function"
    ) {
        return null;
    }
    const w = Math.max(1, Math.ceil(pixelWidth));
    const h = Math.max(1, Math.ceil(pixelHeight));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    return { canvas, ctx };
}

export function createBotanicalRenderCache(
    createSurface: SurfaceFactory = defaultCreateSurface,
): BotanicalRenderCache {
    return {
        scene: null,
        palette: null,
        width: 0,
        height: 0,
        dpr: 1,
        sceneSide: "right",
        atmosphereCanvas: null,
        rocksCache: null,
        ornaments: new Map(),
        createSurface,
    };
}

export function invalidateBotanicalCache(cache: BotanicalRenderCache): void {
    cache.scene = null;
    cache.palette = null;
    cache.atmosphereCanvas = null;
    cache.rocksCache = null;
    cache.ornaments.clear();
}

export function syncBotanicalCache(
    cache: BotanicalRenderCache,
    scene: BotanicalScene,
    palette: BotanicalPalette,
    width: number,
    height: number,
    dpr: number,
    sceneSide: "left" | "right",
): void {
    const safeDpr = Math.max(0.5, Math.min(2, dpr));
    if (
        cache.scene !== scene ||
        cache.palette !== palette ||
        cache.width !== width ||
        cache.height !== height ||
        Math.abs(cache.dpr - safeDpr) > 1e-4 ||
        cache.sceneSide !== sceneSide
    ) {
        invalidateBotanicalCache(cache);
        cache.scene = scene;
        cache.palette = palette;
        cache.width = width;
        cache.height = height;
        cache.dpr = safeDpr;
        cache.sceneSide = sceneSide;
    }
}

export function computeOrnamentLocalBounds(o: BotanicalOrnament): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
} {
    switch (o.kind) {
        case "plumBlossom": {
            const pad = o.size * 1.25 + 8;
            return { minX: -pad, minY: -pad, maxX: pad, maxY: pad };
        }
        case "plumBud": {
            const r = o.size;
            return {
                minX: -(r * 0.7 + 8),
                minY: -(r * 1.15 + 8),
                maxX: r * 2.25 + 8,
                maxY: r * 1.15 + 8,
            };
        }
        case "ginkgo": {
            const s = o.size;
            return {
                minX: -10,
                minY: -(s * 1.18 + 10),
                maxX: o.stemLen + s * 1.28 + 10,
                maxY: s * 1.18 + 10,
            };
        }
        case "eucalyptus":
            return {
                minX: -10,
                minY: -(o.ry * 1.55 + 10),
                maxX: o.stemLen + o.rx * 1.85 + 10,
                maxY: o.ry * 1.3 + 10,
            };
        case "mapleLeaf": {
            const r = o.size * 1.2 + 10;
            return {
                minX: Math.min(-10, o.stemLen - r),
                minY: -r,
                maxX: o.stemLen + r,
                maxY: r,
            };
        }
        case "fernPinna": {
            const maxY = (Math.abs(o.curve) + Math.abs(o.whip) + 0.08) * o.len +
                o.width * 1.7 + 10;
            return {
                minX: -(o.width + 10),
                minY: -maxY,
                maxX: o.len + o.width + 10,
                maxY,
            };
        }
    }
}

export function drawCachedAtmosphere(
    cache: BotanicalRenderCache,
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scale: number,
    palette: BotanicalPalette,
    rawProgress: number,
    embedded: boolean,
    sceneSide: "left" | "right",
): boolean {
    if (
        embedded || rawProgress < 0.999 || palette.overPhoto ||
        palette.solidSurface
    ) {
        return false;
    }
    if (!cache.atmosphereCanvas) {
        const surf = cache.createSurface(
            Math.ceil(width * cache.dpr),
            Math.ceil(height * cache.dpr),
        );
        if (!surf) return false;
        surf.ctx.setTransform(cache.dpr, 0, 0, cache.dpr, 0, 0);
        drawAtmosphericStage(
            surf.ctx,
            width,
            height,
            scale,
            palette,
            1,
            false,
            sceneSide,
        );
        cache.atmosphereCanvas = surf.canvas;
    }
    ctx.drawImage(cache.atmosphereCanvas, 0, 0, width, height);
    return true;
}

export function drawCachedRocks(
    cache: BotanicalRenderCache,
    ctx: CanvasRenderingContext2D,
    scene: BotanicalScene,
    rawProgress: number,
    palette: BotanicalPalette,
): boolean {
    if (scene.rocks.length === 0 || rawProgress < 0.999) return false;
    if (!cache.rocksCache) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const rock of scene.rocks) {
            for (const pt of rock.points) {
                if (pt.x < minX) minX = pt.x;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.y > maxY) maxY = pt.y;
            }
            for (const m of rock.mossDots) {
                const r = Math.max(m.rx, m.ry);
                if (m.x - r < minX) minX = m.x - r;
                if (m.x + r > maxX) maxX = m.x + r;
                if (m.y - r < minY) minY = m.y - r;
                if (m.y + r > maxY) maxY = m.y + r;
            }
        }
        if (!Number.isFinite(minX)) return false;
        const pad = Math.ceil(28 * scene.scale);
        const rx = Math.floor(minX - pad);
        const ry = Math.floor(minY - pad);
        const logicalW = Math.max(2, Math.ceil(maxX + pad - rx));
        const logicalH = Math.max(2, Math.ceil(maxY + pad - ry));
        const surf = cache.createSurface(
            Math.ceil(logicalW * cache.dpr),
            Math.ceil(logicalH * cache.dpr),
        );
        if (!surf) return false;
        surf.ctx.setTransform(cache.dpr, 0, 0, cache.dpr, 0, 0);
        surf.ctx.translate(-rx, -ry);
        for (const rock of scene.rocks) {
            drawRockBase(surf.ctx, rock, 1, scene.scale, palette);
        }
        cache.rocksCache = {
            canvas: surf.canvas,
            minX: rx,
            minY: ry,
            logicalW,
            logicalH,
        };
    }
    const rc = cache.rocksCache;
    ctx.drawImage(rc.canvas, rc.minX, rc.minY, rc.logicalW, rc.logicalH);
    return true;
}

export function drawCachedOrnament(
    cache: BotanicalRenderCache,
    ctx: CanvasRenderingContext2D,
    scene: BotanicalScene,
    o: BotanicalOrnament,
    wx: number,
    wy: number,
    angle: number,
    op: number,
    palette: BotanicalPalette,
    layerA: number,
): boolean {
    if (op < 0.999) return false;
    let sprite = cache.ornaments.get(o);
    if (!sprite) {
        const b = computeOrnamentLocalBounds(o);
        const minX = Math.floor(b.minX);
        const minY = Math.floor(b.minY);
        const logicalW = Math.max(2, Math.ceil(b.maxX - minX));
        const logicalH = Math.max(2, Math.ceil(b.maxY - minY));
        const surf = cache.createSurface(
            Math.ceil(logicalW * cache.dpr),
            Math.ceil(logicalH * cache.dpr),
        );
        if (!surf) return false;
        surf.ctx.setTransform(cache.dpr, 0, 0, cache.dpr, 0, 0);
        surf.ctx.translate(-minX, -minY);
        scene.module.drawOrnament(surf.ctx, o, 0, 0, 0, 1, palette, layerA);
        sprite = {
            canvas: surf.canvas,
            minX,
            minY,
            logicalW,
            logicalH,
        };
        cache.ornaments.set(o, sprite);
    }
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(o.kind === "plumBlossom" ? angle * 0.2 : angle);
    ctx.drawImage(
        sprite.canvas,
        sprite.minX,
        sprite.minY,
        sprite.logicalW,
        sprite.logicalH,
    );
    ctx.restore();
    return true;
}
