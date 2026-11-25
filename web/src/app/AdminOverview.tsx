import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    ChevronRight,
    FileClock,
    HardDriveDownload,
    Layers,
    RefreshCw,
    Sparkles,
    Users,
} from "lucide-react";
import type { AuditLogDto, ThemeId } from "@shared/contracts.ts";
import { routes } from "./routes.ts";
import { THEME_LABELS } from "../design-system/theme.ts";
import { Button } from "../components/ui/button.tsx";
import {
    EmptyState,
    LoadingState,
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

const ENGINE_LABELS: Readonly<
    Record<SystemSettingsDto["defaultEngine"], string>
> = {
    bing: "Bing (必应)",
    google: "Google (谷歌)",
    baidu: "Baidu (百度)",
    duckduckgo: "DuckDuckGo",
};

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

type PillTone = "neutral" | "accent" | "success" | "warning" | "danger";

function activityTone(action: string, danger: boolean): PillTone {
    if (danger) return "danger";
    if (action.startsWith("ai.")) return "accent";
    if (action === "admin.user.disable") return "warning";
    if (action === "admin.user.enable" || action === "admin.backup.create") {
        return "success";
    }
    return "neutral";
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
            size="sm"
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
                className={loading ? "icon-sm animate-spin" : "icon-sm"}
                aria-hidden="true"
            />
            <span>{loading ? "刷新中…" : "刷新"}</span>
        </Button>
    );

    if (!overview) {
        return (
            <div className="semantic-section">
                <AdminPanelHeader
                    title="概览"
                    description="实例运行规模、关键策略与最近管理动态"
                    actions={refreshButton}
                />
                {loading
                    ? <LoadingState>正在加载系统概览…</LoadingState>
                    : (
                        <EmptyState
                            illustration="auth-or-error"
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

    const activeRatio = overview.totalUsers > 0
        ? Math.round((overview.activeUsers / overview.totalUsers) * 100)
        : 0;
    const disabledRatio = overview.totalUsers > 0
        ? Math.max(0, 100 - activeRatio)
        : 0;
    const { settings } = overview;

    return (
        <div className="semantic-section">
            <AdminPanelHeader
                title="概览"
                description="实例运行规模、关键策略与最近管理动态"
                actions={refreshButton}
            />
            {error && (
                <StatusBanner tone="error" density="compact">
                    {error}
                </StatusBanner>
            )}

            <div className="admin-kpi-grid">
                <article className="admin-kpi-card">
                    <div className="admin-kpi-head">
                        <div className="admin-kpi-title-group">
                            <span
                                className="admin-kpi-icon"
                                data-tone="accent"
                                aria-hidden="true"
                            >
                                <Users size="1em" className="icon-sm" />
                            </span>
                            <span className="admin-kpi-label">注册用户</span>
                        </div>
                        <DrillLink
                            to={routes.admin("users")}
                            replace
                            label="管理"
                            accessibleLabel="管理用户"
                        />
                    </div>
                    <div className="admin-kpi-value">{overview.totalUsers}</div>
                    <div className="admin-kpi-footer">
                        <div className="admin-kpi-bar" aria-hidden="true">
                            {activeRatio > 0 && (
                                <span
                                    className="admin-kpi-bar-active"
                                    style={{ width: `${activeRatio}%` }}
                                />
                            )}
                            {disabledRatio > 0 && (
                                <span
                                    className="admin-kpi-bar-disabled"
                                    style={{ width: `${disabledRatio}%` }}
                                />
                            )}
                        </div>
                        <div className="admin-kpi-sub">
                            活跃 {overview.activeUsers} · 禁用{" "}
                            {overview.disabledUsers}
                        </div>
                    </div>
                </article>

                <article className="admin-kpi-card">
                    <div className="admin-kpi-head">
                        <div className="admin-kpi-title-group">
                            <span
                                className="admin-kpi-icon"
                                data-tone="neutral"
                                aria-hidden="true"
                            >
                                <Layers size="1em" className="icon-sm" />
                            </span>
                            <span className="admin-kpi-label">工作区内容</span>
                        </div>
                    </div>
                    <div className="admin-kpi-dual">
                        <div className="admin-kpi-dual-item">
                            <span className="admin-kpi-dual-value">
                                {overview.totalWebApps}
                            </span>
                            <span className="admin-kpi-dual-label">应用</span>
                        </div>
                        <span
                            className="admin-kpi-dual-divider"
                            aria-hidden="true"
                        />
                        <div className="admin-kpi-dual-item">
                            <span className="admin-kpi-dual-value">
                                {overview.totalDocuments}
                            </span>
                            <span className="admin-kpi-dual-label">笔记</span>
                        </div>
                    </div>
                    <div className="admin-kpi-sub">全站累计工作区条目</div>
                </article>

                <article className="admin-kpi-card">
                    <div className="admin-kpi-head">
                        <div className="admin-kpi-title-group">
                            <span
                                className="admin-kpi-icon"
                                data-tone="accent"
                                aria-hidden="true"
                            >
                                <Sparkles size="1em" className="icon-sm" />
                            </span>
                            <span className="admin-kpi-label">AI 服务</span>
                        </div>
                        <DrillLink
                            to={routes.settings("ai")}
                            label="配置"
                            accessibleLabel="配置 AI 服务商"
                        />
                    </div>
                    <div className="admin-kpi-value-row">
                        <span className="admin-kpi-value">
                            {overview.totalAiProviders}
                        </span>
                        <span className="admin-kpi-unit">服务商</span>
                    </div>
                    <div className="admin-kpi-sub">
                        已配置 {overview.totalAiModels} 个模型
                    </div>
                </article>

                <article className="admin-kpi-card">
                    <div className="admin-kpi-head">
                        <div className="admin-kpi-title-group">
                            <span
                                className="admin-kpi-icon"
                                data-tone="neutral"
                                aria-hidden="true"
                            >
                                <FileClock size="1em" className="icon-sm" />
                            </span>
                            <span className="admin-kpi-label">审计日志</span>
                        </div>
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
                        保留 {settings.auditRetentionDays} 天
                    </div>
                </article>
            </div>

            <div className="admin-overview-split">
                <section className="admin-surface">
                    <header className="admin-surface-header">
                        <div className="admin-surface-heading">
                            <h3 className="admin-surface-title">
                                最近关键操作
                            </h3>
                            <p className="admin-surface-subtitle">
                                最新 5 条后台审计记录
                            </p>
                        </div>
                        <DrillLink
                            to={routes.admin("audit")}
                            replace
                            label="全部记录"
                            accessibleLabel="查看全部审计记录"
                        />
                    </header>

                    {recentError
                        ? (
                            <div className="admin-surface-body">
                                <StatusBanner tone="error" density="compact">
                                    无法加载最近操作：{recentError}
                                </StatusBanner>
                            </div>
                        )
                        : recentLogs.length === 0
                        ? (
                            <div className="admin-surface-body">
                                <EmptyState
                                    density="inline"
                                    title="暂无操作记录"
                                />
                            </div>
                        )
                        : (
                            <ul className="admin-activity-list">
                                {recentLogs.map((log) => {
                                    const action = describeAuditAction(
                                        log.action,
                                    );
                                    const target = describeAuditTarget(
                                        log.targetType,
                                        log.targetId,
                                        log.metadata,
                                    );
                                    const tone = activityTone(
                                        log.action,
                                        action.danger,
                                    );
                                    return (
                                        <li
                                            key={log.id}
                                            className="admin-activity-item"
                                        >
                                            <div className="admin-activity-main">
                                                <span
                                                    className="admin-pill"
                                                    data-tone={tone}
                                                >
                                                    {action.label}
                                                </span>
                                                <div className="admin-activity-meta">
                                                    <span className="admin-activity-actor">
                                                        {formatActor(log)}
                                                    </span>
                                                    <span
                                                        className="admin-activity-arrow"
                                                        aria-hidden="true"
                                                    >
                                                        →
                                                    </span>
                                                    <span className="admin-activity-target">
                                                        {target.label}
                                                    </span>
                                                </div>
                                            </div>
                                            <time className="admin-activity-time">
                                                {formatRecentTime(
                                                    log.createdAt,
                                                )}
                                            </time>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                </section>

                <section className="admin-surface admin-policy-card">
                    <header className="admin-surface-header">
                        <div className="admin-surface-heading">
                            <h3 className="admin-surface-title">
                                当前策略快照
                            </h3>
                            <p className="admin-surface-subtitle">
                                全站默认体验与访问策略
                            </p>
                        </div>
                        <DrillLink
                            to={routes.admin("settings")}
                            replace
                            label="编辑"
                            accessibleLabel="编辑系统设置"
                        />
                    </header>

                    <dl className="admin-policy-list">
                        <div className="admin-policy-row">
                            <dt className="admin-policy-label">访客注册</dt>
                            <dd className="admin-policy-value">
                                <span
                                    className="admin-pill"
                                    data-tone={settings.allowRegistration
                                        ? "success"
                                        : "neutral"}
                                >
                                    <span
                                        className="admin-pill-dot"
                                        aria-hidden="true"
                                    />
                                    {settings.allowRegistration
                                        ? "开放注册"
                                        : "仅管理员创建"}
                                </span>
                            </dd>
                        </div>
                        <div className="admin-policy-row">
                            <dt className="admin-policy-label">审计保留</dt>
                            <dd className="admin-policy-value">
                                {settings.auditRetentionDays} 天
                            </dd>
                        </div>
                        <div className="admin-policy-row">
                            <dt className="admin-policy-label">默认搜索引擎</dt>
                            <dd className="admin-policy-value">
                                {ENGINE_LABELS[settings.defaultEngine]}
                            </dd>
                        </div>
                        <div className="admin-policy-row">
                            <dt className="admin-policy-label">默认主题</dt>
                            <dd className="admin-policy-value">
                                {THEME_LABELS[settings.defaultTheme]}
                            </dd>
                        </div>
                        <div className="admin-policy-row">
                            <dt className="admin-policy-label">搜索打开方式</dt>
                            <dd className="admin-policy-value">
                                {settings.defaultSearchTarget === "new"
                                    ? "新标签页"
                                    : "当前标签页"}
                            </dd>
                        </div>
                    </dl>

                    <footer className="admin-policy-footer">
                        <Link
                            to={routes.admin("users")}
                            replace
                            className="admin-shortcut-link"
                        >
                            <Users
                                size="1em"
                                className="icon-sm"
                                aria-hidden="true"
                            />
                            <span>用户管理</span>
                            <ChevronRight
                                size="1em"
                                className="icon-sm admin-shortcut-chevron"
                                aria-hidden="true"
                            />
                        </Link>
                        <Link
                            to={routes.admin("backup")}
                            replace
                            className="admin-shortcut-link"
                        >
                            <HardDriveDownload
                                size="1em"
                                className="icon-sm"
                                aria-hidden="true"
                            />
                            <span>备份与还原</span>
                            <ChevronRight
                                size="1em"
                                className="icon-sm admin-shortcut-chevron"
                                aria-hidden="true"
                            />
                        </Link>
                    </footer>
                </section>
            </div>
        </div>
    );
}
