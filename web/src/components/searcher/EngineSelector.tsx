import { ChevronDown, RotateCw, Sparkles } from "lucide-react";
import { type EngineId, SEARCH_ENGINES } from "@shared/engines.ts";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";
import type { Reachability } from "./SearcherSearchInput.tsx";

export function GoogleIcon({ size = 18 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M22.5 12.25c0-.82-.07-1.61-.21-2.37H12v4.49h5.9c-.25 1.37-1.02 2.53-2.18 3.3v2.75h3.53c2.07-1.9 3.25-4.71 3.25-8.17z"
                fill="#4285F4"
            />
            <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.53-2.75c-.98.66-2.23 1.06-3.75 1.06-2.88 0-5.32-1.94-6.19-4.56H2.16v2.84C3.96 20.48 7.71 23 12 23z"
                fill="#34A853"
            />
            <path
                d="M5.81 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.41 8.56 1 10.23 1 12s.41 3.44 1.16 4.93l3.65-2.84z"
                fill="#FBBC05"
            />
            <path
                d="M12 5.38c1.62 0 3.07.56 4.21 1.66l3.16-3.16C17.45 2.09 14.97 1 12 1 7.71 1 3.96 3.52 2.16 7.07l3.65 2.84c.87-2.62 3.31-4.53 6.19-4.53z"
                fill="#EA4335"
            />
        </svg>
    );
}

export function BingIcon({ size = 18 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path
                d="M5 3v17.5l6-3.4 5.2 2.9V11.2l-4.2-2.4L5 3z"
                fill="#008373"
            />
            <path d="M11 8.8l5.2 2.4-5.2 3.3V8.8z" fill="#00A4EF" />
        </svg>
    );
}

export function BaiduIcon({ size = 18 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="#2932E1"
            xmlns="http://www.w3.org/2000/svg"
        >
            <path d="M12 13.5c-3.1 0-5.5 2-5.5 4.5 0 2 2 3.8 5.5 3.8s5.5-1.8 5.5-3.8c0-2.5-2.4-4.5-5.5-4.5zm-5.8-2.5c1.3 0 2.4-1.5 2.4-3.3 0-1.9-1.1-3.4-2.4-3.4s-2.4 1.5-2.4 3.4c0 1.8 1.1 3.3 2.4 3.3zm11.6 0c1.3 0 2.4-1.5 2.4-3.3 0-1.9-1.1-3.4-2.4-3.4s-2.4 1.5-2.4 3.4c0 1.8 1.1 3.3 2.4 3.3zm-8.8-5.8c1.3 0 2.4-1.7 2.4-3.7S10.3 0 9 0 6.6 1.7 6.6 3.7s1.1 3.7 2.4 3.7zm6 0c1.3 0 2.4-1.7 2.4-3.7S16.3 0 15 0s-2.4 1.7-2.4 3.7 1.1 3.7 2.4 3.7z" />
        </svg>
    );
}

export function DuckDuckGoIcon({ size = 18 }: { size?: number }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <circle cx="12" cy="12" r="11" fill="#DE5833" />
            <path
                d="M12.5 5.5c-2.3 0-4 1.7-4 3.8 0 1.3.6 2.4 1.6 3.1-.3.7-.8 1.3-1.6 1.6 1.8.8 3.8.4 4.8-.8.4.1.8.1 1.2.1 2.3 0 4-1.7 4-3.8s-1.7-4-4-4z"
                fill="#FFF"
            />
            <ellipse cx="14.5" cy="8.2" rx=".8" ry="1" fill="#333" />
            <path
                d="M15.5 9.5c.8.2 2 .5 2.5 1.2-.8.5-2 .5-2.8.2l.3-1.4z"
                fill="#F4AA41"
            />
        </svg>
    );
}

export function EngineIcon({ id, size = 18 }: { id: EngineId; size?: number }) {
    switch (id) {
        case "google":
            return <GoogleIcon size={size} />;
        case "bing":
            return <BingIcon size={size} />;
        case "baidu":
            return <BaiduIcon size={size} />;
        case "duckduckgo":
            return <DuckDuckGoIcon size={size} />;
        default:
            return (
                <span className="engine-mark">
                    {(id as string)[0]?.toUpperCase()}
                </span>
            );
    }
}

export function EngineSelector(
    {
        engine,
        mode,
        onEngineChange,
        onModeChange,
        reachability,
        onCheck,
        isChecking = false,
    }: {
        engine: EngineId;
        mode: "search" | "ai";
        onEngineChange: (id: EngineId) => void;
        onModeChange: (mode: "search" | "ai") => void;
        reachability: Reachability;
        onCheck?: () => void;
        isChecking?: boolean;
    },
) {
    const current = SEARCH_ENGINES.find((item) => item.id === engine);
    const currentStatus = mode === "ai" ? undefined : reachability[engine];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                className="search-engine"
                aria-label={mode === "ai"
                    ? "当前模式: AI 问答，点击切换"
                    : `当前搜索引擎: ${current?.label || engine}，点击切换`}
            >
                {mode === "ai"
                    ? <Sparkles size={18} className="text-accent" />
                    : <EngineIcon id={engine} size={18} />}
                {mode !== "ai" && (
                    <span
                        className={"status-dot " + (!currentStatus
                            ? "unknown"
                            : currentStatus.ok
                            ? "online"
                            : "offline")}
                        role="img"
                        aria-label={!currentStatus
                            ? "尚未检测资源连接"
                            : currentStatus.ok
                            ? "最近检测资源可连接"
                            : "最近检测未成功"}
                        title={currentStatus
                            ? new Date(currentStatus.checkedAt)
                                .toLocaleString() +
                                " · " + currentStatus.latency + "ms"
                            : "尚未检测"}
                    />
                )}
                <ChevronDown size={14} className="engine-chevron" />
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={10}>
                {SEARCH_ENGINES.map((item) => {
                    const status = reachability[item.id];
                    return (
                        <DropdownMenuItem
                            key={item.id}
                            onClick={() => {
                                onModeChange("search");
                                onEngineChange(item.id);
                            }}
                            onSelect={() => {
                                onModeChange("search");
                                onEngineChange(item.id);
                            }}
                        >
                            <span
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    flex: 1,
                                }}
                            >
                                <EngineIcon id={item.id} size={16} />
                                <span>{item.label}</span>
                            </span>
                            <span
                                className={"status-dot " + (!status
                                    ? "unknown"
                                    : status.ok
                                    ? "online"
                                    : "offline")}
                                role="img"
                                aria-label={!status
                                    ? "尚未检测资源连接"
                                    : status.ok
                                    ? "最近检测资源可连接"
                                    : "最近检测未成功"}
                                title={status
                                    ? new Date(status.checkedAt)
                                        .toLocaleString() +
                                        " · " + status.latency + "ms"
                                    : "尚未检测"}
                            />
                        </DropdownMenuItem>
                    );
                })}
                <DropdownMenuItem
                    onClick={() => onModeChange("ai")}
                    onSelect={() => onModeChange("ai")}
                >
                    <span
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            flex: 1,
                        }}
                    >
                        <Sparkles size={16} className="text-accent" />
                        <span>AI 问答</span>
                    </span>
                </DropdownMenuItem>
                {onCheck && (
                    <DropdownMenuItem
                        className="engine-check"
                        closeOnClick={false}
                        disabled={isChecking}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onCheck();
                        }}
                        onSelect={(e) => {
                            e.preventDefault();
                            onCheck();
                        }}
                    >
                        <span
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "8px",
                                width: "100%",
                                justifyContent: "center",
                            }}
                        >
                            <RotateCw
                                size={14}
                                className={isChecking ? "animate-spin" : ""}
                            />
                            <span>
                                {isChecking
                                    ? "正在检测资源连接…"
                                    : "重新检测资源连接"}
                            </span>
                        </span>
                    </DropdownMenuItem>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
