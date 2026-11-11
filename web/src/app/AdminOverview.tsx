import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, RefreshCw } from "lucide-react";
import type { ThemeId } from "@shared/contracts.ts";
import { routes } from "./routes.ts";
import { Button } from "../components/ui/button.tsx";
import {
    EmptyState,
    LoadingState,
    SettingsGroup,
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
    defaultTheme: ThemeId;
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

/** Admin tabs replace the history entry like the local navigation does. */
function RowLink(
    { to, label, accessibleLabel, replace = false }: {
        to: string;
        label: string;
        accessibleLabel: string;
        replace?: boolean;
    },
) {
    return (
        <Button
            variant="ghost"
            aria-label={accessibleLabel}
            render={<Link to={to} replace={replace} />}
        >
            {label}
            <ChevronRight size="1em" className="icon-sm" aria-hidden="true" />
        </Button>
    );
}

export function AdminOverview() {
    const [overview, setOverview] = useState<SystemOverviewDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadOverview = async () => {
        setLoading(true);
        setError("");
        try {
            setOverview(
                await api<SystemOverviewDto>("/api/admin/system/overview"),
            );
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadOverview();
    }, []);

    if (!overview) {
        return (
            <div className="semantic-section" data-content="grouped">
                {loading
                    ? <LoadingState>正在加载系统概览…</LoadingState>
                    : (
                        <EmptyState
                            headingLevel={3}
                            title="无法加载系统概览"
                            description={error}
                            action={
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => void loadOverview()}
                                >
                                    重试
                                </Button>
                            }
                        />
                    )}
            </div>
        );
    }

    return (
        <div className="semantic-section" data-content="grouped">
            {error && (
                <StatusBanner tone="error" density="compact">
                    {error}
                </StatusBanner>
            )}
            <SettingsGroup
                title="概况"
                actions={
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => void loadOverview()}
                        disabled={loading}
                    >
                        <RefreshCw
                            size="1em"
                            className={loading ? "animate-spin" : undefined}
                        />
                        <span>{loading ? "刷新中…" : "刷新"}</span>
                    </Button>
                }
            >
                <SettingsRow title="用户">
                    <span className="admin-value">
                        {overview.totalUsers} 人 · 活跃 {overview.activeUsers}
                        {" "}
                        · 禁用 {overview.disabledUsers}
                    </span>
                    <RowLink
                        to={routes.admin("users")}
                        replace
                        label="管理"
                        accessibleLabel="管理用户"
                    />
                </SettingsRow>
                <SettingsRow title="应用 / 笔记">
                    <span className="admin-value">
                        {overview.totalWebApps} / {overview.totalDocuments}
                    </span>
                </SettingsRow>
                <SettingsRow title="AI 服务商 / 模型">
                    <span className="admin-value">
                        {overview.totalAiProviders} / {overview.totalAiModels}
                    </span>
                    <RowLink
                        to={routes.settings("ai")}
                        label="配置"
                        accessibleLabel="配置 AI 服务商"
                    />
                </SettingsRow>
                <SettingsRow title="审计日志">
                    <span className="admin-value">
                        {overview.totalAuditLogs} 条 · 保留{" "}
                        {overview.settings.auditRetentionDays} 天
                    </span>
                    <RowLink
                        to={routes.admin("audit")}
                        replace
                        label="查看"
                        accessibleLabel="查看审计日志"
                    />
                </SettingsRow>
            </SettingsGroup>
        </div>
    );
}
