import { ChevronDown, RotateCw, Sparkles } from "lucide-react";
import { type EngineId, SEARCH_ENGINES } from "@shared/engines.ts";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../ui/dropdown-menu.tsx";
import type { Reachability } from "./SearcherSearchInput.tsx";

// Brand engine paths, viewBoxes, and colors remain unchanged; sizes use icon tokens.
export function GoogleIcon({ className = "icon-md" }: { className?: string }) {
    return (
        <svg
            width="1em"
            height="1em"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`engine-icon ${className}`}
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

export function BingIcon({ className = "icon-md" }: { className?: string }) {
    return (
        <svg
            width="1em"
            height="1em"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`engine-icon ${className}`}
        >
            <path
                d="M5.5 2v17.2l5.8-3.4 4.8 2.8V11.2l-4-2.4L5.5 2z"
                fill="#008373"
            />
            <path
                d="M11.3 8.8l4.8 2.4-4.8 3.2V8.8z"
                fill="#00A4EF"
            />
        </svg>
    );
}

export function BaiduIcon({ className = "icon-md" }: { className?: string }) {
    return (
        <svg
            width="1em"
            height="1em"
            viewBox="0 0 24 24"
            fill="#2932E1"
            xmlns="http://www.w3.org/2000/svg"
            className={`engine-icon ${className}`}
        >
            <path d="M9.154 0C7.71 0 6.54 1.658 6.54 3.707c0 2.051 1.171 3.71 2.615 3.71 1.446 0 2.614-1.659 2.614-3.71C11.768 1.658 10.6 0 9.154 0zm7.025.594C14.86.58 13.347 2.589 13.2 3.927c-.187 1.745.25 3.487 2.179 3.735 1.933.25 3.175-1.806 3.422-3.364.252-1.555-.995-3.364-2.362-3.674a1.218 1.218 0 0 0-.261-.03zM3.582 5.535a2.811 2.811 0 0 0-.156.008c-2.118.19-2.428 3.24-2.428 3.24-.287 1.41.686 4.425 3.297 3.864 2.617-.561 2.262-3.68 2.183-4.362-.125-1.018-1.292-2.773-2.896-2.75zm16.534 1.753c-2.308 0-2.617 2.119-2.617 3.616 0 1.43.121 3.425 2.988 3.362 2.867-.063 2.553-3.238 2.553-3.988 0-.745-.62-2.99-2.924-2.99zm-8.264 2.478c-1.424.014-2.708.925-3.323 1.947-1.118 1.868-2.863 3.05-3.112 3.363-.25.309-3.61 2.116-2.864 5.42.746 3.301 3.365 3.237 3.365 3.237s1.93.19 4.171-.31c2.24-.495 4.17.123 4.17.123s5.233 1.748 6.665-1.616c1.43-3.364-.808-5.109-.808-5.109s-2.99-2.306-4.736-4.798c-1.072-1.665-2.348-2.268-3.528-2.257zm-2.234 3.84l1.542.024v8.197H7.758c-1.47-.291-2.055-1.292-2.13-1.462-.072-.173-.488-.976-.268-2.343.635-2.049 2.447-2.196 2.447-2.196h1.81zm3.964 2.39v3.881c.096.413.612.488.612.488h1.614v-4.343h1.689v5.782h-3.915c-1.517-.39-1.59-1.465-1.59-1.465v-4.317zm-5.458 1.147c-.66.197-.978.708-1.05.928-.076.22-.247.78-.1 1.269.294 1.095 1.248 1.144 1.248 1.144h1.37v-3.34z" />
        </svg>
    );
}

export function DuckDuckGoIcon(
    { className = "icon-md" }: { className?: string },
) {
    return (
        <svg
            width="1em"
            height="1em"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`engine-icon ${className}`}
        >
            <circle cx="12" cy="12" r="11" fill="#DE5833" />
            <path
                d="M12.2 4.5c-2.8 0-4.8 2.2-4.8 4.8 0 1.2.4 2.2 1.2 3-.5 1-1.5 1.8-2.6 2.1 2.2.8 4.8.2 6.1-1.3.4.1.8.2 1.2.2 2.8 0 4.9-2.2 4.9-4.8s-2.1-4-4.8-4.8c-.4-.1-.8-.2-1.2-.2z"
                fill="#FFFFFF"
            />
            <circle cx="14" cy="8.2" r="0.9" fill="#222222" />
            <path
                d="M15.5 9.2c1.2.3 2.8.8 3.5 1.6-1.1.7-2.7.7-3.8.3l.3-1.9z"
                fill="#F6A838"
            />
            <path
                d="M11 16.8l2.2.8-1.2.8 2.4.6-2.2.8c-.8-.8-1.1-2-1.2-3z"
                fill="#65BC46"
            />
        </svg>
    );
}

export function EngineIcon(
    { id, className = "icon-md" }: { id: EngineId; className?: string },
) {
    switch (id) {
        case "google":
            return <GoogleIcon className={className} />;
        case "bing":
            return <BingIcon className={className} />;
        case "baidu":
            return <BaiduIcon className={className} />;
        case "duckduckgo":
            return <DuckDuckGoIcon className={className} />;
        default:
            return (
                <span className="engine-mark">
                    {((id as string) ?? "?")[0]?.toUpperCase() ?? "?"}
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
        isGuest = false,
    }: {
        engine: EngineId;
        mode: "search" | "ai";
        onEngineChange: (id: EngineId) => void;
        onModeChange: (mode: "search" | "ai") => void;
        reachability: Reachability;
        onCheck?: () => void;
        isChecking?: boolean;
        isGuest?: boolean;
    },
) {
    const current = SEARCH_ENGINES.find((item) => item.id === engine);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                className="search-engine"
                aria-label={mode === "ai"
                    ? "当前模式: AI 问答，点击切换"
                    : `当前搜索引擎: ${current?.label || engine}，点击切换`}
            >
                {mode === "ai"
                    ? <Sparkles size="1em" className="icon-md text-accent" />
                    : <EngineIcon id={engine || "bing"} className="icon-md" />}
                <ChevronDown size="1em" className="icon-sm engine-chevron" />
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
                            <span className="engine-option-label">
                                <EngineIcon id={item.id} className="icon-md" />
                                <span>{item.label}</span>
                            </span>
                            {status && (
                                <span
                                    className="text-xs text-[var(--muted)]"
                                    title={`${
                                        new Date(status.checkedAt)
                                            .toLocaleString()
                                    } · ${status.latency}ms`}
                                >
                                    {status.ok
                                        ? "最近检测可连接"
                                        : "最近检测失败"}
                                </span>
                            )}
                        </DropdownMenuItem>
                    );
                })}
                <DropdownMenuItem
                    onClick={() => onModeChange("ai")}
                    onSelect={() => onModeChange("ai")}
                >
                    <span className="engine-option-label">
                        <Sparkles size="1em" className="icon-md text-accent" />
                        <span>AI 问答</span>
                    </span>
                    {isGuest && (
                        <span className="engine-guest-label">
                            登录后可用
                        </span>
                    )}
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
                        <span className="engine-check-label">
                            <RotateCw
                                size="1em"
                                className={`icon-sm ${
                                    isChecking ? "animate-spin" : ""
                                }`}
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
