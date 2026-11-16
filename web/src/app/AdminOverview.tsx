import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, RefreshCw } from "lucide-react";
import type { AuditLogDto, ThemeId } from "@shared/contracts.ts";
import { routes } from "./routes.ts";
import { Button } from "../components/ui/button.tsx";
import {
    EmptyState,
    LoadingState,
    SettingsGroup,
    SettingsRow,
    StatusBanner,
} from "../components/searcher/semantic.tsx";
import { AdminPanelHeader } from "./AdminShell.tsx";
import { describeAuditAction, describeAuditTarget } from "./admin-audit.ts";
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

interface RecentAuditResponse {
    items: AuditLogDto[];
}

function formatRecentTime(timestamp: number): string {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function formatActor(log: AuditLogDto): string {
    if (log.actorUsername) return `@${log.actorUsername}`;
    if (log.actorUserId) return "已删除用户";
    return "系统";
}

/** Admin tabs replace the history entry like the sidebar navigation does. */
function DrillLink(
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
            className="admin-kpi-link"
            aria-label={accessibleLabel}
            render={<Link to={to} replace={replace} />}
        >
            <span>{label}</span>
            <ChevronRight size="1em" className="icon-sm" aria-hidden="true" />
        </Button>
    );
}

export function AdminOverview() {
    const [overview, setOverview] = useState<SystemOverviewDto | null>(null);
    const [recentLogs, setRecentLogs] = useState<AuditLogDto[]>([]);
    const [recentError, setRecentError] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadOverview = async () => {
        setLoading(true);
        setError("");
        setRecentError("");
        try {
            const [overviewRes, auditRes] = await Promise.allSettled([
                api<SystemOverviewDto>("/api/admin/system/overview"),
                api<RecentAuditResponse>("/api/admin/audit-logs?limit=5"),
            ]);
            if (overviewRes.status === "fulfilled") {
                setOverview(overviewRes.value);
            } else {
                setError(errorMessage(overviewRes.reason));
            }
            if (auditRes.status === "fulfilled") {
                setRecentLogs(auditRes.value.items);
            } else {
                setRecentError(errorMessage(auditRes.reason));
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadOverview();
    }, []);

    const refreshButton = (
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
    );

    if (!overview) {
        return (
            <div className="semantic-section" data-content="grouped">
                <AdminPanelHeader title="概览" actions={refreshButton} />
                {loading
                    ? <LoadingState>正在加载系统概览…</LoadingState>
                    : (
                        <EmptyState
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
            <AdminPanelHeader title="概览" actions={refreshButton} />
            {error && (
                <StatusBanner tone="error" density="compact">
                    {error}
                </StatusBanner>
            )}

            <div className="admin-kpi-grid">
                <div className="admin-kpi-card">
                    <div className="admin-kpi-head">
                        <span className="admin-kpi-label">用户</span>
                        <DrillLink
                            to={routes.admin("users")}
                            replace
                            label="管理"
                            accessibleLabel="管理用户"
                        />
                    </div>
                    <div className="admin-kpi-value">
                        {overview.totalUsers}
                    </div>
                    <div className="admin-kpi-sub">
                        活跃 {overview.activeUsers} · 禁用{" "}
                        {overview.disabledUsers}
                    </div>
                </div>

                <div className="admin-kpi-card">
                    <div className="admin-kpi-head">
                        <span className="admin-kpi-label">内容规模</span>
                    </div>
                    <div className="admin-kpi-value">
                        {overview.totalWebApps + overview.totalDocuments}
                    </div>
                    <div className="admin-kpi-sub">
                        应用 {overview.totalWebApps} · 笔记{" "}
                        {overview.totalDocuments}
                    </div>
                </div>

                <div className="admin-kpi-card">
                    <div className="admin-kpi-head">
                        <span className="admin-kpi-label">AI 服务</span>
                        <DrillLink
                            to={routes.settings("ai")}
                            label="配置"
                            accessibleLabel="配置 AI 服务商"
                        />
                    </div>
                    <div className="admin-kpi-value">
                        {overview.totalAiProviders}
                    </div>
                    <div className="admin-kpi-sub">
                        服务商 {overview.totalAiProviders} · 模型{" "}
                        {overview.totalAiModels}
                    </div>
                </div>

                <div className="admin-kpi-card">
                    <div className="admin-kpi-head">
                        <span className="admin-kpi-label">审计与策略</span>
                        <DrillLink
                            to={routes.admin("audit")}
                            replace
                            label="查看"
                            accessibleLabel="查看审计日志"
                        />
                    </div>
                    <div className="admin-kpi-value">
                        {overview.totalAuditLogs}
                    </div>
                    <div className="admin-kpi-sub">
                        保留 {overview.settings.auditRetentionDays} 天 ·{" "}
                        {overview.settings.allowRegistration
                            ? "开放注册"
                            : "关闭注册"}
                    </div>
                </div>
            </div>

            <SettingsGroup
                title="最近关键操作"
                headingLevel={3}
                actions={
                    <DrillLink
                        to={routes.admin("audit")}
                        replace
                        label="全部记录"
                        accessibleLabel="查看全部审计记录"
                    />
                }
            >
                {recentError
                    ? (
                        <StatusBanner tone="error" density="compact">
                            无法加载最近操作：{recentError}
                        </StatusBanner>
                    )
                    : recentLogs.length === 0
                    ? <EmptyState density="inline" title="暂无操作记录" />
                    : recentLogs.map((log) => {
                        const action = describeAuditAction(log.action);
                        const target = describeAuditTarget(
                            log.targetType,
                            log.targetId,
                            log.metadata,
                        );
                        return (
                            <SettingsRow
                                key={log.id}
                                title={action.label}
                                description={`${formatActor(log)} → ${target.label}`}
                            >
                                <time className="admin-audit-time">
                                    {formatRecentTime(log.createdAt)}
                                </time>
                            </SettingsRow>
                        );
                    })}
            </SettingsGroup>
        </div>
    );
}
