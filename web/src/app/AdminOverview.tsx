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
import {
    SectionHeader,
    StatusBanner,
} from "../components/searcher/semantic.tsx";
import { api } from "../lib/api.ts";
import { errorMessage } from "./state.tsx";
import "./admin.css";
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
        <div className="semantic-section">
            {error && (
                <StatusBanner tone="error">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                </StatusBanner>
            )}

            {/* Header with Refresh */}
            <SectionHeader
                title="系统概览 (Overview)"
                description="实时统计、服务健康与基础配置概览"
                actions={
                    <Button
                        type="button"
                        variant="outline"
                        onClick={loadOverview}
                        disabled={loading}
                    >
                        <RefreshCw
                            size={15}
                            className={loading ? "animate-spin" : ""}
                        />
                        <span>刷新概览</span>
                    </Button>
                }
            />

            {/* Metric Cards Grid */}
            <div className="admin-overview-grid">
                {/* 1. Users */}
                <div className="admin-metric-card">
                    <div className="admin-metric-card-header">
                        <span className="admin-metric-card-title">
                            用户规模
                        </span>
                        <div className="admin-metric-card-icon">
                            <Users size={18} />
                        </div>
                    </div>
                    <div>
                        <div className="admin-metric-card-value">
                            {overview ? overview.totalUsers : "—"}
                        </div>
                        <div className="admin-metric-card-sub">
                            活跃 {overview?.activeUsers ?? 0} 人 · 禁用{" "}
                            {overview?.disabledUsers ?? 0} 人
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onNavigateTab("users")}
                        className="admin-metric-card-link"
                    >
                        管理用户 →
                    </button>
                </div>

                {/* 2. WebApps & Notes */}
                <div className="admin-metric-card">
                    <div className="admin-metric-card-header">
                        <span className="admin-metric-card-title">
                            应用与便签
                        </span>
                        <div className="admin-metric-card-icon">
                            <Globe size={18} />
                        </div>
                    </div>
                    <div>
                        <div className="admin-metric-card-value">
                            {overview
                                ? `${overview.totalWebApps} / ${overview.totalNotes}`
                                : "—"}
                        </div>
                        <div className="admin-metric-card-sub">
                            已创建 APP 与 Markdown 便签
                        </div>
                    </div>
                    <Link
                        to={routes.home}
                        className="admin-metric-card-link"
                    >
                        返回主页浏览 →
                    </Link>
                </div>

                {/* 3. AI Providers & Models */}
                <div className="admin-metric-card">
                    <div className="admin-metric-card-header">
                        <span className="admin-metric-card-title">
                            AI 服务与模型
                        </span>
                        <div className="admin-metric-card-icon">
                            <Bot size={18} />
                        </div>
                    </div>
                    <div>
                        <div className="admin-metric-card-value">
                            {overview
                                ? `${overview.totalAiProviders} / ${overview.totalAiModels}`
                                : "—"}
                        </div>
                        <div className="admin-metric-card-sub">
                            系统与用户 Provider 及其生效模型
                        </div>
                    </div>
                    <Link
                        to={routes.settings("ai")}
                        className="admin-metric-card-link"
                    >
                        配置 AI Provider →
                    </Link>
                </div>

                {/* 4. Audit Logs */}
                <div className="admin-metric-card">
                    <div className="admin-metric-card-header">
                        <span className="admin-metric-card-title">
                            安全审计日志
                        </span>
                        <div className="admin-metric-card-icon">
                            <FileText size={18} />
                        </div>
                    </div>
                    <div>
                        <div className="admin-metric-card-value">
                            {overview ? overview.totalAuditLogs : "—"}
                        </div>
                        <div className="admin-metric-card-sub">
                            保留周期：{overview?.settings.auditRetentionDays ??
                                90} 天
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => onNavigateTab("audit")}
                        className="admin-metric-card-link"
                    >
                        查看详细审计日志 →
                    </button>
                </div>
            </div>

            {/* System Status and Architecture Info */}
            <div className="admin-spec-card-container">
                <div className="admin-spec-card-header">
                    <Shield size={20} />
                    <h3>
                        系统安全与隔离规范 (Specification §15 / §16 / §18)
                    </h3>
                </div>
                <div className="admin-spec-grid">
                    <div className="admin-spec-card">
                        <div className="admin-spec-card-title">
                            <HardDrive size={16} />
                            <span>主密钥脱敏隔离</span>
                        </div>
                        <p className="admin-spec-card-desc">
                            主加密密钥 (ENCRYPTION_KEY)
                            仅保存在服务端环境变量中，永不进入 SQLite
                            数据库、备份 ZIP 归档或配置导出文件。
                        </p>
                    </div>

                    <div className="admin-spec-card">
                        <div className="admin-spec-card-title">
                            <Database size={16} />
                            <span>安全备份与回滚</span>
                        </div>
                        <p className="admin-spec-card-desc">
                            备份与恢复采用预验证机制 (Manifest + PRAGMA
                            完整性检查)。执行恢复前自动创建临时快照，异常时自动安全回滚。
                        </p>
                    </div>

                    <div className="admin-spec-card">
                        <div className="admin-spec-card-title">
                            <Activity size={16} />
                            <span>审计脱敏与自动清理</span>
                        </div>
                        <p className="admin-spec-card-desc">
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
