import type { ComponentType } from "react";
import type { DesktopSceneId } from "@shared/desktop-scenes.ts";

/**
 * 设置页缩略图：独立的轻量静态矢量图，只用主题 token 着色，
 * 不加载场景 chunk，也不运行任何动画。
 */
function NoScenePreview() {
    return (
        <svg viewBox="0 0 320 100" aria-hidden="true" focusable="false">
            <path
                className="settings-scene-preview__ground"
                d="M0 84 C80 78 160 88 240 82 C280 79 300 82 320 80 V100 H0Z"
            />
        </svg>
    );
}

function AmusementParkPreview() {
    return (
        <svg viewBox="0 0 320 100" aria-hidden="true" focusable="false">
            <path
                className="settings-scene-preview__hill"
                d="M0 70 Q20 58 40 70 T80 70 T120 70 T160 70 T200 70 T240 70 T280 70 T320 70 V100 H0Z"
            />
            <path
                className="settings-scene-preview__ground"
                d="M0 84 C80 78 160 88 240 82 C280 79 300 82 320 80 V100 H0Z"
            />
            <path
                className="settings-scene-preview__ride"
                d="M70 80 C96 80 104 32 132 32 C156 32 160 68 184 68 C208 68 212 44 236 44"
            />
            <path
                className="settings-scene-preview__ride"
                strokeWidth="2"
                d="M132 32V80M184 68V80M236 44V80"
            />
            <circle
                className="settings-scene-preview__ride"
                cx="276"
                cy="50"
                r="22"
            />
            <path
                className="settings-scene-preview__ride"
                strokeWidth="1.5"
                d="M276 28V72M254 50H298M260 34L292 66M292 34L260 66M264 80L276 50L288 80"
            />
            <circle
                className="settings-scene-preview__dot"
                cx="276"
                cy="50"
                r="3"
            />
            <path
                className="settings-scene-preview__ride"
                d="M30 76L38 58L46 76Z"
            />
        </svg>
    );
}

export const SCENE_PREVIEWS: Record<DesktopSceneId, ComponentType> = {
    "none": NoScenePreview,
    "amusement-park": AmusementParkPreview,
};
