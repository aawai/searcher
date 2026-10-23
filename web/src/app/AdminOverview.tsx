import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, RefreshCw } from "lucide-react";
import { routes } from "./routes.ts";
import { Button } from "../components/ui/button.tsx";
import {
    LoadingState,
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
    totalDocuments: number;
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
            <div className="admin-toolbar-end">
                <Button
                    type="button"
                    variant="outline"
                    onClick={loadOverview}
                    disabled={loading}
                >
                    <RefreshCw
                        size="1em"
                        className={loading ? "animate-spin" : undefined}
                    />
                    <span>{loading ? "刷新中…" : "刷新"}</span>
                </Button>
            </div>

            {error && (
                <StatusBanner tone="error">
                    <div className="admin-banner-row">
                        <span className="admin-banner-message">
                            <AlertCircle size="1em" />
                            <span>{error}</span>
                        </span>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={loadOverview}
                            disabled={loading}
                        >
                            <span>{loading ? "正在重试…" : "重试"}</span>
                        </Button>
                    </div>
                </StatusBanner>
            )}

            {!initialized && loading && (
                <LoadingState>正在加载系统概览…</LoadingState>
            )}

            {initialized && overview && (
                <div className="admin-stats">
                    <div className="admin-stat">
                        <p className="admin-stat-label">用户规模</p>
                        <p className="admin-stat-value">
                            {overview.totalUsers}
                        </p>
                        <p className="admin-stat-sub">
                            活跃 {overview.activeUsers} 人 · 禁用{" "}
                            {overview.disabledUsers} 人
                        </p>
                        <Button
                            variant="link"
                            size="sm"
                            className="admin-stat-action"
                            render={
                                <Link
                                    to={routes.admin("users")}
                                    onClick={() => onNavigateTab?.("users")}
                                />
                            }
                        >
                            管理用户
                        </Button>
                    </div>

                    <div className="admin-stat">
                        <p className="admin-stat-label">应用 / 笔记</p>
                        <p className="admin-stat-value">
                            {`${overview.totalWebApps} / ${overview.totalDocuments}`}
                        </p>
                        <Button
                            variant="link"
                            size="sm"
                            className="admin-stat-action"
                            render={<Link to={routes.home} />}
                        >
                            返回主页
                        </Button>
                    </div>

                    <div className="admin-stat">
                        <p className="admin-stat-label">AI 提供商 / 模型</p>
                        <p className="admin-stat-value">
                            {`${overview.totalAiProviders} / ${overview.totalAiModels}`}
                        </p>
                        <Button
                            variant="link"
                            size="sm"
                            className="admin-stat-action"
                            render={<Link to={routes.settings("ai")} />}
                        >
                            配置 AI Provider
                        </Button>
                    </div>

                    <div className="admin-stat">
                        <p className="admin-stat-label">审计日志</p>
                        <p className="admin-stat-value">
                            {overview.totalAuditLogs}
                        </p>
                        <p className="admin-stat-sub">
                            保留 {overview.settings.auditRetentionDays} 天
                        </p>
                        <Button
                            variant="link"
                            size="sm"
                            className="admin-stat-action"
                            render={
                                <Link
                                    to={routes.admin("audit")}
                                    onClick={() => onNavigateTab?.("audit")}
                                />
                            }
                        >
                            查看审计日志
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
