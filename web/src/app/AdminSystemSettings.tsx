import { type FormEvent, useEffect, useRef, useState } from "react";
import { ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group.tsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../components/ui/select.tsx";
import { Switch } from "../components/ui/switch.tsx";
import {
    EmptyState,
    LoadingState,
    StatusBanner,
} from "../components/searcher/semantic.tsx";
import { ThemeChoices } from "../components/searcher/ThemeChoices.tsx";
import { THEME_LABELS } from "../design-system/theme.ts";
import { api, json } from "../lib/api.ts";
import { errorMessage } from "./state.tsx";
import type { SystemSettingsDto } from "./AdminOverview.tsx";
import { normalizeTheme } from "@shared/contracts.ts";
import { AdminPanelHeader } from "./AdminShell.tsx";
import "../features/admin/admin-ops.css";

const DEFAULT_ENGINE_ITEMS: Record<SystemSettingsDto["defaultEngine"], string> =
    {
        bing: "Bing (必应)",
        google: "Google (谷歌)",
        baidu: "Baidu (百度)",
        duckduckgo: "DuckDuckGo",
    };

const RETENTION_MIN = 1;
const RETENTION_MAX = 3650;
const RETENTION_PRESETS: readonly number[] = [30, 90, 180, 365];
const SAVED_NOTICE_MS = 4000;

function parseRetentionDays(raw: string): number | null {
    if (!/^\d+$/.test(raw.trim())) return null;
    const days = Number(raw.trim());
    return days >= RETENTION_MIN && days <= RETENTION_MAX ? days : null;
}

export function AdminSystemSettings() {
    const [settings, setSettings] = useState<SystemSettingsDto>({
        auditRetentionDays: 90,
        allowRegistration: true,
        defaultEngine: "bing",
        defaultTheme: "system",
        defaultSearchTarget: "same",
    });
    const [savedSettings, setSavedSettings] = useState<
        SystemSettingsDto | null
    >(null);
    // The field keeps what was typed; an empty or out-of-range value is an
    // error of the field, never silently replaced.
    const [retentionInput, setRetentionInput] = useState("90");
    const [retentionError, setRetentionError] = useState("");
    const retentionRef = useRef<HTMLInputElement>(null);
    const [initialized, setInitialized] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [savedAt, setSavedAt] = useState<number | null>(null);

    const registrationChanged = savedSettings !== null &&
        settings.allowRegistration !== savedSettings.allowRegistration;
    const retentionChanged = savedSettings !== null &&
        retentionInput.trim() !== String(savedSettings.auditRetentionDays);
    const engineChanged = savedSettings !== null &&
        settings.defaultEngine !== savedSettings.defaultEngine;
    const themeChanged = savedSettings !== null &&
        settings.defaultTheme !== savedSettings.defaultTheme;
    const targetChanged = savedSettings !== null &&
        settings.defaultSearchTarget !== savedSettings.defaultSearchTarget;

    const changedCount = [
        registrationChanged,
        retentionChanged,
        engineChanged,
        themeChanged,
        targetChanged,
    ].filter(Boolean).length;
    const isDirty = changedCount > 0;
    const parsedRetention = parseRetentionDays(retentionInput);

    useEffect(() => {
        if (savedAt === null) return;
        const timer = setTimeout(() => setSavedAt(null), SAVED_NOTICE_MS);
        return () => clearTimeout(timer);
    }, [savedAt]);

    function applySettings(next: SystemSettingsDto) {
        setSettings(next);
        setSavedSettings(next);
        setRetentionInput(String(next.auditRetentionDays));
        setRetentionError("");
    }

    async function loadSettings() {
        setLoading(true);
        setError("");
        try {
            applySettings(
                await api<SystemSettingsDto>("/api/admin/system/settings"),
            );
            setInitialized(true);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadSettings();
    }, []);

    function handleDiscard() {
        if (savedSettings) {
            applySettings(savedSettings);
        }
        setError("");
    }

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        const auditRetentionDays = parseRetentionDays(retentionInput);
        if (auditRetentionDays === null) {
            setRetentionError(
                `保留期限须为 ${RETENTION_MIN}–${RETENTION_MAX} 之间的整数天`,
            );
            retentionRef.current?.focus();
            return;
        }
        setSaving(true);
        setError("");
        setSavedAt(null);
        try {
            applySettings(
                await api<SystemSettingsDto>(
                    "/api/admin/system/settings",
                    json("PATCH", { ...settings, auditRetentionDays }),
                ),
            );
            setSavedAt(Date.now());
        } catch (err) {
            setError(`保存失败：${errorMessage(err)}`);
        } finally {
            setSaving(false);
        }
    }

    if (!initialized) {
        return (
            <div className="admin-ops-section">
                <AdminPanelHeader
                    title="设置"
                    description="配置全局注册策略、审计日志保留期与新用户默认体验"
                />
                {loading
                    ? <LoadingState>正在加载系统设置…</LoadingState>
                    : (
                        <EmptyState
                            illustration="auth-or-error"
                            title="无法加载系统设置"
                            description={error}
                            action={
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => void loadSettings()}
                                >
                                    重试
                                </Button>
                            }
                        />
                    )}
            </div>
        );
    }

    const retentionSummary = parsedRetention !== null
        ? `${parsedRetention} 天`
        : retentionInput.trim()
        ? `${retentionInput.trim()} 天（无效）`
        : "未填写";

    return (
        <form
            onSubmit={handleSubmit}
            noValidate
            className="admin-ops-section"
        >
            <AdminPanelHeader
                title="设置"
                description="配置全局注册策略、审计日志保留期与新用户默认体验"
                actions={isDirty
                    ? (
                        <span
                            className="admin-pill"
                            data-tone="warning"
                            role="status"
                        >
                            <span
                                className="admin-pill-dot"
                                aria-hidden="true"
                            />
                            <span>有未保存更改</span>
                        </span>
                    )
                    : (
                        <span className="admin-pill" data-tone="neutral">
                            <span
                                className="admin-pill-dot"
                                aria-hidden="true"
                            />
                            <span>配置已同步</span>
                        </span>
                    )}
            />

            {error && (
                <StatusBanner tone="error" density="compact">
                    {error}
                </StatusBanner>
            )}

            <StatusBanner
                tone="success"
                presentation="floating"
                open={savedAt !== null}
            >
                系统设置已保存
            </StatusBanner>

            <div className="admin-settings-layout">
                <div className="admin-settings-main">
                    <section
                        className="admin-surface admin-ops-card"
                        aria-labelledby="admin-settings-security-heading"
                    >
                        <header className="admin-ops-card-head">
                            <div className="admin-ops-card-head-main">
                                <span
                                    className="admin-ops-icon-chip"
                                    data-tone="accent"
                                    aria-hidden="true"
                                >
                                    <ShieldCheck size="1.05em" />
                                </span>
                                <div className="admin-ops-card-titles">
                                    <h3
                                        id="admin-settings-security-heading"
                                        className="admin-ops-card-title"
                                    >
                                        访问与安全策略
                                    </h3>
                                    <p className="admin-ops-card-desc">
                                        控制新用户注册入口与审计日志清理周期
                                    </p>
                                </div>
                            </div>
                        </header>

                        <div className="admin-ops-card-body">
                            <div className="admin-ops-row">
                                <div className="admin-ops-row-label">
                                    <label
                                        htmlFor="allowRegistration"
                                        className="admin-ops-row-title"
                                    >
                                        允许访客注册
                                    </label>
                                    <span className="admin-ops-row-desc">
                                        关闭后访客无法自行注册，管理员仍可在用户页创建账户
                                    </span>
                                </div>
                                <div className="admin-ops-row-control">
                                    <Switch
                                        id="allowRegistration"
                                        aria-label="允许访客注册"
                                        checked={settings.allowRegistration}
                                        disabled={saving}
                                        onCheckedChange={(checked) =>
                                            setSettings((prev) => ({
                                                ...prev,
                                                allowRegistration: checked,
                                            }))}
                                    />
                                </div>
                            </div>

                            <div className="admin-ops-row admin-ops-row--vertical">
                                <div className="admin-ops-row-label">
                                    <label
                                        htmlFor="auditRetentionDays"
                                        className="admin-ops-row-title"
                                    >
                                        审计日志保留期限
                                    </label>
                                    <span className="admin-ops-row-desc">
                                        超出保留天数的历史审计记录会在保存后自动清理
                                    </span>
                                </div>

                                <div className="admin-ops-retention-stack">
                                    <div className="admin-ops-retention-controls">
                                        <div className="admin-ops-retention-field">
                                            <Input
                                                ref={retentionRef}
                                                id="auditRetentionDays"
                                                data-field="standalone"
                                                className="admin-ops-retention-input"
                                                placeholder={`${RETENTION_MIN}–${RETENTION_MAX}`}
                                                type="number"
                                                inputMode="numeric"
                                                min={RETENTION_MIN}
                                                max={RETENTION_MAX}
                                                disabled={saving}
                                                aria-invalid={Boolean(
                                                    retentionError,
                                                ) || undefined}
                                                aria-describedby={retentionError
                                                    ? "auditRetentionDays-error"
                                                    : "auditRetentionDays-hint"}
                                                value={retentionInput}
                                                onChange={(e) => {
                                                    setRetentionInput(
                                                        e.target.value,
                                                    );
                                                    setRetentionError("");
                                                }}
                                            />
                                            <span className="admin-ops-unit">
                                                天
                                            </span>
                                        </div>

                                        <RadioGroup
                                            variant="segmented"
                                            aria-label="审计日志保留期限快捷选项"
                                            disabled={saving}
                                            value={RETENTION_PRESETS.map(String)
                                                    .includes(
                                                        retentionInput.trim(),
                                                    )
                                                ? retentionInput.trim()
                                                : ""}
                                            onValueChange={(next) => {
                                                setRetentionInput(String(next));
                                                setRetentionError("");
                                            }}
                                        >
                                            {RETENTION_PRESETS.map((days) => (
                                                <RadioGroupItem
                                                    key={days}
                                                    value={String(days)}
                                                >
                                                    {days} 天
                                                </RadioGroupItem>
                                            ))}
                                        </RadioGroup>
                                    </div>

                                    {retentionError
                                        ? (
                                            <div
                                                id="auditRetentionDays-error"
                                                role="alert"
                                                className="admin-ops-field-message"
                                                data-tone="danger"
                                            >
                                                {retentionError}
                                            </div>
                                        )
                                        : (
                                            <div
                                                id="auditRetentionDays-hint"
                                                className="admin-ops-field-message"
                                            >
                                                有效范围 {RETENTION_MIN}–
                                                {RETENTION_MAX} 天
                                            </div>
                                        )}
                                </div>
                            </div>
                        </div>
                    </section>

                    <section
                        className="admin-surface admin-ops-card"
                        aria-labelledby="admin-settings-defaults-heading"
                    >
                        <header className="admin-ops-card-head">
                            <div className="admin-ops-card-head-main">
                                <span
                                    className="admin-ops-icon-chip"
                                    data-tone="neutral"
                                    aria-hidden="true"
                                >
                                    <SlidersHorizontal size="1.05em" />
                                </span>
                                <div className="admin-ops-card-titles">
                                    <h3
                                        id="admin-settings-defaults-heading"
                                        className="admin-ops-card-title"
                                    >
                                        新账户与访客默认值
                                    </h3>
                                    <p className="admin-ops-card-desc">
                                        设定首次访问与新注册账户的初始搜索及外观偏好
                                    </p>
                                </div>
                            </div>
                        </header>

                        <div className="admin-ops-card-body">
                            <div className="admin-ops-row">
                                <div className="admin-ops-row-label">
                                    <span className="admin-ops-row-title">
                                        默认搜索引擎
                                    </span>
                                    <span className="admin-ops-row-desc">
                                        主页搜索框的初始引擎选项
                                    </span>
                                </div>
                                <div className="admin-ops-row-control">
                                    <Select
                                        items={DEFAULT_ENGINE_ITEMS}
                                        value={settings.defaultEngine}
                                        disabled={saving}
                                        onValueChange={(next) => {
                                            if (next !== null) {
                                                setSettings((prev) => ({
                                                    ...prev,
                                                    defaultEngine:
                                                        next as SystemSettingsDto[
                                                            "defaultEngine"
                                                        ],
                                                }));
                                            }
                                        }}
                                    >
                                        <SelectTrigger
                                            aria-label="默认搜索引擎"
                                            className="admin-ops-select-trigger"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="bing">
                                                Bing (必应)
                                            </SelectItem>
                                            <SelectItem value="google">
                                                Google (谷歌)
                                            </SelectItem>
                                            <SelectItem value="baidu">
                                                Baidu (百度)
                                            </SelectItem>
                                            <SelectItem value="duckduckgo">
                                                DuckDuckGo
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="admin-ops-row admin-ops-row--vertical">
                                <div className="admin-ops-row-label">
                                    <span className="admin-ops-row-title">
                                        默认界面主题
                                    </span>
                                    <span className="admin-ops-row-desc">
                                        支持浅色、深色、跟随系统与高对比主题
                                    </span>
                                </div>
                                <div className="admin-ops-row-control">
                                    <ThemeChoices
                                        value={settings.defaultTheme}
                                        label="默认界面主题"
                                        onValueChange={(next) =>
                                            setSettings((prev) => ({
                                                ...prev,
                                                defaultTheme: normalizeTheme(
                                                    next,
                                                ),
                                            }))}
                                    />
                                </div>
                            </div>

                            <div className="admin-ops-row">
                                <div className="admin-ops-row-label">
                                    <span className="admin-ops-row-title">
                                        搜索结果打开方式
                                    </span>
                                    <span className="admin-ops-row-desc">
                                        提交搜索后在当前页跳转或新开标签页
                                    </span>
                                </div>
                                <div className="admin-ops-row-control">
                                    <RadioGroup
                                        variant="segmented"
                                        aria-label="搜索结果打开方式"
                                        disabled={saving}
                                        value={settings.defaultSearchTarget}
                                        onValueChange={(next) =>
                                            setSettings((prev) => ({
                                                ...prev,
                                                defaultSearchTarget:
                                                    next as SystemSettingsDto[
                                                        "defaultSearchTarget"
                                                    ],
                                            }))}
                                    >
                                        <RadioGroupItem value="same">
                                            当前标签页
                                        </RadioGroupItem>
                                        <RadioGroupItem value="new">
                                            新标签页
                                        </RadioGroupItem>
                                    </RadioGroup>
                                </div>
                            </div>
                        </div>

                        <footer className="admin-ops-card-foot">
                            仅对新创建的账户与未登录访客生效，已有用户的个人设置不受影响。
                        </footer>
                    </section>

                    {isDirty && (
                        <div
                            className="admin-dirty-bar"
                            role="region"
                            aria-label="未保存设置操作栏"
                        >
                            <div className="admin-dirty-bar-info">
                                <span
                                    className="admin-dirty-bar-dot"
                                    aria-hidden="true"
                                />
                                <span>有 {changedCount} 项未保存更改</span>
                            </div>
                            <div className="admin-dirty-bar-actions">
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={saving}
                                    onClick={handleDiscard}
                                >
                                    放弃更改
                                </Button>
                                <Button
                                    type="submit"
                                    variant="default"
                                    disabled={saving || loading}
                                >
                                    <span>
                                        {saving ? "正在保存…" : "保存设置"}
                                    </span>
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <aside
                    className="admin-surface admin-ops-card admin-settings-summary"
                    aria-labelledby="admin-settings-summary-heading"
                >
                    <header className="admin-ops-card-head">
                        <div className="admin-ops-card-titles">
                            <h3
                                id="admin-settings-summary-heading"
                                className="admin-ops-card-title"
                            >
                                策略生效摘要
                            </h3>
                            <p className="admin-ops-card-desc">
                                {isDirty
                                    ? `已修改 ${changedCount} 项，保存后生效`
                                    : "当前实例生效配置"}
                            </p>
                        </div>
                        <span
                            className="admin-pill"
                            data-tone={isDirty ? "accent" : "neutral"}
                        >
                            {isDirty ? `${changedCount} 项变更` : "已生效"}
                        </span>
                    </header>

                    <dl className="admin-ops-summary-list">
                        <div
                            className="admin-ops-summary-item"
                            data-changed={registrationChanged || undefined}
                        >
                            <dt>
                                {registrationChanged && (
                                    <span
                                        className="admin-ops-changed-dot"
                                        aria-hidden="true"
                                    />
                                )}
                                <span>访客注册</span>
                            </dt>
                            <dd>
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
                                    <span>
                                        {settings.allowRegistration
                                            ? "开放注册"
                                            : "仅管理员创建"}
                                    </span>
                                </span>
                            </dd>
                        </div>

                        <div
                            className="admin-ops-summary-item"
                            data-changed={retentionChanged || undefined}
                        >
                            <dt>
                                {retentionChanged && (
                                    <span
                                        className="admin-ops-changed-dot"
                                        aria-hidden="true"
                                    />
                                )}
                                <span>审计保留</span>
                            </dt>
                            <dd
                                data-tone={parsedRetention === null
                                    ? "danger"
                                    : undefined}
                            >
                                {retentionSummary}
                            </dd>
                        </div>

                        <div
                            className="admin-ops-summary-item"
                            data-changed={engineChanged || undefined}
                        >
                            <dt>
                                {engineChanged && (
                                    <span
                                        className="admin-ops-changed-dot"
                                        aria-hidden="true"
                                    />
                                )}
                                <span>默认搜索</span>
                            </dt>
                            <dd>
                                {DEFAULT_ENGINE_ITEMS[settings.defaultEngine]}
                            </dd>
                        </div>

                        <div
                            className="admin-ops-summary-item"
                            data-changed={themeChanged || undefined}
                        >
                            <dt>
                                {themeChanged && (
                                    <span
                                        className="admin-ops-changed-dot"
                                        aria-hidden="true"
                                    />
                                )}
                                <span>默认主题</span>
                            </dt>
                            <dd>{THEME_LABELS[settings.defaultTheme]}</dd>
                        </div>

                        <div
                            className="admin-ops-summary-item"
                            data-changed={targetChanged || undefined}
                        >
                            <dt>
                                {targetChanged && (
                                    <span
                                        className="admin-ops-changed-dot"
                                        aria-hidden="true"
                                    />
                                )}
                                <span>打开方式</span>
                            </dt>
                            <dd>
                                {settings.defaultSearchTarget === "new"
                                    ? "新标签页"
                                    : "当前标签页"}
                            </dd>
                        </div>
                    </dl>

                    <footer className="admin-ops-card-foot">
                        {isDirty
                            ? `已修改 ${changedCount} 项配置，保存后立即写入系统设置。`
                            : "所有策略已与服务端配置保持一致。"}
                    </footer>
                </aside>
            </div>
        </form>
    );
}
