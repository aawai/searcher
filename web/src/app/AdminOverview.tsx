import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { routes } from "./routes.ts";
import {
    AlertCircle,
    Bot,
    FileText,
    Globe,
    RefreshCw,
    Users,
} from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import {
    LoadingState,
    Section,
    SectionHeader,
    SettingsCard,
    SettingsRow,
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
    onNavigateTab?: (tab: "users" | "settings" | "audit" | "backup") => void;
}) {
    const [overview, setOverview] = useState<SystemOverviewDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [initialized, setInitialized] = useState(false);
    const [error, setError] = useState("");

    const loadOverview = async () => {
        setLoading(true);
        setError("");
        try {
            const data = await api<SystemOverviewDto>(
                "/api/admin/system/overview",
            );
            setOverview(data);
            setInitialized(true);
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
            {/* Header with Refresh */}
            <SectionHeader
                title="系统概览"
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
                        <span>{loading ? "刷新中…" : "刷新概览"}</span>
                    </Button>
                }
            />

            {error && (
                <StatusBanner tone="error">
                    <div className="flex items-center justify-between gap-4 w-full">
                        <div className="flex items-center gap-2">
                            <AlertCircle size={16} className="shrink-0" />
                            <span>{error}</span>
                        </div>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={loadOverview}
                            disabled={loading}
                        >
                            <RefreshCw
                                size={14}
                                className={loading ? "animate-spin" : ""}
                            />
                            <span>{loading ? "正在重试…" : "重试"}</span>
                        </Button>
                    </div>
                </StatusBanner>
            )}

            {!initialized && loading && (
                <LoadingState>正在加载系统概览…</LoadingState>
            )}

            {initialized && overview && (
                <>
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
                                    {overview.totalUsers}
                                </div>
                                <div className="admin-metric-card-sub">
                                    活跃 {overview.activeUsers} 人 · 禁用{" "}
                                    {overview.disabledUsers} 人
                                </div>
                            </div>
                            <Button
                                variant="link"
                                size="sm"
                                render={
                                    <Link
                                        to={routes.admin("users")}
                                        onClick={() => onNavigateTab?.("users")}
                                    />
                                }
                            >
                                管理用户 →
                            </Button>
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
                                    {`${overview.totalWebApps} / ${overview.totalNotes}`}
                                </div>
                                <div className="admin-metric-card-sub">
                                    已创建 APP 与 Markdown 便签
                                </div>
                            </div>
                            <Button
                                variant="link"
                                size="sm"
                                render={<Link to={routes.home} />}
                            >
                                返回主页浏览 →
                            </Button>
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
                                    {`${overview.totalAiProviders} / ${overview.totalAiModels}`}
                                </div>
                                <div className="admin-metric-card-sub">
                                    系统与用户 Provider 及其生效模型
                                </div>
                            </div>
                            <Button
                                variant="link"
                                size="sm"
                                render={<Link to={routes.settings("ai")} />}
                            >
                                配置 AI Provider →
                            </Button>
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
                                    {overview.totalAuditLogs}
                                </div>
                                <div className="admin-metric-card-sub">
                                    保留周期：{overview.settings
                                        .auditRetentionDays} 天
                                </div>
                            </div>
                            <Button
                                variant="link"
                                size="sm"
                                render={
                                    <Link
                                        to={routes.admin("audit")}
                                        onClick={() => onNavigateTab?.("audit")}
                                    />
                                }
                            >
                                查看详细审计日志 →
                            </Button>
                        </div>
                    </div>

                    {/* System Status and Architecture Info */}
                    <Section title="系统安全与隔离规范" headingLevel={3}>
                        <SettingsCard>
                            <SettingsRow
                                title="主密钥脱敏隔离"
                                description="主加密密钥 (ENCRYPTION_KEY) 仅保存在服务端环境变量中，永不进入 SQLite 数据库、备份 ZIP 归档或配置导出文件。"
                            />
                            <SettingsRow
                                title="安全备份与回滚"
                                description="备份与恢复采用预验证机制 (Manifest + PRAGMA 完整性检查)。执行恢复前自动创建临时快照，异常时自动安全回滚。"
                            />
                            <SettingsRow
                                title="审计脱敏与自动清理"
                                description={`严格过滤密码口令、API 密钥与便签正文。审计日志按可配置保留周期（当前 ${overview.settings.auditRetentionDays} 天）滚动淘汰。`}
                            />
                        </SettingsCard>
                    </Section>
                </>
            )}
        </div>
    );
}
