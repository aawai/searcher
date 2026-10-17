import { useId } from "react";
import type { SceneProps } from "../../scene-types.ts";
import { useMediaQuery } from "../../use-scene-environment.ts";
import { Coaster } from "./Coaster.tsx";
import { BackGround, FrontGround, LandscapeDefs } from "./Landscape.tsx";
import { Visitors } from "./People.tsx";
import {
    Balloon,
    Carousel,
    Clouds,
    FerrisWheel,
    Flags,
    MiniTrain,
    SwingShip,
    TicketBooth,
} from "./Rides.tsx";
import "./amusement-park.css";

/** 完整桌面构图与窄屏构图（保留过山车、售票亭、摩天轮等核心主体）。 */
const FULL_VIEW_BOX = "0 0 1440 200";
const COMPACT_VIEW_BOX = "400 0 800 200";
const COMPACT_QUERY = "(max-width: 640px)";

/**
 * 原创 2.5D 微缩游乐场：分层 SVG（远景山脊与云、中景设施、前景草地与小景），
 * 背景透明，由壁纸负责整体氛围。运动由 CSS 动画完成，仅小车沿路径运动使用
 * 单个受控的 requestAnimationFrame。
 */
export default function AmusementParkScene({ running }: SceneProps) {
    const compact = useMediaQuery(COMPACT_QUERY);
    const instance = useId().replaceAll(":", "");
    const patternId = `sp-pattern-${instance}`;
    const pineId = `sp-pine-${instance}`;

    return (
        <svg
            className="scene-park"
            viewBox={compact ? COMPACT_VIEW_BOX : FULL_VIEW_BOX}
            preserveAspectRatio="xMidYMax slice"
            focusable="false"
            aria-hidden="true"
        >
            <LandscapeDefs patternId={patternId} pineId={pineId} />
            <Clouds />
            <BackGround patternId={patternId} />
            <Flags />
            <Balloon />
            <Carousel />
            <TicketBooth />
            <Coaster running={running} />
            <SwingShip />
            <FerrisWheel />
            <FrontGround patternId={patternId} pineId={pineId} />
            <Visitors />
            <MiniTrain />
        </svg>
    );
}
