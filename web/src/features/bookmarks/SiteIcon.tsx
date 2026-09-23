import React, { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";

interface SiteIconProps {
    url: string;
    title: string;
    size?: number;
}

const PALETTE = [
    "#245DBD",
    "#26664C",
    "#9C413D",
    "#7B4DB5",
    "#B56A1E",
    "#28738A",
    "#8C5824",
    "#446B8C",
];

function getFallbackColor(hostname: string): string {
    let hash = 0;
    for (let i = 0; i < hostname.length; i++) {
        hash = (hash << 5) - hash + hostname.charCodeAt(i);
        hash |= 0;
    }
    const index = Math.abs(hash) % PALETTE.length;
    return PALETTE[index];
}

export const SiteIcon: React.FC<SiteIconProps> = (
    { url, title, size = 40 },
) => {
    const [stage, setStage] = useState<"favicon" | "apple" | "fallback">(
        "favicon",
    );
    const [retryCount, setRetryCount] = useState(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    let hostname = "";
    let origin = "";

    try {
        const parsed = new URL(url);
        hostname = parsed.hostname;
        // HTTPS pages requesting HTTP bookmarks should attempt HTTPS icons to avoid mixed content
        if (
            globalThis.location.protocol === "https:" &&
            parsed.protocol === "http:"
        ) {
            origin = `https://${parsed.host}`;
        } else {
            origin = parsed.origin;
        }
    } catch {
        hostname = url;
    }

    // Clear timers and reset stage when url or retryCount changes
    useEffect(() => {
        setStage("favicon");
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, [url, retryCount]);

    const handleTimeoutOrError = (currentStage: "favicon" | "apple") => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (currentStage === "favicon") {
            setStage("apple");
        } else {
            setStage("fallback");
        }
    };

    useEffect(() => {
        if (stage === "favicon" || stage === "apple") {
            timerRef.current = globalThis.setTimeout(() => {
                handleTimeoutOrError(stage);
            }, 4000);
        }
        return () => {
            if (timerRef.current) {
                clearTimeout(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [stage]);

    const fallbackChar = (title.trim() || hostname).charAt(0).toUpperCase() ||
        "?";
    const bgColor = getFallbackColor(hostname);

    if (!origin || stage === "fallback") {
        return (
            <div
                style={{
                    position: "relative",
                    width: size,
                    height: size,
                    flexShrink: 0,
                }}
                className="site-icon-fallback-container"
            >
                <div
                    role="img"
                    aria-label={`${title} 图标`}
                    style={{
                        width: size,
                        height: size,
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: bgColor,
                        color: "#FFFFFF",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 600,
                        fontSize: Math.floor(size * 0.45),
                        userSelect: "none",
                    }}
                >
                    {fallbackChar}
                </div>
                <button
                    type="button"
                    className="btn-ghost site-icon-retry-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        setRetryCount((c) => c + 1);
                    }}
                    aria-label="重试图标"
                    title="重试图标"
                    style={{
                        position: "absolute",
                        inset: 0,
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: "rgba(0, 0, 0, 0.5)",
                        color: "#FFFFFF",
                        display: "none",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        padding: 0,
                    }}
                >
                    <RefreshCw size={14} />
                </button>
            </div>
        );
    }

    const iconSrc = stage === "favicon"
        ? `${origin}/favicon.ico`
        : `${origin}/apple-touch-icon.png`;

    return (
        <div
            style={{
                width: size,
                height: size,
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                overflow: "hidden",
            }}
        >
            <img
                src={iconSrc}
                alt=""
                referrerPolicy="no-referrer"
                loading="lazy"
                style={{
                    width: 24,
                    height: 24,
                    objectFit: "contain",
                }}
                onLoad={() => {
                    if (timerRef.current) {
                        clearTimeout(timerRef.current);
                        timerRef.current = null;
                    }
                }}
                onError={() => {
                    handleTimeoutOrError(stage);
                }}
            />
        </div>
    );
};
