import { type FormEvent, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Save } from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { Switch } from "../components/ui/switch.tsx";
import {
    NativeSelect,
    NativeSelectOption,
} from "../components/ui/native-select.tsx";
import {
    SectionHeader,
    SettingsCard,
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
    const [loading, setLoading] = useState(false);
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
        } catch (err) {
            setError(
                "获取系统设置失败: " + errorMessage(err),
            );
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
            setSuccessMessage("系统设置已成功保存并立即生效。");
            setTimeout(() => setSuccessMessage(""), 4000);
        } catch (err) {
            setError(
                "保存设置失败: " + errorMessage(err),
            );
        } finally {
            setSaving(false);
        }
    }

    if (loading && !settings.defaultEngine) {
        return (
            <div className="text-muted py-8">
                正在加载系统设置…
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="semantic-section max-w-2xl">
            <SectionHeader
                title="全局系统设置"
                description="配置全站范围的安全、生命周期与新访客默认行为。所有改动立即持久化并在服务重启后保持。"
            />

            {error && (
                <StatusBanner tone="error">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={16} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                </StatusBanner>
            )}

            {successMessage && (
                <StatusBanner tone="success">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="shrink-0" />
                        <span>{successMessage}</span>
                    </div>
                </StatusBanner>
            )}

            <SettingsCard>
                {/* 1. Audit Retention */}
                <SettingsRow
                    title="审计日志保留期 (Audit Log Retention)"
                    description="超出此期限的审计日志将被系统自动清理，防止数据库无限膨胀。必须介于 1 到 3650 天之间。"
                >
                    <div className="admin-retention-input-group">
                        <Input
                            id="auditRetentionDays"
                            type="number"
                            min={1}
                            max={3650}
                            value={settings.auditRetentionDays}
                            onChange={(e) =>
                                setSettings({
                                    ...settings,
                                    auditRetentionDays:
                                        parseInt(e.target.value, 10) || 90,
                                })}
                            required
                            className="admin-number-input"
                        />
                        <span className="text-muted text-sm">天</span>
                    </div>
                </SettingsRow>

                {/* 2. Registration Switch */}
                <SettingsRow
                    title="注册策略控制 (Registration Control)"
                    description="开放访客自行注册账户。关闭后首页将隐藏注册入口，访客无法自行创建账户；只有管理员可在后台手动创建用户。"
                >
                    <Switch
                        id="allowRegistration"
                        checked={settings.allowRegistration}
                        onCheckedChange={(checked) =>
                            setSettings({
                                ...settings,
                                allowRegistration: checked,
                            })}
                    />
                </SettingsRow>

                {/* 3. Default Engine */}
                <SettingsRow
                    title="默认搜索引擎"
                    description="未登录访客或新用户默认使用的聚合搜索源"
                >
                    <div className="admin-select-control">
                        <NativeSelect
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
                    </div>
                </SettingsRow>

                {/* 4. Default Theme */}
                <SettingsRow
                    title="默认界面主题"
                    description="访客首次进入系统时的明暗模式外观"
                >
                    <div className="admin-select-control">
                        <NativeSelect
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
                                跟随系统 (System)
                            </NativeSelectOption>
                            <NativeSelectOption value="light">
                                浅色模式 (Light)
                            </NativeSelectOption>
                            <NativeSelectOption value="dark">
                                深色模式 (Dark)
                            </NativeSelectOption>
                        </NativeSelect>
                    </div>
                </SettingsRow>

                {/* 5. Default Search Target */}
                <SettingsRow
                    title="搜索结果打开方式"
                    description="点击搜索结果列表时的默认目标标签页"
                >
                    <div className="admin-select-control">
                        <NativeSelect
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
                                当前标签页打开 (Same)
                            </NativeSelectOption>
                            <NativeSelectOption value="new">
                                新标签页打开 (New Tab)
                            </NativeSelectOption>
                        </NativeSelect>
                    </div>
                </SettingsRow>
            </SettingsCard>

            {/* Action Bar */}
            <div className="admin-form-actions">
                <Button
                    variant="default"
                    type="submit"
                    disabled={saving}
                >
                    <Save size={16} />
                    <span>{saving ? "正在保存…" : "保存系统设置"}</span>
                </Button>
            </div>
        </form>
    );
}
