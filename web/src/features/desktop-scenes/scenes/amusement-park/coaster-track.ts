import type { Point } from "./coaster-motion.ts";

/**
 * 闭合轨道：先爬升到顶点、俯冲到最右端，再由较低的回程轨道回到起点。
 * 绘制与小车采样使用同一条路径，所以小车永远贴着画出的轨道。
 */
export const TRACK_PATH =
    "M572 140 C600 140 620 106 656 96 L716 52 C736 38 756 42 768 62 " +
    "C788 100 796 130 830 128 C852 126 862 138 850 146 " +
    "C830 154 800 148 780 142 C750 132 720 138 700 144 " +
    "C670 150 640 142 620 148 C596 152 572 152 572 140 Z";

/** 立柱：x 坐标与对应位置的轨道高度（顶端 y），落地线 y=150。 */
export const TRACK_PILLARS: ReadonlyArray<readonly [x: number, top: number]> = [
    [606, 134],
    [656, 96],
    [688, 73],
    [720, 51],
    [750, 44],
    [772, 68],
    [794, 112],
    [830, 128],
];
export const TRACK_GROUND_Y = 150;

/** 三节车厢沿轨道的间距（弧长）。第一节为领头车厢。 */
export const CAR_DISTANCES: readonly number[] = [0, 15, 30];
export const CAR_STYLES: readonly string[] = ["sp-fg", "sp-fr", "sp-fg"];

/** 静态姿态（减少动态效果或首帧）：领头车厢停在爬升段中部。 */
export const STATIC_CAR_ANCHOR: Point = { x: 676, y: 80 };
