import React, { useEffect, useRef, useState } from "react";
import {
    buildSearchUrl,
    type EngineId,
    SEARCH_ENGINES,
} from "@shared/engines.ts";
import { useAuth } from "../../contexts/AuthContext.tsx";
import { apiFetch } from "../../lib/api.ts";
import { useAvailability } from "./availability.ts";
import { CheckCircle, RefreshCw, Search, WifiOff, XCircle } from "lucide-react";

interface SearchBoxProps {
    searchInputRef: React.RefObject<HTMLInputElement | null>;
}

export const SearchBox: React.FC<SearchBoxProps> = ({ searchInputRef }) => {
    const { user } = useAuth();
    const [selectedEngine, setSelectedEngine] = useState<EngineId>("bing");
    const [defaultEngine, setDefaultEngine] = useState<EngineId>("bing");
    const [query, setQuery] = useState("");
    const isComposingRef = useRef(false);

    const { statuses, recheck } = useAvailability();

    // Load default engine for logged-in user
    useEffect(() => {
        if (user) {
            apiFetch<{ defaultEngine: EngineId }>("/api/preferences")
                .then((res) => {
                    if (res?.defaultEngine) {
                        setDefaultEngine(res.defaultEngine);
                        setSelectedEngine(res.defaultEngine);
                    }
                })
                .catch(() => {});
        } else {
            setDefaultEngine("bing");
            setSelectedEngine("bing");
        }
    }, [user]);

    const handleSearch = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (isComposingRef.current) return;
        const targetUrl = buildSearchUrl(selectedEngine, query);
        if (targetUrl) {
            globalThis.location.href = targetUrl;
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter" && !isComposingRef.current) {
            handleSearch();
        }
    };

    const handleSetDefault = async (
        engineId: EngineId,
        e: React.MouseEvent,
    ) => {
        e.stopPropagation();
        if (!user) return;
        try {
            await apiFetch("/api/preferences", {
                method: "PATCH",
                body: JSON.stringify({ defaultEngine: engineId }),
            });
            setDefaultEngine(engineId);
        } catch {
            alert("设置默认搜索引擎失败");
        }
    };

    const renderStatusBadge = (id: EngineId) => {
        const status = statuses[id];
        switch (status) {
            case "checking":
                return (
                    <RefreshCw
                        size={12}
                        className="spin"
                        style={{ color: "var(--muted)" }}
                    />
                );
            case "reachable":
                return (
                    <CheckCircle
                        size={12}
                        style={{ color: "var(--success)" }}
                    />
                );
            case "failed":
                return <XCircle size={12} style={{ color: "var(--danger)" }} />;
            case "offline":
                return <WifiOff size={12} style={{ color: "var(--muted)" }} />;
            default:
                return null;
        }
    };

    return (
        <div
            style={{
                width: "100%",
                maxWidth: 760,
                margin: "0 auto",
                display: "flex",
                flexDirection: "column",
                gap: 16,
            }}
        >
            {/* Search Input Bar */}
            <form
                onSubmit={handleSearch}
                style={{ position: "relative", width: "100%" }}
            >
                <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onCompositionStart={() => {
                        isComposingRef.current = true;
                    }}
                    onCompositionEnd={() => {
                        isComposingRef.current = false;
                    }}
                    placeholder="输入搜索内容，按 Enter 搜索，按 / 快速聚焦..."
                    style={{
                        width: "100%",
                        height: 64,
                        paddingLeft: 24,
                        paddingRight: 64,
                        fontSize: 18,
                        borderRadius: "var(--radius-lg)",
                        border: "2px solid var(--border)",
                        backgroundColor: "var(--surface)",
                        color: "var(--text)",
                        boxShadow: "var(--shadow-sm)",
                        outline: "none",
                        transition:
                            "border-color var(--transition-fast), box-shadow var(--transition-fast)",
                    }}
                    onFocus={(
                        e,
                    ) => (e.target.style.borderColor = "var(--accent)")}
                    onBlur={(
                        e,
                    ) => (e.target.style.borderColor = "var(--border)")}
                />
                <button
                    type="submit"
                    aria-label="开始搜索"
                    className="btn btn-primary"
                    style={{
                        position: "absolute",
                        right: 8,
                        top: 8,
                        bottom: 8,
                        width: 48,
                        height: 48,
                        minHeight: 48,
                        borderRadius: "var(--radius-md)",
                        padding: 0,
                    }}
                >
                    <Search size={20} />
                </button>
            </form>

            {/* Engine Selection & Availability */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "repeat(auto-fit, minmax(130px, 1fr))",
                        gap: 8,
                    }}
                >
                    {SEARCH_ENGINES.map((engine) => {
                        const isSelected = selectedEngine === engine.id;
                        const isDefault = defaultEngine === engine.id;

                        return (
                            <div
                                key={engine.id}
                                onClick={() => setSelectedEngine(engine.id)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                        setSelectedEngine(engine.id);
                                    }
                                }}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    padding: "8px 12px",
                                    borderRadius: "var(--radius-md)",
                                    border: `1px solid ${
                                        isSelected
                                            ? "var(--accent)"
                                            : "var(--border)"
                                    }`,
                                    backgroundColor: isSelected
                                        ? "rgba(36, 93, 189, 0.08)"
                                        : "var(--surface)",
                                    cursor: "pointer",
                                    userSelect: "none",
                                    transition: "all var(--transition-fast)",
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                    }}
                                >
                                    <span
                                        style={{
                                            fontWeight: isSelected ? 600 : 400,
                                            fontSize: 14,
                                        }}
                                    >
                                        {engine.label}
                                    </span>
                                    {renderStatusBadge(engine.id)}
                                </div>

                                {user && (
                                    <button
                                        type="button"
                                        onClick={(e) =>
                                            handleSetDefault(engine.id, e)}
                                        title={isDefault
                                            ? "当前默认"
                                            : "设为默认"}
                                        style={{
                                            fontSize: 11,
                                            padding: "2px 6px",
                                            borderRadius: "var(--radius-sm)",
                                            backgroundColor: isDefault
                                                ? "var(--accent)"
                                                : "transparent",
                                            color: isDefault
                                                ? "#FFF"
                                                : "var(--muted)",
                                            border: isDefault
                                                ? "none"
                                                : "1px solid var(--border)",
                                        }}
                                    >
                                        {isDefault ? "默认" : "设为默认"}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Status prompt & recheck button */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: 12,
                        color: "var(--muted)",
                        padding: "0 4px",
                    }}
                >
                    <span>
                        仅检测当前浏览器到站点资源的连接，不保证搜索可用；可能受扩展或网络策略影响
                    </span>
                    <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={recheck}
                        style={{
                            fontSize: 12,
                            height: 28,
                            minHeight: 28,
                            padding: "0 6px",
                            gap: 4,
                        }}
                    >
                        <RefreshCw size={12} />
                        <span>重新探测</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
