import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { UserDto } from "@shared/contracts.ts";
import { Button } from "../components/ui/button.tsx";
import { api, json } from "../lib/api.ts";
import { errorMessage, useAppState } from "./state.tsx";

export function AuthPage({ kind }: { kind: "login" | "register" }) {
    const navigate = useNavigate();
    const { login } = useAppState();
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [allowRegistration, setAllowRegistration] = useState<boolean | null>(
        null,
    );

    useEffect(() => {
        if (kind === "login") {
            api<{ allowRegistration: boolean }>("/api/auth/register")
                .then((res) => setAllowRegistration(res.allowRegistration))
                .catch(() => setAllowRegistration(true));
        }
    }, [kind]);

    async function submit(event: FormEvent) {
        event.preventDefault();
        setError("");
        setBusy(true);
        try {
            const path = kind === "login"
                ? "/api/auth/login"
                : "/api/auth/register";
            const body = kind === "login"
                ? { username, password }
                : { username, displayName, password };
            const result = await api<{ user: UserDto }>(
                path,
                json("POST", body),
            );
            login(result.user);
            navigate("/");
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    }

    return (
        <main className="page auth-page">
            <h1>{kind === "login" ? "登录 Searcher" : "创建账户"}</h1>
            <p className="muted">
                {kind === "login"
                    ? "登录后同步 Web App、便签与偏好。"
                    : "账户数据只保存在你的 Searcher 服务上。"}
            </p>
            <form onSubmit={submit}>
                <label className="field">
                    用户名
                    <input
                        autoComplete="username"
                        required
                        minLength={3}
                        maxLength={32}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                </label>
                {kind === "register" && (
                    <label className="field">
                        显示名称
                        <input
                            required
                            maxLength={40}
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                        />
                    </label>
                )}
                <label className="field">
                    密码
                    <input
                        type="password"
                        autoComplete={kind === "login"
                            ? "current-password"
                            : "new-password"}
                        required
                        minLength={kind === "login" ? 1 : 12}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </label>
                {error && <p className="error" role="alert">{error}</p>}
                <Button variant="default" type="submit" disabled={busy}>
                    {busy ? "处理中…" : kind === "login" ? "登录" : "创建账户"}
                </Button>
            </form>
            <p className="muted">
                {kind === "login"
                    ? (
                        allowRegistration !== false && (
                            <>
                                没有账户？<Link to="/register">注册</Link>
                            </>
                        )
                    )
                    : (
                        <>
                            已有账户？<Link to="/login">登录</Link>
                        </>
                    )}
            </p>
        </main>
    );
}
