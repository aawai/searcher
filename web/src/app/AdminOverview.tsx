import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { routes } from "./routes.ts";
import {
    Activity,
    AlertCircle,
    Bot,
    Database,
    FileText,
    Globe,
    HardDrive,
    RefreshCw,
    Shield,
    Users,
} from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { api } from "../lib/api.ts";
import { errorMessage } from "./state.tsx";

export interface SystemSettingsDto {
    auditRetentionDays: number;
    allowRegistration: boolean;
    defaultEngine: "google" | "bing" | "baidu" | "duckduckgo";
    defaultTheme: "system" | "light" | "dark";
    defaultSearchTarget: "same" | "new";
}

export interface SystemOverviewDto {
    totalUsers: number;
    activeUsers: number;
    disabledUsers: number;
    totalWebApps: number;
    totalNotes: number;
    totalAiProviders: number;
    totalAiModels: number;
    totalAuditLogs: number;
    settings: SystemSettingsDto;
}

export function AdminOverview({
    onNavigateTab,
}: {
    onNavigateTab: (tab: "users" | "settings" | "audit" | "backup") => void;
}) {
    const [overview, setOverview] = useState<SystemOverviewDto | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const loadOverview = async () => {
        setLoading(true);
        setError("");
        try {
            const data = await api<SystemOverviewDto>(
                "/api/admin/system/overview",
            );
            setOverview(data);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadOverview();
    }, []);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {error && (
                <div
                    role="alert"
                    style={{
                        padding: "12px 16px",
                        borderRadius: "8px",
                        background:
                            "color-mix(in srgb, var(--danger) 15%, var(--surface))",
                        color: "var(--danger)",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "14px",
                    }}
                >
                    <AlertCircle size={18} />
                    <span>{error}</span>
                </div>
            )}

            {/* Header with Refresh */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                }}
            >
                <div>
                    <h2
                        style={{ fontSize: "20px", fontWeight: 700, margin: 0 }}
                    >
                        系统概览 (Overview)
                    </h2>
                    <p
                        style={{
                            color: "var(--muted)",
                            margin: "4px 0 0",
                            fontSize: "14px",
                        }}
                    >
                        实时统计、服务健康与基础配置概览
                    </p>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    onClick={loadOverview}
                    disabled={loading}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                    }}
                >
                    <RefreshCw
                        size={15}
                        className={loading ? "animate-spin" : ""}
                    />
                    <span>刷新概览</span>
                </Button>
            </div>

            {/* Metric Cards Grid */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                    gap: "16px",
                }}
            >
                {/* 1. Users */}
                <div
                    style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        padding: "20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <span
                            style={{
                                fontSize: "14px",
                                color: "var(--muted)",
                                fontWeight: 500,
                            }}
                        >
                            用户规模
                        </span>
                        <div
                            style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "8px",
                                background: "var(--accent-subtle)",
                                display: "grid",
                                placeItems: "center",
                                color: "var(--accent)",
                            }}
                        >
                            <Users size={18} />
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: "28px", fontWeight: 700 }}>
                            {overview ? overview.totalUsers : "—"}
                        </div>
                        <div
                            style={{
                                fontSize: "13px",
                                color: "var(--muted)",
                                marginTop: "4px",
                            }}
                        >
                            活跃 {overview?.activeUsers ?? 0} 人 · 禁用{" "}
                            {overview?.disabledUsers ?? 0} 人
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() =>
                            onNavigateTab("users")}
                        style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--accent)",
                            fontSize: "13px",
                            cursor: "pointer",
                            textAlign: "left",
                            padding: 0,
                            fontWeight: 500,
                        }}
                    >
                        管理用户 →
                    </button>
                </div>

                {/* 2. WebApps & Notes */}
                <div
                    style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        padding: "20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <span
                            style={{
                                fontSize: "14px",
                                color: "var(--muted)",
                                fontWeight: 500,
                            }}
                        >
                            应用与便签
                        </span>
                        <div
                            style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "8px",
                                background: "var(--accent-subtle)",
                                display: "grid",
                                placeItems: "center",
                                color: "var(--accent)",
                            }}
                        >
                            <Globe size={18} />
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: "28px", fontWeight: 700 }}>
                            {overview
                                ? `${overview.totalWebApps} / ${overview.totalNotes}`
                                : "—"}
                        </div>
                        <div
                            style={{
                                fontSize: "13px",
                                color: "var(--muted)",
                                marginTop: "4px",
                            }}
                        >
                            已创建 APP 与 Markdown 便签
                        </div>
                    </div>
                    <Link
                        to={routes.home}
                        style={{
                            color: "var(--accent)",
                            fontSize: "13px",
                            textDecoration: "none",
                            fontWeight: 500,
                        }}
                    >
                        返回主页浏览 →
                    </Link>
                </div>

                {/* 3. AI Providers & Models */}
                <div
                    style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        padding: "20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <span
                            style={{
                                fontSize: "14px",
                                color: "var(--muted)",
                                fontWeight: 500,
                            }}
                        >
                            AI 服务与模型
                        </span>
                        <div
                            style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "8px",
                                background: "var(--accent-subtle)",
                                display: "grid",
                                placeItems: "center",
                                color: "var(--accent)",
                            }}
                        >
                            <Bot size={18} />
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: "28px", fontWeight: 700 }}>
                            {overview
                                ? `${overview.totalAiProviders} / ${overview.totalAiModels}`
                                : "—"}
                        </div>
                        <div
                            style={{
                                fontSize: "13px",
                                color: "var(--muted)",
                                marginTop: "4px",
                            }}
                        >
                            系统与用户 Provider 及其生效模型
                        </div>
                    </div>
                    <Link
                        to={routes.settings("ai")}
                        style={{
                            color: "var(--accent)",
                            fontSize: "13px",
                            textDecoration: "none",
                            fontWeight: 500,
                        }}
                    >
                        配置 AI Provider →
                    </Link>
                </div>

                {/* 4. Audit Logs */}
                <div
                    style={{
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        padding: "20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                        }}
                    >
                        <span
                            style={{
                                fontSize: "14px",
                                color: "var(--muted)",
                                fontWeight: 500,
                            }}
                        >
                            安全审计日志
                        </span>
                        <div
                            style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "8px",
                                background: "var(--accent-subtle)",
                                display: "grid",
                                placeItems: "center",
                                color: "var(--accent)",
                            }}
                        >
                            <FileText size={18} />
                        </div>
                    </div>
                    <div>
                        <div style={{ fontSize: "28px", fontWeight: 700 }}>
                            {overview ? overview.totalAuditLogs : "—"}
                        </div>
                        <div
                            style={{
                                fontSize: "13px",
                                color: "var(--muted)",
                                marginTop: "4px",
                            }}
                        >
                            保留周期：{overview?.settings.auditRetentionDays ??
                                90} 天
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onNavigateTab("audit")}
                        style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--accent)",
                            fontSize: "13px",
                            cursor: "pointer",
                            textAlign: "left",
                            padding: 0,
                            fontWeight: 500,
                        }}
                    >
                        查看详细审计日志 →
                    </button>
                </div>
            </div>

            {/* System Status and Architecture Info */}
            <div
                style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius)",
                    padding: "24px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                    }}
                >
                    <Shield size={20} style={{ color: "var(--accent)" }} />
                    <h3
                        style={{ fontSize: "16px", fontWeight: 600, margin: 0 }}
                    >
                        系统安全与隔离规范 (Specification §15 / §16 / §18)
                    </h3>
                </div>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "repeat(auto-fit, minmax(280px, 1fr))",
                        gap: "16px",
                        fontSize: "14px",
                    }}
                >
                    <div
                        style={{
                            padding: "16px",
                            borderRadius: "8px",
                            background: "var(--background)",
                            border: "1px solid var(--border)",
                        }}
                    >
                        <div
                            style={{
                                fontWeight: 600,
                                marginBottom: "6px",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                            }}
                        >
                            <HardDrive size={16} />
                            <span>主密钥脱敏隔离</span>
                        </div>
                        <p
                            style={{
                                color: "var(--muted)",
                                margin: 0,
                                fontSize: "13px",
                                lineHeight: 1.5,
                            }}
                        >
                            主加密密钥 (ENCRYPTION_KEY)
                            仅保存在服务端环境变量中，永不进入 SQLite
                            数据库、备份 ZIP 归档或配置导出文件。
                        </p>
                    </div>

                    <div
                        style={{
                            padding: "16px",
                            borderRadius: "8px",
                            background: "var(--background)",
                            border: "1px solid var(--border)",
                        }}
                    >
                        <div
                            style={{
                                fontWeight: 600,
                                marginBottom: "6px",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                            }}
                        >
                            <Database size={16} />
                            <span>安全备份与回滚</span>
                        </div>
                        <p
                            style={{
                                color: "var(--muted)",
                                margin: 0,
                                fontSize: "13px",
                                lineHeight: 1.5,
                            }}
                        >
                            备份与恢复采用预验证机制 (Manifest + PRAGMA
                            完整性检查)。执行恢复前自动创建临时快照，异常时自动安全回滚。
                        </p>
                    </div>

                    <div
                        style={{
                            padding: "16px",
                            borderRadius: "8px",
                            background: "var(--background)",
                            border: "1px solid var(--border)",
                        }}
                    >
                        <div
                            style={{
                                fontWeight: 600,
                                marginBottom: "6px",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                            }}
                        >
                            <Activity size={16} />
                            <span>审计脱敏与自动清理</span>
                        </div>
                        <p
                            style={{
                                color: "var(--muted)",
                                margin: 0,
                                fontSize: "13px",
                                lineHeight: 1.5,
                            }}
                        >
                            严格过滤密码口令、API
                            密钥与便签正文。审计日志按可配置保留周期（当前{" "}
                            {overview?.settings.auditRetentionDays ?? 90}{" "}
                            天）滚动淘汰。
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
