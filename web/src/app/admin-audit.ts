import {
    AUDIT_ACTIONS,
    type AuditAction,
    isThemeId,
} from "@shared/contracts.ts";
import { SEARCH_ENGINES } from "@shared/engines.ts";
import { THEME_LABELS } from "../design-system/theme.ts";

type AuditActionGroup = "用户" | "系统" | "AI";

interface AuditActionMeta {
    label: string;
    group: AuditActionGroup;
    /** Overwrites or removes data that cannot be recovered from the log. */
    danger: boolean;
}

const AUDIT_ACTION_META: Record<AuditAction, AuditActionMeta> = {
    "admin.user.create": { label: "创建用户", group: "用户", danger: false },
    "admin.user.disable": { label: "禁用用户", group: "用户", danger: false },
    "admin.user.enable": { label: "启用用户", group: "用户", danger: false },
    "admin.user.reset_password": {
        label: "重置密码",
        group: "用户",
        danger: false,
    },
    "admin.user.delete": { label: "删除用户", group: "用户", danger: true },
    "admin.system.settings_update": {
        label: "修改系统设置",
        group: "系统",
        danger: false,
    },
    "admin.system.config_export": {
        label: "导出配置",
        group: "系统",
        danger: false,
    },
    "admin.system.config_import": {
        label: "导入配置",
        group: "系统",
        danger: true,
    },
    "admin.backup.create": { label: "创建备份", group: "系统", danger: false },
    "admin.backup.restore": { label: "还原备份", group: "系统", danger: true },
    "ai.provider.create": {
        label: "添加 AI 服务商",
        group: "AI",
        danger: false,
    },
    "ai.provider.update": {
        label: "修改 AI 服务商",
        group: "AI",
        danger: false,
    },
    "ai.provider.delete": {
        label: "删除 AI 服务商",
        group: "AI",
        danger: true,
    },
    "ai.provider.refresh": {
        label: "刷新模型列表",
        group: "AI",
        danger: false,
    },
    "ai.model.update": { label: "修改模型", group: "AI", danger: false },
};

function isAuditAction(action: string): action is AuditAction {
    return (AUDIT_ACTIONS as readonly string[]).includes(action);
}

/** Filter options in contract order, grouped for the select's optgroups. */
export const AUDIT_ACTION_GROUPS: readonly {
    group: AuditActionGroup;
    actions: readonly { value: AuditAction; label: string }[];
}[] = (["用户", "系统", "AI"] as const).map((group) => ({
    group,
    actions: AUDIT_ACTIONS
        .filter((action) => AUDIT_ACTION_META[action].group === group)
        .map((action) => ({
            value: action,
            label: AUDIT_ACTION_META[action].label,
        })),
}));

export function parseAuditActionFilter(value: string): AuditAction | "" {
    return isAuditAction(value) ? value : "";
}

/** Rows from before an action existed in the contract keep their raw key as a hint. */
export function describeAuditAction(action: string): {
    label: string;
    danger: boolean;
    rawKey?: string;
} {
    if (isAuditAction(action)) {
        const { label, danger } = AUDIT_ACTION_META[action];
        return { label, danger };
    }
    return { label: "未知操作", danger: false, rawKey: action };
}

const SYSTEM_TARGET_LABELS: Readonly<Record<string, string>> = {
    settings: "系统设置",
    config: "系统配置",
    backup: "备份",
};

const TARGET_TYPE_LABELS: Readonly<Record<string, string>> = {
    user: "用户",
    system: "系统",
    ai_provider: "AI 服务商",
};

/**
 * `label` names the object; `id` is the identifier still worth showing
 * (a user or provider id), absent when the label already says it all.
 */
export function describeAuditTarget(
    targetType: string,
    targetId: string | null,
    metadata: Record<string, unknown> | null,
): { label: string; id: string | null } {
    if (targetType === "system") {
        const label = targetId ? SYSTEM_TARGET_LABELS[targetId] : undefined;
        return label
            ? { label, id: null }
            : { label: TARGET_TYPE_LABELS.system, id: targetId };
    }
    const username = metadata?.username;
    if (targetType === "user" && typeof username === "string") {
        return { label: `@${username}`, id: targetId };
    }
    return {
        label: TARGET_TYPE_LABELS[targetType] ?? targetType,
        id: targetId,
    };
}

function formatTimestamp(value: number): string {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

const yesNo = (value: unknown) =>
    value === true ? "是" : value === false ? "否" : String(value);

/** Label and value formatter of every metadata key the server records. */
const METADATA_FIELDS: Readonly<
    Record<string, { label: string; format?: (value: unknown) => string }>
> = {
    displayName: { label: "显示名称" },
    forcedChange: { label: "下次登录需改密", format: yesNo },
    softDelete: { label: "保留恢复期", format: yesNo },
    auditRetentionDays: {
        label: "审计保留",
        format: (value) => `${String(value)} 天`,
    },
    allowRegistration: { label: "允许访客注册", format: yesNo },
    defaultEngine: {
        label: "默认搜索引擎",
        format: (value) =>
            SEARCH_ENGINES.find((engine) => engine.id === value)?.label ??
                String(value),
    },
    defaultTheme: {
        label: "默认主题",
        format: (value) =>
            typeof value === "string" && isThemeId(value)
                ? THEME_LABELS[value]
                : String(value),
    },
    defaultSearchTarget: {
        label: "结果打开方式",
        format: (value) =>
            value === "new"
                ? "新标签页"
                : value === "same"
                ? "当前标签页"
                : String(value),
    },
    importedProvidersCount: {
        label: "导入服务商",
        format: (value) => `${String(value)} 个`,
    },
    manifestCreatedAt: {
        label: "备份生成于",
        format: (value) =>
            typeof value === "number" ? formatTimestamp(value) : String(value),
    },
    snapshotCreated: { label: "已保存还原前快照", format: yesNo },
    snapshotPath: { label: "快照位置" },
};

/** Keys already expressed by the action or target columns. */
const METADATA_SHOWN_ELSEWHERE = new Set(["username", "disabled"]);

export function describeAuditMetadata(
    metadata: Record<string, unknown> | null,
): { label: string; value: string }[] {
    if (!metadata) return [];
    return Object.entries(metadata)
        .filter(([key, value]) =>
            !METADATA_SHOWN_ELSEWHERE.has(key) && value !== undefined &&
            value !== null
        )
        .map(([key, value]) => {
            const field = METADATA_FIELDS[key];
            return {
                label: field?.label ?? key,
                value: field?.format ? field.format(value) : String(value),
            };
        });
}
