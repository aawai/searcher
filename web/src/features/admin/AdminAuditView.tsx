import {
    type FormEvent,
    type RefObject,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import { Check, ChevronDown, Copy, RefreshCw, RotateCcw } from "lucide-react";
import type { AuditAction, AuditLogDto } from "@shared/contracts.ts";
import { AdminPanelHeader } from "../../app/AdminShell.tsx";
import {
    AUDIT_ACTION_GROUPS,
    type AuditCategory,
    type AuditCategoryKind,
    describeAuditAction,
    describeAuditCategory,
    describeAuditMetadata,
    describeAuditTarget,
    isDestructiveAuditAction,
    parseAuditActionFilter,
} from "../../app/admin-audit.ts";
import { errorMessage, useAppState } from "../../app/state.tsx";
import { api } from "../../lib/api.ts";
import {
    EmptyState,
    LoadingState,
    ManagementTable,
    Pagination,
    SearchField,
    StatusBanner,
    WorkspaceToolbar,
} from "../../components/searcher/semantic.tsx";
import {
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../../components/ui/table.tsx";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "../../components/ui/popover.tsx";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog.tsx";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectGroupLabel,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../../components/ui/select.tsx";
import {
    RadioGroup,
    RadioGroupItem,
} from "../../components/ui/radio-group.tsx";
import { Button } from "../../components/ui/button.tsx";
import "./admin-users-audit.css";

const AUDIT_PAGE_SIZE = 25;

interface AuditLogResponse {
    items: AuditLogDto[];
    page: number;
    limit: number;
    total: number;
}

const AUDIT_ACTION_ITEMS: Record<string, string> = {
    "": "全部操作",
    ...Object.fromEntries(
        AUDIT_ACTION_GROUPS.flatMap(({ actions }) =>
            actions.map(({ value, label }) => [value, label])
        ),
    ),
};

const CATEGORY_TO_GROUP: Readonly<Record<Exclude<AuditCategory, "">, string>> =
    {
        user: "用户",
        system: "系统",
        ai: "AI",
    };

const CATEGORY_LABELS: Readonly<Record<AuditCategoryKind, string>> = {
    user: "用户",
    system: "系统",
    ai: "AI",
    other: "其他",
};

function formatTime(timestamp: number): string {
    if (!timestamp) return "—";
    return new Date(timestamp).toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
}

function formatAuditActor(log: AuditLogDto): { label: string; muted: boolean } {
    if (log.actorUsername) {
        return { label: `@${log.actorUsername}`, muted: false };
    }
    if (log.actorUserId) {
        return { label: "已删除用户", muted: true };
    }
    return { label: "系统", muted: true };
}

function actionPillTone(
    action: string,
): "neutral" | "accent" | "success" | "warning" | "danger" {
    if (isDestructiveAuditAction(action)) return "danger";
    const category = describeAuditCategory(action);
    if (category === "ai") return "accent";
    if (action === "admin.user.create" || action === "admin.user.enable") {
        return "success";
    }
    if (
        action === "admin.user.disable" ||
        action === "admin.user.reset_password"
    ) {
        return "warning";
    }
    return "neutral";
}

function CopyableIdButton({
    id,
    label,
}: {
    id: string;
    label: string;
}) {
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState(false);

    async function handleCopy() {
        setCopyError(false);
        try {
            if (!navigator.clipboard) throw new Error("剪贴板不可用");
            await navigator.clipboard.writeText(id);
            setCopied(true);
            globalThis.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
            setCopyError(true);
        }
    }

    return (
        <div className="admin-inspector-copy-wrap">
            <div className="admin-inspector-copy-cell">
                <code className="admin-mono-value">{id}</code>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={copied ? `已复制${label}` : `复制${label}`}
                    onClick={() => void handleCopy()}
                >
                    {copied
                        ? (
                            <Check
                                size="1em"
                                className="icon-sm"
                                aria-hidden="true"
                            />
                        )
                        : (
                            <Copy
                                size="1em"
                                className="icon-sm"
                                aria-hidden="true"
                            />
                        )}
                    <span>{copied ? "已复制" : "复制"}</span>
                </Button>
            </div>
            {copyError && (
                <p role="alert" className="admin-inline-alert">
                    复制失败，请手动选择并复制。
                </p>
            )}
        </div>
    );
}

/** Long ids show a prefix; the full id opens in a popover with copy support. */
function AuditTargetId({ id }: { id: string }) {
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState(false);

    if (id.length <= 10) {
        return <span className="admin-ua-audit-id">{id}</span>;
    }

    const prefix = `${id.slice(0, 10)}…`;

    async function handleCopy() {
        setCopyError(false);
        try {
            if (!navigator.clipboard) throw new Error("剪贴板不可用");
            await navigator.clipboard.writeText(id);
            setCopied(true);
            globalThis.setTimeout(() => setCopied(false), 1500);
        } catch {
            setCopied(false);
            setCopyError(true);
        }
    }

    return (
        <Popover>
            <PopoverTrigger
                render={
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="admin-ua-audit-id admin-ua-audit-id-trigger"
                        aria-label={`${prefix} 查看完整 ID`}
                    />
                }
            >
                <span>{prefix}</span>
                <ChevronDown
                    size="1em"
                    className="icon-sm"
                    aria-hidden="true"
                />
            </PopoverTrigger>
            <PopoverContent
                side="bottom"
                align="start"
                className="admin-ua-id-popover"
                aria-label="完整对象 ID"
            >
                <div className="admin-ua-popover-row">
                    <span className="admin-ua-audit-id admin-ua-full-id">
                        {id}
                    </span>
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={copied ? "已复制对象 ID" : "复制对象 ID"}
                        onClick={() => void handleCopy()}
                    >
                        {copied
                            ? (
                                <Check
                                    size="1em"
                                    className="icon-sm"
                                    aria-hidden="true"
                                />
                            )
                            : (
                                <Copy
                                    size="1em"
                                    className="icon-sm"
                                    aria-hidden="true"
                                />
                            )}
                        <span>{copied ? "已复制" : "复制"}</span>
                    </Button>
                </div>
                {copyError && (
                    <p role="alert" className="admin-inline-alert">
                        复制失败，请手动选择并复制 ID。
                    </p>
                )}
            </PopoverContent>
        </Popover>
    );
}

function AuditSummaryChips(
    { details }: { details: { label: string; value: string }[] },
) {
    if (details.length === 0) {
        return <span className="admin-ua-muted">—</span>;
    }
    const visible = details.slice(0, 2);
    const remaining = details.length - visible.length;
    return (
        <div className="admin-meta-chips">
            {visible.map(({ label, value }) => (
                <span key={label} className="admin-meta-chip">
                    <span className="admin-meta-chip-label">{label}</span>
                    <span className="admin-meta-chip-value">{value}</span>
                </span>
            ))}
            {remaining > 0 && (
                <span className="admin-meta-chip admin-meta-chip--more">
                    +{remaining}
                </span>
            )}
        </div>
    );
}

function AuditEventInspectorDialog({
    log,
    onClose,
    finalFocus,
}: {
    log: AuditLogDto | null;
    onClose: () => void;
    finalFocus: RefObject<HTMLElement | null>;
}) {
    const lastLogRef = useRef<AuditLogDto | null>(null);
    if (log) {
        lastLogRef.current = log;
    }
    const activeLog = log ?? lastLogRef.current;

    const action = activeLog ? describeAuditAction(activeLog.action) : null;
    const category = activeLog ? describeAuditCategory(activeLog.action) : null;
    const target = activeLog
        ? describeAuditTarget(
            activeLog.targetType,
            activeLog.targetId,
            activeLog.metadata,
        )
        : null;
    const details = activeLog ? describeAuditMetadata(activeLog.metadata) : [];
    const actor = activeLog ? formatAuditActor(activeLog) : null;

    return (
        <Dialog
            open={Boolean(log)}
            onOpenChange={(open) => {
                if (!open) onClose();
            }}
        >
            <DialogContent size="md" scrollable finalFocus={finalFocus}>
                <DialogHeader>
                    <DialogTitle>审计事件详情</DialogTitle>
                </DialogHeader>
                {activeLog && action && target && actor && category && (
                    <div className="admin-inspector-body">
                        <div className="admin-audit-inspector-head">
                            <div className="admin-audit-inspector-action">
                                <span
                                    className="admin-pill"
                                    data-tone={actionPillTone(activeLog.action)}
                                >
                                    {action.label}
                                </span>
                                <code className="admin-mono-tag">
                                    {activeLog.action}
                                </code>
                            </div>
                            <time className="admin-ua-muted admin-tabular admin-audit-inspector-time">
                                {formatTime(activeLog.createdAt)}
                            </time>
                        </div>

                        <dl className="admin-inspector-list">
                            <div className="admin-inspector-row">
                                <dt>操作者</dt>
                                <dd>
                                    {activeLog.actorDisplayName
                                        ? (
                                            <span>
                                                {activeLog.actorDisplayName}
                                                {" "}
                                                <span className="admin-ua-muted">
                                                    ({actor.label})
                                                </span>
                                            </span>
                                        )
                                        : actor.label}
                                </dd>
                            </div>
                            <div className="admin-inspector-row">
                                <dt>操作分类</dt>
                                <dd>{CATEGORY_LABELS[category]}</dd>
                            </div>
                            <div className="admin-inspector-row">
                                <dt>操作对象</dt>
                                <dd>{target.label}</dd>
                            </div>
                            {target.id && (
                                <div className="admin-inspector-row">
                                    <dt>对象 ID</dt>
                                    <dd>
                                        <CopyableIdButton
                                            key={target.id}
                                            id={target.id}
                                            label="对象 ID"
                                        />
                                    </dd>
                                </div>
                            )}
                            <div className="admin-inspector-row">
                                <dt>事件 ID</dt>
                                <dd>
                                    <CopyableIdButton
                                        key={activeLog.id}
                                        id={activeLog.id}
                                        label="事件 ID"
                                    />
                                </dd>
                            </div>
                        </dl>

                        <div className="admin-audit-inspector-section">
                            <h3 className="admin-audit-inspector-subtitle">
                                结构化明细
                            </h3>
                            {details.length > 0
                                ? (
                                    <dl className="admin-inspector-list">
                                        {details.map(({ label, value }) => (
                                            <div
                                                key={label}
                                                className="admin-inspector-row"
                                            >
                                                <dt>{label}</dt>
                                                <dd className="admin-tabular">
                                                    {value}
                                                </dd>
                                            </div>
                                        ))}
                                    </dl>
                                )
                                : (
                                    <p className="admin-ua-muted admin-audit-empty-meta">
                                        此事件没有附加明细字段。
                                    </p>
                                )}
                        </div>

                        <details className="admin-raw-json">
                            <summary>查看原始 JSON 元数据</summary>
                            <pre className="admin-raw-json-pre">
                                <code>
                                    {JSON.stringify(
                                        activeLog.metadata ?? {},
                                        null,
                                        2,
                                    )}
                                </code>
                            </pre>
                        </details>
                    </div>
                )}
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                    >
                        关闭
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

function AuditLogRow({
    log,
    onInspect,
}: {
    log: AuditLogDto;
    onInspect: (log: AuditLogDto, trigger: HTMLElement | null) => void;
}) {
    const action = describeAuditAction(log.action);
    const target = describeAuditTarget(
        log.targetType,
        log.targetId,
        log.metadata,
    );
    const details = describeAuditMetadata(log.metadata);
    const actor = formatAuditActor(log);
    const time = formatTime(log.createdAt);
    const tone = actionPillTone(log.action);

    return (
        <TableRow>
            <TableCell className="admin-ua-audit-date-col admin-ua-nowrap admin-ua-muted admin-tabular">
                {time}
            </TableCell>
            <TableCell className="admin-ua-nowrap">
                <span
                    className={actor.muted
                        ? "admin-actor-chip admin-actor-chip--muted"
                        : "admin-actor-chip"}
                >
                    {actor.label}
                </span>
            </TableCell>
            <TableCell className="admin-ua-audit-action-col">
                <div className="admin-ua-audit-action-stack">
                    <span className="admin-pill" data-tone={tone}>
                        {action.label}
                    </span>
                    {action.rawKey && (
                        <code className="admin-ua-audit-id">
                            {action.rawKey}
                        </code>
                    )}
                    <time className="admin-ua-audit-tablet-time admin-tabular">
                        {time}
                    </time>
                </div>
            </TableCell>
            <TableCell className="admin-ua-audit-target-col">
                <span className="admin-ua-audit-target">{target.label}</span>
                {target.id && <AuditTargetId id={target.id} />}
            </TableCell>
            <TableCell>
                <div className="admin-ua-audit-summary-cell">
                    <AuditSummaryChips details={details} />
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="admin-ua-detail-btn"
                        onClick={(event) => onInspect(log, event.currentTarget)}
                    >
                        详情
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
}

function AuditEventCard({
    log,
    onInspect,
}: {
    log: AuditLogDto;
    onInspect: (log: AuditLogDto, trigger: HTMLElement | null) => void;
}) {
    const action = describeAuditAction(log.action);
    const target = describeAuditTarget(
        log.targetType,
        log.targetId,
        log.metadata,
    );
    const details = describeAuditMetadata(log.metadata);
    const actor = formatAuditActor(log);
    const time = formatTime(log.createdAt);
    const tone = actionPillTone(log.action);

    return (
        <article role="listitem" className="admin-ua-audit-card">
            <div className="admin-ua-audit-card-head">
                <div className="admin-ua-audit-action-stack">
                    <span className="admin-pill" data-tone={tone}>
                        {action.label}
                    </span>
                    {action.rawKey && (
                        <code className="admin-ua-audit-id">
                            {action.rawKey}
                        </code>
                    )}
                </div>
                <time className="admin-ua-card-time admin-ua-muted admin-tabular">
                    {time}
                </time>
            </div>
            <div className="admin-ua-audit-card-flow">
                <span
                    className={actor.muted
                        ? "admin-actor-chip admin-actor-chip--muted"
                        : "admin-actor-chip"}
                >
                    {actor.label}
                </span>
                <span className="admin-ua-muted" aria-hidden="true">→</span>
                <span className="admin-ua-audit-target">{target.label}</span>
                {target.id && <AuditTargetId id={target.id} />}
            </div>
            <div className="admin-ua-audit-card-foot">
                <AuditSummaryChips details={details} />
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(event) => onInspect(log, event.currentTarget)}
                >
                    查看详情
                </Button>
            </div>
        </article>
    );
}

export function AdminAuditView() {
    const { user: currentUser } = useAppState();

    const [auditLogs, setAuditLogs] = useState<AuditLogDto[]>([]);
    const [auditTotal, setAuditTotal] = useState(0);
    const [auditPage, setAuditPage] = useState(1);
    const [auditLoading, setAuditLoading] = useState(false);
    const [auditInitialized, setAuditInitialized] = useState(false);
    const [auditError, setAuditError] = useState("");
    const [auditCategory, setAuditCategory] = useState<AuditCategory>("");
    const [auditActionFilter, setAuditActionFilter] = useState<
        AuditAction | ""
    >("");
    const [auditSearch, setAuditSearch] = useState("");
    const [submittedAuditSearch, setSubmittedAuditSearch] = useState("");

    const [inspectedLog, setInspectedLog] = useState<AuditLogDto | null>(null);
    const inspectorTriggerRef = useRef<HTMLElement | null>(null);

    const visibleActionGroups = useMemo(() => {
        if (!auditCategory) return AUDIT_ACTION_GROUPS;
        const expectedGroup = CATEGORY_TO_GROUP[auditCategory];
        return AUDIT_ACTION_GROUPS.filter(({ group }) =>
            group === expectedGroup
        );
    }, [auditCategory]);

    async function loadAuditLogs(
        page = auditPage,
        category = auditCategory,
        action = auditActionFilter,
        q = submittedAuditSearch,
    ) {
        if (currentUser?.role !== "admin") return;
        setAuditLoading(true);
        setAuditError("");
        try {
            const qs = new URLSearchParams({
                page: String(page),
                limit: String(AUDIT_PAGE_SIZE),
            });
            if (category) qs.set("category", category);
            if (action) qs.set("action", action);
            if (q.trim()) qs.set("q", q.trim());
            const res = await api<AuditLogResponse>(
                `/api/admin/audit-logs?${qs}`,
            );
            setAuditLogs(res.items);
            setAuditTotal(res.total);
            setAuditPage(res.page);
        } catch (err) {
            setAuditError(errorMessage(err));
        } finally {
            setAuditLoading(false);
            setAuditInitialized(true);
        }
    }

    useEffect(() => {
        if (currentUser?.role === "admin") {
            void loadAuditLogs(
                auditPage,
                auditCategory,
                auditActionFilter,
                submittedAuditSearch,
            );
        }
    }, [
        currentUser,
        auditPage,
        auditCategory,
        auditActionFilter,
        submittedAuditSearch,
    ]);

    function handleAuditSearchSubmit(event: FormEvent) {
        event.preventDefault();
        setAuditPage(1);
        setSubmittedAuditSearch(auditSearch);
    }

    function clearAuditSearch() {
        setAuditSearch("");
        setAuditPage(1);
        setSubmittedAuditSearch("");
    }

    function handleCategoryChange(next: unknown) {
        if (
            next !== "" && next !== "user" && next !== "system" &&
            next !== "ai"
        ) {
            return;
        }
        setAuditCategory(next);
        if (
            next && auditActionFilter &&
            describeAuditCategory(auditActionFilter) !== next
        ) {
            setAuditActionFilter("");
        }
        setAuditPage(1);
    }

    function resetAllFilters() {
        setAuditCategory("");
        setAuditActionFilter("");
        setAuditSearch("");
        setSubmittedAuditSearch("");
        setAuditPage(1);
    }

    function openInspector(log: AuditLogDto, trigger: HTMLElement | null) {
        inspectorTriggerRef.current = trigger;
        setInspectedLog(log);
    }

    const auditTotalPages = Math.max(
        1,
        Math.ceil(auditTotal / AUDIT_PAGE_SIZE),
    );
    const hasActiveFilters = Boolean(
        auditCategory || auditActionFilter || submittedAuditSearch,
    );

    return (
        <div className="semantic-section">
            <AdminPanelHeader
                title="审计"
                description="追踪用户变更、系统配置调整、AI 服务与备份恢复操作"
                meta={auditInitialized ? `共 ${auditTotal} 条` : undefined}
                actions={
                    <Button
                        type="button"
                        variant="outline"
                        title="刷新审计日志"
                        disabled={auditLoading}
                        onClick={() =>
                            void loadAuditLogs(
                                auditPage,
                                auditCategory,
                                auditActionFilter,
                                submittedAuditSearch,
                            )}
                    >
                        <RefreshCw
                            size="1em"
                            className={auditLoading ? "admin-spin" : undefined}
                            aria-hidden="true"
                        />
                        <span>{auditLoading ? "刷新中…" : "刷新"}</span>
                    </Button>
                }
            />

            {auditError && (
                <StatusBanner tone="error" density="compact">
                    {auditError}
                </StatusBanner>
            )}

            <WorkspaceToolbar className="admin-ua-toolbar admin-ua-audit-toolbar">
                <form
                    role="search"
                    className="admin-ua-search-field"
                    onSubmit={handleAuditSearchSubmit}
                >
                    <SearchField
                        name="auditSearch"
                        aria-label="搜索审计日志"
                        placeholder="按操作者、对象 ID 或明细搜索"
                        value={auditSearch}
                        onValueChange={(next) => {
                            if (next === "" && submittedAuditSearch) {
                                clearAuditSearch();
                                return;
                            }
                            setAuditSearch(next);
                        }}
                    />
                </form>

                <div className="admin-ua-audit-controls">
                    <RadioGroup
                        variant="segmented"
                        aria-label="按分类筛选审计日志"
                        value={auditCategory}
                        onValueChange={handleCategoryChange}
                    >
                        <RadioGroupItem value="">全部</RadioGroupItem>
                        <RadioGroupItem value="user">用户</RadioGroupItem>
                        <RadioGroupItem value="system">系统</RadioGroupItem>
                        <RadioGroupItem value="ai">AI</RadioGroupItem>
                    </RadioGroup>

                    <Select
                        items={AUDIT_ACTION_ITEMS}
                        value={auditActionFilter}
                        onValueChange={(next) => {
                            if (next !== null) {
                                setAuditActionFilter(
                                    parseAuditActionFilter(next),
                                );
                                setAuditPage(1);
                            }
                        }}
                    >
                        <SelectTrigger
                            className="admin-ua-toolbar-select"
                            aria-label="按操作筛选审计日志"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="">全部操作</SelectItem>
                            {visibleActionGroups.map(({ group, actions }) => (
                                <SelectGroup key={group}>
                                    <SelectGroupLabel>{group}</SelectGroupLabel>
                                    {actions.map(({ value, label }) => (
                                        <SelectItem key={value} value={value}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
                            ))}
                        </SelectContent>
                    </Select>

                    {hasActiveFilters && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={resetAllFilters}
                        >
                            <RotateCcw
                                size="1em"
                                className="icon-sm"
                                aria-hidden="true"
                            />
                            <span>重置筛选</span>
                        </Button>
                    )}
                </div>
            </WorkspaceToolbar>

            {!auditInitialized && auditLoading
                ? (
                    <div className="admin-surface admin-ua-state-card">
                        <LoadingState>正在加载审计日志…</LoadingState>
                    </div>
                )
                : auditError && auditLogs.length === 0
                ? (
                    <div className="admin-surface admin-ua-state-card">
                        <EmptyState
                            illustration="auth-or-error"
                            title="无法加载审计日志"
                            action={
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                        void loadAuditLogs(
                                            auditPage,
                                            auditCategory,
                                            auditActionFilter,
                                            submittedAuditSearch,
                                        )}
                                >
                                    重试
                                </Button>
                            }
                        />
                    </div>
                )
                : auditLogs.length === 0
                ? (
                    <div className="admin-surface admin-ua-state-card">
                        <EmptyState
                            illustration="no-results"
                            title={hasActiveFilters
                                ? "没有匹配的审计记录"
                                : "暂无审计记录"}
                            action={hasActiveFilters
                                ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={resetAllFilters}
                                    >
                                        清除筛选
                                    </Button>
                                )
                                : undefined}
                        />
                    </div>
                )
                : (
                    <>
                        <div className="admin-ua-desktop admin-surface admin-ua-table-surface">
                            <ManagementTable
                                caption="审计日志"
                                className="admin-ua-table"
                            >
                                <TableHeader>
                                    <TableRow>
                                        <TableHead
                                            scope="col"
                                            className="admin-ua-audit-date-col"
                                        >
                                            时间
                                        </TableHead>
                                        <TableHead scope="col">
                                            操作者
                                        </TableHead>
                                        <TableHead scope="col">操作</TableHead>
                                        <TableHead scope="col">对象</TableHead>
                                        <TableHead scope="col">
                                            摘要与详情
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {auditLogs.map((log) => (
                                        <AuditLogRow
                                            key={log.id}
                                            log={log}
                                            onInspect={openInspector}
                                        />
                                    ))}
                                </TableBody>
                            </ManagementTable>
                        </div>

                        <div
                            className="admin-ua-mobile-list admin-surface"
                            role="list"
                            aria-label="审计日志列表"
                        >
                            {auditLogs.map((log) => (
                                <AuditEventCard
                                    key={log.id}
                                    log={log}
                                    onInspect={openInspector}
                                />
                            ))}
                        </div>

                        {auditTotalPages > 1 && (
                            <Pagination
                                label="审计日志分页"
                                total={`共 ${auditTotal} 条`}
                                page={auditPage}
                                pageCount={auditTotalPages}
                                busy={auditLoading}
                                onPageChange={setAuditPage}
                            />
                        )}
                    </>
                )}

            <AuditEventInspectorDialog
                log={inspectedLog}
                onClose={() => setInspectedLog(null)}
                finalFocus={inspectorTriggerRef}
            />
        </div>
    );
}
