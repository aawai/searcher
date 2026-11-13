import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Switch } from "../components/ui/switch.tsx";
import {
    NativeSelect,
    NativeSelectOption,
} from "../components/ui/native-select.tsx";
import {
    ActionGroup,
    EmptyState,
    LoadingState,
    SettingsGroup,
    SettingsRow,
    StatusBanner,
} from "../components/searcher/semantic.tsx";
import { api, json } from "../lib/api.ts";
import { errorMessage } from "./state.tsx";
import type { SystemSettingsDto } from "./AdminOverview.tsx";
import { normalizeTheme, THEME_IDS } from "@shared/contracts.ts";
import { THEME_LABELS } from "../design-system/theme.ts";
import "./admin.css";

const RETENTION_MIN = 1;
const RETENTION_MAX = 3650;
const SAVED_NOTICE_MS = 4000;

function parseRetentionDays(raw: string): number | null {
    if (!/^\d+$/.test(raw.trim())) return null;
    const days = Number(raw);
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

    useEffect(() => {
        if (savedAt === null) return;
        const timer = setTimeout(() => setSavedAt(null), SAVED_NOTICE_MS);
        return () => clearTimeout(timer);
    }, [savedAt]);

    function applySettings(next: SystemSettingsDto) {
        setSettings(next);
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
            <div className="semantic-section" data-content="grouped">
                {loading
                    ? <LoadingState>正在加载系统设置…</LoadingState>
                    : (
                        <EmptyState
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

    return (
        <form
            onSubmit={handleSubmit}
            noValidate
            className="semantic-section"
            data-content="grouped"
        >
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

            <SettingsGroup
                title="注册"
                footer="关闭后访客无法自行注册，管理员仍可创建用户。"
            >
                <SettingsRow title="允许访客注册">
                    <Switch
                        id="allowRegistration"
                        aria-label="允许访客注册"
                        checked={settings.allowRegistration}
                        onCheckedChange={(checked) =>
                            setSettings({
                                ...settings,
                                allowRegistration: checked,
                            })}
                    />
                </SettingsRow>
            </SettingsGroup>

            <SettingsGroup
                title="审计"
                footer="超出保留期限的审计记录会被自动清理。"
            >
                <SettingsRow
                    title="保留期限"
                    labelFor="auditRetentionDays"
                    message={retentionError
                        ? <span role="alert">{retentionError}</span>
                        : undefined}
                    messageId="auditRetentionDays-error"
                    invalid={Boolean(retentionError)}
                >
                    <Input
                        ref={retentionRef}
                        id="auditRetentionDays"
                        placeholder={`${RETENTION_MIN}–${RETENTION_MAX}`}
                        type="number"
                        inputMode="numeric"
                        min={RETENTION_MIN}
                        max={RETENTION_MAX}
                        aria-invalid={Boolean(retentionError) || undefined}
                        aria-describedby={retentionError
                            ? "auditRetentionDays-error"
                            : undefined}
                        value={retentionInput}
                        onChange={(e) => {
                            setRetentionInput(e.target.value);
                            setRetentionError("");
                        }}
                    />
                    <span>天</span>
                </SettingsRow>
            </SettingsGroup>

            <SettingsGroup
                title="新账户默认值"
                footer="新账户与未登录访客使用这些默认值，已有用户的设置不变。"
            >
                <SettingsRow title="搜索引擎">
                    <NativeSelect
                        aria-label="默认搜索引擎"
                        value={settings.defaultEngine}
                        onChange={(e) =>
                            setSettings({
                                ...settings,
                                defaultEngine: e.target
                                    .value as SystemSettingsDto[
                                        "defaultEngine"
                                    ],
                            })}
                    >
                        <NativeSelectOption value="bing">
                            Bing (必应)
                        </NativeSelectOption>
                        <NativeSelectOption value="google">
                            Google (谷歌)
                        </NativeSelectOption>
                        <NativeSelectOption value="baidu">
                            Baidu (百度)
                        </NativeSelectOption>
                        <NativeSelectOption value="duckduckgo">
                            DuckDuckGo
                        </NativeSelectOption>
                    </NativeSelect>
                </SettingsRow>

                <SettingsRow title="界面主题">
                    <NativeSelect
                        aria-label="默认界面主题"
                        value={settings.defaultTheme}
                        onChange={(e) =>
                            setSettings({
                                ...settings,
                                defaultTheme: normalizeTheme(
                                    e.target.value,
                                ),
                            })}
                    >
                        {THEME_IDS.map((id) => (
                            <NativeSelectOption key={id} value={id}>
                                {THEME_LABELS[id]}
                            </NativeSelectOption>
                        ))}
                    </NativeSelect>
                </SettingsRow>

                <SettingsRow title="结果打开方式">
                    <NativeSelect
                        aria-label="搜索结果打开方式"
                        value={settings.defaultSearchTarget}
                        onChange={(e) =>
                            setSettings({
                                ...settings,
                                defaultSearchTarget: e.target
                                    .value as SystemSettingsDto[
                                        "defaultSearchTarget"
                                    ],
                            })}
                    >
                        <NativeSelectOption value="same">
                            当前标签页打开
                        </NativeSelectOption>
                        <NativeSelectOption value="new">
                            新标签页打开
                        </NativeSelectOption>
                    </NativeSelect>
                </SettingsRow>
            </SettingsGroup>

            <ActionGroup>
                <Button
                    variant="default"
                    type="submit"
                    disabled={saving || loading}
                >
                    <span>{saving ? "正在保存…" : "保存设置"}</span>
                </Button>
            </ActionGroup>
        </form>
    );
}
