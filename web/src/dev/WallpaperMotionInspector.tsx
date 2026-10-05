import { useEffect, useState } from "react";
import "./wallpaper-motion-inspector.css";

/**
 * Dev-only Motion Inspector (Issue #116 Section P1 / Step 37)
 * Enabled via query param `?motion_inspector` or localStorage `searcher:motion_inspector=true`.
 */
export function WallpaperMotionInspector() {
    const [enabled, setEnabled] = useState(false);
    const [speedMultiplier, setSpeedMultiplier] = useState(1);
    const [isPaused, setIsPaused] = useState(false);

    const [stats, setStats] = useState({
        mode: "off",
        level: "soft",
        phase: "0.00",
        activeWriters: 0,
        state: "idle",
    });

    useEffect(() => {
        if (typeof globalThis.location === "undefined") return;
        const urlParams = new URLSearchParams(globalThis.location.search);
        const hasQuery = urlParams.has("motion_inspector");
        const hasStorage =
            globalThis.localStorage?.getItem("searcher:motion_inspector") ===
                "true";
        setEnabled(hasQuery || hasStorage);
    }, []);

    useEffect(() => {
        if (!enabled || typeof globalThis.document === "undefined") return;
        const interval = setInterval(() => {
            const surface = document.querySelector(".wallpaper-surface");
            const mode = surface?.getAttribute("data-motion") ?? "off";
            const level = surface?.getAttribute("data-motion-level") ?? "soft";

            const img = document.querySelector(".wallpaper-surface__image");
            const anims = img ? (img as HTMLElement).getAnimations() : [];
            const activeWriters = anims.filter((a) =>
                a.playState === "running"
            ).length;

            let phase = "0.00";
            if (anims[0] && typeof anims[0].currentTime === "number") {
                const dur = anims[0].effect?.getTiming()?.duration;
                if (typeof dur === "number" && dur > 0) {
                    phase = ((anims[0].currentTime % dur) / dur).toFixed(2);
                }
            }

            setStats({
                mode,
                level,
                phase,
                activeWriters,
                state: isPaused
                    ? "paused"
                    : activeWriters > 0
                    ? "running"
                    : "idle",
            });
        }, 150);

        return () => clearInterval(interval);
    }, [enabled, isPaused]);

    if (!enabled) return null;

    const handleSpeedChange = (mult: number) => {
        setSpeedMultiplier(mult);
        const img = document.querySelector(".wallpaper-surface__image");
        if (img) {
            const anims = (img as HTMLElement).getAnimations();
            for (const anim of anims) {
                anim.playbackRate = mult;
            }
        }
    };

    const handleTogglePause = () => {
        const next = !isPaused;
        setIsPaused(next);
        const img = document.querySelector(".wallpaper-surface__image");
        if (img) {
            const anims = (img as HTMLElement).getAnimations();
            for (const anim of anims) {
                if (next) anim.pause();
                else anim.play();
            }
        }
    };

    return (
        <aside
            className="wallpaper-motion-inspector"
            data-testid="wallpaper-motion-inspector"
            aria-label="Wallpaper Motion Inspector"
        >
            <div className="wallpaper-motion-inspector__header">
                <span>Motion Inspector</span>
                <span className="wallpaper-motion-inspector__value">DEV</span>
            </div>
            <div className="wallpaper-motion-inspector__body">
                <div className="wallpaper-motion-inspector__row">
                    <span className="wallpaper-motion-inspector__label">
                        Mode:
                    </span>
                    <span className="wallpaper-motion-inspector__value">
                        {stats.mode}
                    </span>
                </div>
                <div className="wallpaper-motion-inspector__row">
                    <span className="wallpaper-motion-inspector__label">
                        Level:
                    </span>
                    <span className="wallpaper-motion-inspector__value">
                        {stats.level}
                    </span>
                </div>
                <div className="wallpaper-motion-inspector__row">
                    <span className="wallpaper-motion-inspector__label">
                        Phase:
                    </span>
                    <span className="wallpaper-motion-inspector__value">
                        {stats.phase}
                    </span>
                </div>
                <div className="wallpaper-motion-inspector__row">
                    <span className="wallpaper-motion-inspector__label">
                        State:
                    </span>
                    <span className="wallpaper-motion-inspector__value">
                        {stats.state}
                    </span>
                </div>
                <div className="wallpaper-motion-inspector__row">
                    <span className="wallpaper-motion-inspector__label">
                        Active Writers:
                    </span>
                    <span className="wallpaper-motion-inspector__value">
                        {stats.activeWriters}
                    </span>
                </div>

                <div className="wallpaper-motion-inspector__controls">
                    <button
                        type="button"
                        className={`wallpaper-motion-inspector__btn ${
                            isPaused
                                ? "wallpaper-motion-inspector__btn--active"
                                : ""
                        }`}
                        onClick={handleTogglePause}
                    >
                        {isPaused ? "Resume" : "Pause"}
                    </button>
                    <button
                        type="button"
                        className={`wallpaper-motion-inspector__btn ${
                            speedMultiplier === 0.25
                                ? "wallpaper-motion-inspector__btn--active"
                                : ""
                        }`}
                        onClick={() => handleSpeedChange(0.25)}
                    >
                        0.25x
                    </button>
                    <button
                        type="button"
                        className={`wallpaper-motion-inspector__btn ${
                            speedMultiplier === 1
                                ? "wallpaper-motion-inspector__btn--active"
                                : ""
                        }`}
                        onClick={() => handleSpeedChange(1)}
                    >
                        1x
                    </button>
                    <button
                        type="button"
                        className={`wallpaper-motion-inspector__btn ${
                            speedMultiplier === 4
                                ? "wallpaper-motion-inspector__btn--active"
                                : ""
                        }`}
                        onClick={() => handleSpeedChange(4)}
                    >
                        4x
                    </button>
                </div>
            </div>
        </aside>
    );
}
