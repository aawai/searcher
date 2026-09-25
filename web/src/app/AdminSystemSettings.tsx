import { type FormEvent, useEffect, useState } from "react";
import {
    AlertCircle,
    CheckCircle2,
    Clock,
    Globe,
    Layers,
    Lock,
    Save,
    Search,
    Shield,
    Sliders,
    SunMoon,
} from "lucide-react";
import { Button } from "../components/ui/button.tsx";
import { api, json } from "../lib/api.ts";
import { errorMessage } from "./state.tsx";
import type { SystemSettingsDto } from "./AdminOverview.tsx";

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
            <div style={{ padding: "32px 0", color: "var(--muted)" }}>
                正在加载系统设置…
            </div>
        );
    }

    return (
        <form
            onSubmit={handleSubmit}
            style={{
                display: "flex",
                flexDirection: "column",
                gap: "28px",
                maxWidth: "680px",
            }}
        >
            <div>
                <h2
                    style={{
                        margin: "0 0 6px",
                        fontSize: "20px",
                        fontWeight: 700,
                    }}
                >
                    全局系统设置
                </h2>
                <p
                    className="muted"
                    style={{ margin: 0, fontSize: "14px", lineHeight: 1.5 }}
                >
                    配置全站范围的安全、生命周期与新访客默认行为。所有改动立即持久化并在服务重启后保持。
                </p>
            </div>

            {error && (
                <div
                    role="alert"
                    className="error"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        border: "1px solid var(--danger)",
                        background:
                            "color-mix(in srgb, var(--danger) 10%, var(--surface))",
                        fontSize: "14px",
                    }}
                >
                    <AlertCircle
                        size={16}
                        style={{ color: "var(--danger)", flexShrink: 0 }}
                    />
                    <span>{error}</span>
                </div>
            )}

            {successMessage && (
                <div
                    role="status"
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        border: "1px solid var(--success)",
                        background:
                            "color-mix(in srgb, var(--success) 10%, var(--surface))",
                        color: "var(--success)",
                        fontSize: "14px",
                        fontWeight: 500,
                    }}
                >
                    <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                    <span>{successMessage}</span>
                </div>
            )}

            {/* Form Sections */}
            <div
                style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "24px",
                    padding: "20px",
                    borderRadius: "12px",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                }}
            >
                {/* 1. Audit Retention */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                        }}
                    >
                        <Clock size={18} style={{ color: "var(--accent)" }} />
                        <label
                            htmlFor="auditRetentionDays"
                            style={{ fontWeight: 650, fontSize: "15px" }}
                        >
                            审计日志保留期 (Audit Log Retention)
                        </label>
                    </div>
                    <p
                        className="muted"
                        style={{ margin: 0, fontSize: "13px", lineHeight: 1.5 }}
                    >
                        超出此期限的审计日志将被系统自动清理，防止数据库无限膨胀。必须介于
                        1 到 3650 天之间。
                    </p>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "12px",
                            marginTop: "4px",
                        }}
                    >
                        <input
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
                            style={{
                                width: "140px",
                                padding: "8px 12px",
                                borderRadius: "6px",
                                border: "1px solid var(--border)",
                                background: "var(--background)",
                                color: "var(--foreground)",
                                fontSize: "15px",
                                fontWeight: 600,
                            }}
                        />
                        <span
                            style={{ fontSize: "14px", color: "var(--muted)" }}
                        >
                            天 (1 ~ 3650 天)
                        </span>
                    </div>
                </div>

                <hr
                    style={{
                        border: "none",
                        borderTop: "1px solid var(--border)",
                        margin: 0,
                    }}
                />

                {/* 2. Registration Switch */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                        }}
                    >
                        <Lock size={18} style={{ color: "var(--accent)" }} />
                        <span style={{ fontWeight: 650, fontSize: "15px" }}>
                            注册策略控制 (Registration Control)
                        </span>
                    </div>
                    <label
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            cursor: "pointer",
                            userSelect: "none",
                            marginTop: "4px",
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={settings.allowRegistration}
                            onChange={(e) =>
                                setSettings({
                                    ...settings,
                                    allowRegistration: e.target.checked,
                                })}
                            style={{
                                width: "18px",
                                height: "18px",
                                cursor: "pointer",
                            }}
                        />
                        <span style={{ fontSize: "14px", fontWeight: 500 }}>
                            开放访客自行注册账户
                        </span>
                    </label>
                    <p
                        className="muted"
                        style={{
                            margin: "0 0 0 28px",
                            fontSize: "13px",
                            lineHeight: 1.5,
                        }}
                    >
                        关闭后，首页将隐藏注册入口，访客无法自行创建账户；只有管理员可在后台手动创建用户。
                    </p>
                </div>

                <hr
                    style={{
                        border: "none",
                        borderTop: "1px solid var(--border)",
                        margin: 0,
                    }}
                />

                {/* 3. New Visitor Defaults */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                        }}
                    >
                        <Sliders
                            size={18}
                            style={{ color: "var(--accent)" }}
                        />
                        <span style={{ fontWeight: 650, fontSize: "15px" }}>
                            访客初始默认偏好 (New Visitor Defaults)
                        </span>
                    </div>
                    <p
                        className="muted"
                        style={{ margin: 0, fontSize: "13px", lineHeight: 1.5 }}
                    >
                        未登录访客首次访问或未设置偏好时的预设值。
                    </p>

                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns:
                                "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: "16px",
                            marginTop: "4px",
                        }}
                    >
                        {/* Default Engine */}
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                            }}
                        >
                            <label
                                style={{
                                    fontSize: "13px",
                                    fontWeight: 500,
                                    color: "var(--muted)",
                                }}
                            >
                                默认搜索引擎
                            </label>
                            <select
                                value={settings.defaultEngine}
                                onChange={(e) =>
                                    setSettings({
                                        ...settings,
                                        defaultEngine: e.target
                                            .value as SystemSettingsDto[
                                                "defaultEngine"
                                            ],
                                    })}
                                style={{
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    border: "1px solid var(--border)",
                                    background: "var(--background)",
                                    color: "var(--foreground)",
                                    fontSize: "14px",
                                }}
                            >
                                <option value="bing">Bing (必应)</option>
                                <option value="google">Google (谷歌)</option>
                                <option value="baidu">Baidu (百度)</option>
                                <option value="duckduckgo">DuckDuckGo</option>
                            </select>
                        </div>

                        {/* Default Theme */}
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                            }}
                        >
                            <label
                                style={{
                                    fontSize: "13px",
                                    fontWeight: 500,
                                    color: "var(--muted)",
                                }}
                            >
                                默认界面主题
                            </label>
                            <select
                                value={settings.defaultTheme}
                                onChange={(e) =>
                                    setSettings({
                                        ...settings,
                                        defaultTheme: e.target
                                            .value as SystemSettingsDto[
                                                "defaultTheme"
                                            ],
                                    })}
                                style={{
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    border: "1px solid var(--border)",
                                    background: "var(--background)",
                                    color: "var(--foreground)",
                                    fontSize: "14px",
                                }}
                            >
                                <option value="system">
                                    跟随系统 (System)
                                </option>
                                <option value="light">浅色模式 (Light)</option>
                                <option value="dark">深色模式 (Dark)</option>
                            </select>
                        </div>

                        {/* Default Search Target */}
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: "6px",
                            }}
                        >
                            <label
                                style={{
                                    fontSize: "13px",
                                    fontWeight: 500,
                                    color: "var(--muted)",
                                }}
                            >
                                搜索结果打开方式
                            </label>
                            <select
                                value={settings.defaultSearchTarget}
                                onChange={(e) =>
                                    setSettings({
                                        ...settings,
                                        defaultSearchTarget: e.target
                                            .value as SystemSettingsDto[
                                                "defaultSearchTarget"
                                            ],
                                    })}
                                style={{
                                    padding: "8px 12px",
                                    borderRadius: "6px",
                                    border: "1px solid var(--border)",
                                    background: "var(--background)",
                                    color: "var(--foreground)",
                                    fontSize: "14px",
                                }}
                            >
                                <option value="same">
                                    当前标签页打开 (Same)
                                </option>
                                <option value="new">
                                    新标签页打开 (New Tab)
                                </option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Action Bar */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                }}
            >
                <Button
                    variant="default"
                    type="submit"
                    disabled={saving}
                    style={{ minHeight: "40px", padding: "0 20px" }}
                >
                    <Save size={16} />
                    <span>{saving ? "正在保存…" : "保存系统设置"}</span>
                </Button>
            </div>
        </form>
    );
}
