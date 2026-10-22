import { type FormEvent, useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Switch } from "../components/ui/switch.tsx";
import {
    NativeSelect,
    NativeSelectOption,
} from "../components/ui/native-select.tsx";
import {
    ActionGroup,
    LoadingState,
    SettingsGroup,
    SettingsRow,
    StatusBanner,
} from "../components/searcher/semantic.tsx";
import { api, json } from "../lib/api.ts";
import { errorMessage } from "./state.tsx";
import type { SystemSettingsDto } from "./AdminOverview.tsx";
import "./admin.css";

export function AdminSystemSettings() {
    const [settings, setSettings] = useState<SystemSettingsDto>({
        auditRetentionDays: 90,
        allowRegistration: true,
        defaultEngine: "bing",
        defaultTheme: "system",
        defaultSearchTarget: "same",
    });
    const [initialized, setInitialized] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    async function loadSettings() {
        setLoading(true);
        setError("");
        try {
            const data = await api<SystemSettingsDto>(
                "/api/admin/system/settings",
            );
            setSettings(data);
            setInitialized(true);
        } catch (err) {
            setError(`获取系统设置失败：${errorMessage(err)}`);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void loadSettings();
    }, []);

    async function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setSaving(true);
        setError("");
        setSuccessMessage("");
        try {
            const updated = await api<SystemSettingsDto>(
                "/api/admin/system/settings",
                json("PATCH", settings),
            );
            setSettings(updated);
            setSuccessMessage("系统设置已保存。");
            setTimeout(() => setSuccessMessage(""), 4000);
        } catch (err) {
            setError(`保存失败：${errorMessage(err)}`);
        } finally {
            setSaving(false);
        }
    }

    return (
        <form onSubmit={handleSubmit} className="admin-panel">
            {error && (
                <StatusBanner tone="error" density="compact">
                    <div className="admin-banner-row">
                        <span className="admin-banner-message">
                            <AlertCircle size="1em" />
                            <span>{error}</span>
                        </span>
                        {!initialized && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={loadSettings}
                                disabled={loading}
                            >
                                <span>{loading ? "正在重试…" : "重试"}</span>
                            </Button>
                        )}
                    </div>
                </StatusBanner>
            )}

            {successMessage && (
                <StatusBanner tone="success" density="compact">
                    <span>{successMessage}</span>
                </StatusBanner>
            )}

            {!initialized && loading && (
                <LoadingState>正在加载系统设置…</LoadingState>
            )}

            {initialized && (
                <>
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
                        <SettingsRow title="保留期限">
                            <Input
                                id="auditRetentionDays"
                                aria-label="审计日志保留期（天）"
                                type="number"
                                min={1}
                                max={3650}
                                value={settings.auditRetentionDays}
                                onChange={(e) =>
                                    setSettings({
                                        ...settings,
                                        auditRetentionDays: parseInt(
                                            e.target.value,
                                            10,
                                        ) || 90,
                                    })}
                                required
                                className="admin-number-input"
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
                                        defaultTheme: e.target
                                            .value as SystemSettingsDto[
                                                "defaultTheme"
                                            ],
                                    })}
                            >
                                <NativeSelectOption value="system">
                                    跟随系统
                                </NativeSelectOption>
                                <NativeSelectOption value="light">
                                    浅色模式
                                </NativeSelectOption>
                                <NativeSelectOption value="dark">
                                    深色模式
                                </NativeSelectOption>
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
                </>
            )}
        </form>
    );
}
