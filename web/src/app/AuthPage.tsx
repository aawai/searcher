import { PageShell } from "../components/searcher/PageShell.tsx";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import { type FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { UserDto } from "@shared/contracts.ts";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { api, json } from "../lib/api.ts";
import { errorMessage, useAppState } from "./state.tsx";
import { authDestination, routes } from "./routes.ts";
import "./auth.css";

export function AuthPage({ kind }: { kind: "login" | "register" }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { login, user, ready } = useAppState();
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
    useEffect(() => {
        if (ready && user) {
            navigate(authDestination(location.search), { replace: true });
        }
    }, [ready, user, location.search, navigate]);

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
            navigate(authDestination(location.search), { replace: true });
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    }
    const destination = authDestination(location.search);
    const nextQuery = destination !== routes.home
        ? `?${new URLSearchParams({ next: destination })}`
        : "";
    const toggleToRegister = `${routes.register}${nextQuery}`;
    const toggleToLogin = `${routes.login}${nextQuery}`;

    return (
        <PageShell archetype="utility" className="auth-page">
            <div className="auth-surface">
                <PageHeader
                    title={kind === "login" ? "登录 Searcher" : "创建账户"}
                    description={kind === "login"
                        ? "登录后同步 APP、便签与偏好。"
                        : "账户数据只保存在你的 Searcher 服务上。"}
                    items={[{ label: "首页", to: routes.home }, {
                        label: kind === "login" ? "登录" : "注册",
                    }]}
                />
                <form onSubmit={submit}>
                    <div className="field">
                        <label htmlFor="auth-username">用户名</label>
                        <Input
                            id="auth-username"
                            autoComplete="username"
                            required
                            minLength={3}
                            maxLength={32}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                        />
                    </div>
                    {kind === "register" && (
                        <div className="field">
                            <label htmlFor="auth-display-name">显示名称</label>
                            <Input
                                id="auth-display-name"
                                required
                                maxLength={40}
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                            />
                        </div>
                    )}
                    <div className="field">
                        <label htmlFor="auth-password">密码</label>
                        <Input
                            id="auth-password"
                            type="password"
                            autoComplete={kind === "login"
                                ? "current-password"
                                : "new-password"}
                            required
                            minLength={kind === "login" ? 1 : 12}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    {error && <p className="error" role="alert">{error}</p>}
                    <Button variant="default" type="submit" disabled={busy}>
                        {busy
                            ? "处理中…"
                            : kind === "login"
                            ? "登录"
                            : "创建账户"}
                    </Button>
                </form>
                <p className="muted auth-footer">
                    {kind === "login"
                        ? (
                            allowRegistration !== false && (
                                <>
                                    没有账户？<Link to={toggleToRegister}>
                                        注册
                                    </Link>
                                </>
                            )
                        )
                        : (
                            <>
                                已有账户？<Link to={toggleToLogin}>登录</Link>
                            </>
                        )}
                </p>
            </div>
        </PageShell>
    );
}
