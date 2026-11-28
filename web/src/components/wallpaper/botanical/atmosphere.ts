import { clamp, easeOutCubic } from "./physics.ts";
import type { BotanicalPalette } from "./types.ts";

export function drawAtmosphericStage(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    scale: number,
    pal: BotanicalPalette,
    rawProgress: number,
    embedded: boolean,
    sceneSide: "left" | "right" = "right",
): void {
    if (pal.overPhoto || pal.solidSurface || rawProgress <= 0.06) return;
    const stageFade = easeOutCubic(clamp((rawProgress - 0.06) / 0.58, 0, 1)) *
        (embedded ? 0.68 : 1);
    if (stageFade <= 0.01) return;

    const isNarrow = !embedded && width < 720;
    const sideX = (rightOffset: number) =>
        sceneSide === "left" ? rightOffset : width - rightOffset;

    // 宋元折枝「计白当黑 · 无痕烘染」：去除具象远山与月轮轮廓，在生长侧与中轴外肩铺设无边气韵微晕，供毛玻璃折射温润植物玉色
    const bokashiZones = [
        {
            x: sideX((isNarrow ? 88 : 165) * scale),
            y: (isNarrow ? 132 : 112) * scale,
            rx: (isNarrow ? 190 : 420) * scale,
            ry: (isNarrow ? 120 : 240) * scale,
            lightInkA: 0.028,
            lightPaperA: 0.24,
            darkAirA: 0.022,
            darkSubA: 0.010,
            useAccentWash: false,
        },
        {
            x: sideX((isNarrow ? 96 : 190) * scale),
            y: height - (isNarrow ? 120 : 145) * scale,
            rx: (isNarrow ? 195 : 440) * scale,
            ry: (isNarrow ? 125 : 250) * scale,
            lightInkA: 0.022,
            lightPaperA: 0.18,
            darkAirA: 0.016,
            darkSubA: 0.014,
            useAccentWash: false,
        },
        {
            x: sideX((isNarrow ? 148 : 455) * scale),
            y: height * 0.41,
            rx: (isNarrow ? 180 : 360) * scale,
            ry: (isNarrow ? 102 : 198) * scale,
            lightInkA: 0.012,
            lightPaperA: 0.14,
            darkAirA: 0.012,
            darkSubA: 0.018,
            useAccentWash: true,
        },
    ];

    for (const z of bokashiZones) {
        ctx.save();
        if (pal.isDark) {
            ctx.globalCompositeOperation = "screen";
        }
        ctx.translate(z.x, z.y);
        ctx.scale(1, z.ry / Math.max(1, z.rx));
        const g = ctx.createRadialGradient(
            0,
            0,
            1,
            0,
            0,
            Math.max(2, z.rx),
        );
        if (z.useAccentWash) {
            g.addColorStop(
                0,
                pal.wash("accent", (pal.isDark ? 0.036 : 0.028) * stageFade),
            );
            g.addColorStop(
                0.52,
                pal.wash("sub", (pal.isDark ? 0.020 : 0.016) * stageFade),
            );
            g.addColorStop(1, pal.wash("sub", 0));
        } else if (pal.isDark) {
            g.addColorStop(
                0,
                `rgba(214,226,246,${(z.darkAirA * stageFade).toFixed(4)})`,
            );
            g.addColorStop(0.48, pal.wash("sub", z.darkSubA * stageFade));
            g.addColorStop(1, "rgba(214,226,246,0)");
        } else {
            g.addColorStop(0, pal.wash("sub", z.lightInkA * 0.72 * stageFade));
            g.addColorStop(
                0.38,
                pal.wash("sub", z.lightInkA * 0.34 * stageFade),
            );
            g.addColorStop(
                0.72,
                pal.wash("sub", z.lightInkA * 0.08 * stageFade),
            );
            g.addColorStop(1, pal.wash("sub", 0));
        }
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, z.rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
