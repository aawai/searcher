import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type {
    AiModelDto,
    AiProviderDto,
} from "../../../src/features/ai/types.ts";
import { Button } from "../components/ui/button.tsx";
import { api, json } from "../lib/api.ts";
import { errorMessage, useAppState } from "./state.tsx";
export function AiSettings() {
    const { user } = useAppState();
    const [providers, setProviders] = useState<AiProviderDto[]>([]);
    const [models, setModels] = useState<AiModelDto[]>([]);
    const [name, setName] = useState("");
    const [baseUrl, setBaseUrl] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [scope, setScope] = useState<"user" | "system">("user");
    const [editing, setEditing] = useState<string | null>(null);
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
            setEditing(null);
            setName("");
            setBaseUrl("");
            setApiKey("");
            await load();
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
            <p className="muted">
                配置 OpenAI-Compatible Endpoint。保存前通过 /models 验证；Key
                只在服务端加密保存。
            </p>
            <form onSubmit={save} className="setting-group">
                <h3>{editing ? "编辑 Provider" : "添加 Provider"}</h3>
                <label className="field">
                    名称<input
                        required
                        maxLength={100}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                    />
                </label>
                <label className="field">
                    Base URL<input
                        required
                        type="url"
                        placeholder="https://example.com/v1"
                        value={baseUrl}
                        onChange={(e) => setBaseUrl(e.target.value)}
                    />
                </label>
                <label className="field">
                    API Key<input
                        required={!editing}
                        type="password"
                        autoComplete="off"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={editing
                            ? "留空保持现有 Key"
                            : "输入 API Key"}
                    />
                </label>
                {!editing && user.role === "admin" && (
                    <label className="field">
                        范围<select
                            value={scope}
                            onChange={(e) =>
                                setScope(e.target.value as "user" | "system")}
                        >
                            <option value="user">仅自己</option>
                            <option value="system">所有用户</option>
                        </select>
                    </label>
                )}
                <div className="form-actions">
                    <Button type="submit" variant="default" disabled={working}>
                        {working
                            ? "正在验证模型…"
                            : editing
                            ? "保存并验证"
                            : "添加并验证"}
                    </Button>
                    {editing && (
                        <Button
                            type="button"
                            onClick={() => {
                                setEditing(null);
                                setName("");
                                setBaseUrl("");
                                setApiKey("");
                            }}
                        >
                            取消
                        </Button>
                    )}
                </div>
            </form>
            <h3>已配置的 Provider</h3>
            {!providers.length && (
                <p className="muted">尚无 Provider。添加后可开始问答。</p>
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
                                    onClick={() => {
                                        setEditing(provider.id);
                                        setName(provider.name);
                                        setBaseUrl(provider.baseUrl);
                                        setApiKey("");
                                    }}
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
