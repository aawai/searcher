import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Plus, RefreshCw, Trash2 } from "lucide-react";
import type {
    AiModelDto,
    AiProviderDto,
} from "../../../src/features/ai/types.ts";
import { Button } from "../components/ui/button.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "../components/ui/dialog.tsx";
import { api, json } from "../lib/api.ts";
import { errorMessage, useAppState } from "./state.tsx";

export function AiSettings() {
    const { user } = useAppState();
    const [providers, setProviders] = useState<AiProviderDto[]>([]);
    const [models, setModels] = useState<AiModelDto[]>([]);
    const [name, setName] = useState("");
    const [baseUrl, setBaseUrl] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [showApiKey, setShowApiKey] = useState(false);
    const [scope, setScope] = useState<"user" | "system">("user");
    const [editing, setEditing] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState("");
    const [status, setStatus] = useState("");
    async function load() {
        const [p, m] = await Promise.all([
            api<AiProviderDto[]>("/api/ai/providers"),
            api<AiModelDto[]>("/api/ai/models"),
        ]);
        setProviders(p);
        setModels(m);
    }
    useEffect(() => {
        if (!user) return;
        void load().catch((e) => setError(errorMessage(e)));
    }, [user?.id]);
    if (!user) {
        return (
            <p>
                <Link to="/login">登录后配置 Provider</Link>
            </p>
        );
    }
    function openAdd() {
        setEditing(null);
        setName("");
        setBaseUrl("");
        setApiKey("");
        setShowApiKey(false);
        setError("");
        setIsModalOpen(true);
    }

    function openEdit(provider: AiProviderDto) {
        setEditing(provider.id);
        setName(provider.name);
        setBaseUrl(provider.baseUrl);
        setApiKey("");
        setShowApiKey(false);
        setError("");
        setIsModalOpen(true);
    }

    async function save(event: React.FormEvent) {
        event.preventDefault();
        setError("");
        setStatus("");
        setWorking(true);
        try {
            await api(
                editing
                    ? "/api/ai/providers/" + encodeURIComponent(editing)
                    : "/api/ai/providers",
                json(
                    editing ? "PUT" : "POST",
                    editing
                        ? { name, baseUrl, ...(apiKey ? { apiKey } : {}) }
                        : { name, baseUrl, apiKey, scope },
                ),
            );
            await load();
            setEditing(null);
            setName("");
            setBaseUrl("");
            setApiKey("");
            setShowApiKey(false);
            setIsModalOpen(false);
            setStatus("Provider 和模型已同步");
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setWorking(false);
        }
    }
    async function changeModel(id: string, patch: Record<string, unknown>) {
        setError("");
        try {
            await api(
                "/api/ai/models/" + encodeURIComponent(id),
                json("PATCH", patch),
            );
            await load();
        } catch (e) {
            setError(errorMessage(e));
        }
    }
    async function refresh(id: string) {
        setWorking(true);
        setError("");
        try {
            await api(
                "/api/ai/providers/" + encodeURIComponent(id) + "/refresh",
                { method: "POST" },
            );
            await load();
            setStatus("模型列表已刷新");
        } catch (e) {
            setError(errorMessage(e));
        } finally {
            setWorking(false);
        }
    }
    async function remove(id: string) {
        if (!window.confirm("删除 Provider 及其模型？")) return;
        try {
            await api("/api/ai/providers/" + encodeURIComponent(id), {
                method: "DELETE",
            });
            await load();
        } catch (e) {
            setError(errorMessage(e));
        }
    }
    return (
        <div className="ai-settings">
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "16px",
                    flexWrap: "wrap",
                    gap: "12px",
                }}
            >
                <div>
                    <h3 style={{ margin: 0, fontSize: "16px" }}>
                        已配置的 Provider
                    </h3>
                    <p
                        className="muted"
                        style={{ margin: "4px 0 0", fontSize: "13px" }}
                    >
                        配置 OpenAI 兼容 API Endpoint，Key 在服务端加密保存
                    </p>
                </div>
                <Button variant="default" onClick={openAdd}>
                    <Plus size={16} />
                    <span>添加 Provider</span>
                </Button>
            </div>

            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent
                    aria-label={editing ? "编辑 Provider" : "添加 Provider"}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {editing ? "编辑 Provider" : "添加 Provider"}
                        </DialogTitle>
                        <DialogDescription>
                            填写 OpenAI 兼容 API 信息。保存前会自动请求 /models
                            进行连接验证。
                        </DialogDescription>
                    </DialogHeader>
                    <form
                        onSubmit={save}
                        style={{
                            display: "grid",
                            gap: "16px",
                            marginTop: "12px",
                        }}
                    >
                        <label className="field">
                            名称
                            <input
                                required
                                maxLength={100}
                                value={name}
                                placeholder="例如：OpenAI、DeepSeek、Ollama"
                                onChange={(e) => setName(e.target.value)}
                            />
                        </label>
                        <label className="field">
                            Base URL
                            <input
                                required
                                type="url"
                                placeholder="https://api.openai.com/v1"
                                value={baseUrl}
                                onChange={(e) => setBaseUrl(e.target.value)}
                            />
                        </label>
                        <div className="field">
                            <label htmlFor="ai-api-key">API Key</label>
                            <div style={{ display: "flex", gap: "8px" }}>
                                <input
                                    id="ai-api-key"
                                    required={!editing}
                                    type={showApiKey ? "text" : "password"}
                                    autoComplete="off"
                                    value={apiKey}
                                    onChange={(e) => setApiKey(e.target.value)}
                                    placeholder={editing
                                        ? "留空保持现有 Key"
                                        : "输入 API Key"}
                                    style={{ flex: 1 }}
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => setShowApiKey(!showApiKey)}
                                    aria-label={showApiKey
                                        ? "隐藏 API Key"
                                        : "显示 API Key"}
                                    title={showApiKey ? "隐藏" : "显示"}
                                >
                                    {showApiKey
                                        ? <EyeOff size={16} />
                                        : <Eye size={16} />}
                                </Button>
                            </div>
                            <p
                                className="muted"
                                style={{ margin: "4px 0 0", fontSize: "12px" }}
                            >
                                Key
                                仅存储在服务端，并经过安全密钥加密，不会向前端明文暴露。
                            </p>
                        </div>
                        {!editing && user.role === "admin" && (
                            <label className="field">
                                范围
                                <select
                                    value={scope}
                                    onChange={(e) =>
                                        setScope(
                                            e.target.value as "user" | "system",
                                        )}
                                >
                                    <option value="user">仅自己可用</option>
                                    <option value="system">
                                        系统共享（所有用户）
                                    </option>
                                </select>
                            </label>
                        )}
                        {error && (
                            <p
                                role="alert"
                                className="error"
                                style={{ margin: "4px 0 0" }}
                            >
                                {error}
                            </p>
                        )}
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "flex-end",
                                gap: "8px",
                                marginTop: "8px",
                            }}
                        >
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsModalOpen(false)}
                            >
                                取消
                            </Button>
                            <Button
                                type="submit"
                                variant="default"
                                disabled={working}
                            >
                                {working
                                    ? "正在验证模型…"
                                    : editing
                                    ? "保存并验证"
                                    : "验证并添加"}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            {!providers.length && (
                <div
                    style={{
                        padding: "32px 20px",
                        textAlign: "center",
                        border: "1px dashed var(--border)",
                        borderRadius: "12px",
                        background: "var(--surface)",
                        marginTop: "12px",
                    }}
                >
                    <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
                        尚未添加 AI Provider
                    </p>
                    <p
                        className="muted"
                        style={{ margin: "0 0 16px", fontSize: "13px" }}
                    >
                        添加 Provider 并验证模型后，即可在主页直接切换使用 AI
                        问答。
                    </p>
                    <Button variant="default" onClick={openAdd}>
                        <Plus size={16} />
                        <span>添加第一个 Provider</span>
                    </Button>
                </div>
            )}
            {providers.map((provider) => (
                <section className="provider-card" key={provider.id}>
                    <div className="provider-head">
                        <div>
                            <h4>
                                {provider.name}{" "}
                                <small>
                                    {provider.scope === "system"
                                        ? "系统"
                                        : "个人"}
                                </small>
                            </h4>
                            <p className="muted">
                                {provider.baseUrl} · Key {provider.apiKeyMasked}
                            </p>
                        </div>
                        {(provider.ownerUserId === user.id ||
                            user.role === "admin") && (
                            <div className="form-actions">
                                <Button
                                    type="button"
                                    disabled={working}
                                    onClick={() => openEdit(provider)}
                                >
                                    编辑
                                </Button>
                                <Button
                                    type="button"
                                    disabled={working}
                                    onClick={() => void refresh(provider.id)}
                                >
                                    刷新模型
                                </Button>
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={() => void remove(provider.id)}
                                >
                                    删除
                                </Button>
                            </div>
                        )}
                    </div>
                    <div className="provider-models">
                        {models.filter((model) =>
                            model.providerId === provider.id
                        ).map((model) => (
                            <div key={model.id} className="model-row">
                                <span>
                                    {model.displayName}{" "}
                                    <small className="muted">
                                        {model.modelId}
                                    </small>
                                </span>
                                {(provider.ownerUserId === user.id ||
                                    user.role === "admin") && (
                                    <div className="form-actions">
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={model.enabled}
                                                onChange={(e) =>
                                                    void changeModel(model.id, {
                                                        enabled:
                                                            e.target.checked,
                                                    })}
                                            />{" "}
                                            启用
                                        </label>
                                        <label>
                                            <input
                                                type="checkbox"
                                                checked={model.visibleToUsers}
                                                onChange={(e) =>
                                                    void changeModel(model.id, {
                                                        visibleToUsers:
                                                            e.target.checked,
                                                    })}
                                            />{" "}
                                            可见
                                        </label>
                                        <label>
                                            <input
                                                type="radio"
                                                name={"default-" + provider.id}
                                                checked={model.isDefault}
                                                onChange={() =>
                                                    void changeModel(model.id, {
                                                        isDefault: true,
                                                    })}
                                            />{" "}
                                            默认
                                        </label>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            ))}
            {status && <p role="status">{status}</p>}
            {error && <p role="alert" className="error">{error}</p>}
        </div>
    );
}
