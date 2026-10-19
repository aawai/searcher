import { PageShell } from "../components/searcher/PageShell.tsx";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import {
    type FormEvent,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
    AUTH_CREDENTIAL_RULES,
    AUTH_USERNAME_PATTERN,
    type UserDto,
} from "@shared/contracts.ts";
import { Button } from "../components/ui/button.tsx";
import { Input } from "../components/ui/input.tsx";
import { api, json } from "../lib/api.ts";
import { errorMessage, useAppState } from "./state.tsx";
import { authDestination, routes } from "./routes.ts";
import "./auth.css";

type RegistrationAvailability = "checking" | "open" | "closed" | "unknown";
const usernameRules = AUTH_CREDENTIAL_RULES.username;
const passwordRules = AUTH_CREDENTIAL_RULES.password;
const usernamePattern = new RegExp(AUTH_USERNAME_PATTERN);

export function AuthPage({ kind }: { kind: "login" | "register" }) {
    const navigate = useNavigate();
    const location = useLocation();
    const { login, user, ready } = useAppState();
    const [username, setUsername] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [usernameTouched, setUsernameTouched] = useState(false);
    const [passwordTouched, setPasswordTouched] = useState(false);
    const [registrationState, setRegistrationState] = useState<{
        kind: "login" | "register";
        availability: RegistrationAvailability;
    }>({ kind, availability: "checking" });
    const availabilityRequestId = useRef(0);
    const registrationAvailability = registrationState.kind === kind
        ? registrationState.availability
        : "checking";

    const refreshRegistrationAvailability = useCallback(async () => {
        const requestId = ++availabilityRequestId.current;
        setError("");
        setRegistrationState({ kind, availability: "checking" });
        try {
            const result = await api<{ allowRegistration: boolean }>(
                "/api/auth/register",
            );
            if (requestId !== availabilityRequestId.current) return;
            if (typeof result.allowRegistration !== "boolean") {
                setRegistrationState({ kind, availability: "unknown" });
                return;
            }
            setRegistrationState({
                kind,
                availability: result.allowRegistration ? "open" : "closed",
            });
        } catch {
            if (requestId === availabilityRequestId.current) {
                setRegistrationState({ kind, availability: "unknown" });
            }
        }
    }, [kind]);
    useEffect(() => {
        void refreshRegistrationAvailability();
        return () => {
            availabilityRequestId.current++;
        };
    }, [refreshRegistrationAvailability]);

    useEffect(() => {
        if (ready && user) {
            navigate(authDestination(location.search), { replace: true });
        }
    }, [ready, user, location.search, navigate]);

    const usernameInvalid = kind === "register" && usernameTouched &&
        !usernamePattern.test(username.trim().toLowerCase());
    const passwordInvalid = kind === "register" && passwordTouched &&
        (
            password.length < passwordRules.minLength ||
            password.length > passwordRules.maxLength
        );

    let registrationStatusMessage: string | null = null;
    if (registrationAvailability === "checking") {
        registrationStatusMessage = kind === "register"
            ? "正在检查注册状态…"
            : "正在检查注册是否开放…";
    } else if (registrationAvailability === "closed") {
        registrationStatusMessage = kind === "register"
            ? "当前未开放注册，无法创建账户。"
            : "当前未开放注册。";
    } else if (registrationAvailability === "unknown") {
        registrationStatusMessage = kind === "register"
            ? "暂时无法确认注册状态，重试检查前不会提交注册请求。"
            : "暂时无法确认注册是否开放。";
    }

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (kind === "register" && registrationAvailability !== "open") {
            let message = "正在检查注册状态，请稍后再提交。";
            if (registrationAvailability === "closed") {
                message = "当前未开放注册，无法提交注册申请。";
            } else if (registrationAvailability === "unknown") {
                message = "暂时无法确认注册状态，请重新检查后再提交。";
            }
            setError(message);
            return;
        }
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
                {registrationAvailability !== "open" && (
                    <div className="auth-registration-status">
                        <p
                            className={registrationAvailability === "unknown"
                                ? "error"
                                : "muted"}
                            role="status"
                            aria-live="polite"
                        >
                            {registrationStatusMessage}
                        </p>
                        {registrationAvailability !== "checking" && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                    void refreshRegistrationAvailability()}
                            >
                                重新检查注册状态
                            </Button>
                        )}
                    </div>
                )}
                <form onSubmit={submit}>
                    <div className="field">
                        <label htmlFor="auth-username">用户名</label>
                        <Input
                            id="auth-username"
                            autoComplete="username"
                            required
                            minLength={usernameRules.minLength}
                            maxLength={usernameRules.maxLength}
                            pattern={kind === "register"
                                ? AUTH_USERNAME_PATTERN
                                : undefined}
                            aria-describedby={kind === "register"
                                ? "auth-username-hint"
                                : undefined}
                            aria-invalid={usernameInvalid || undefined}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            onInvalid={() => setUsernameTouched(true)}
                            onBlur={() => setUsernameTouched(true)}
                        />
                        {kind === "register" && (
                            <p
                                id="auth-username-hint"
                                className={`muted auth-field-hint${
                                    usernameInvalid
                                        ? " auth-field-hint--error"
                                        : ""
                                }`}
                                aria-live="polite"
                            >
                                用户名需为{" "}
                                {usernameRules.minLength}–{usernameRules
                                    .maxLength}
                                个字符，只能使用英文字母、数字或下划线。
                            </p>
                        )}
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
                            minLength={kind === "login"
                                ? 1
                                : passwordRules.minLength}
                            maxLength={kind === "register"
                                ? passwordRules.maxLength
                                : undefined}
                            aria-describedby={kind === "register"
                                ? "auth-password-hint"
                                : undefined}
                            aria-invalid={passwordInvalid || undefined}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onInvalid={() => setPasswordTouched(true)}
                            onBlur={() => setPasswordTouched(true)}
                        />
                        {kind === "register" && (
                            <p
                                id="auth-password-hint"
                                className={`muted auth-field-hint${
                                    passwordInvalid
                                        ? " auth-field-hint--error"
                                        : ""
                                }`}
                                aria-live="polite"
                            >
                                密码长度须为{" "}
                                {passwordRules.minLength}–{passwordRules
                                    .maxLength}
                                个字符。
                            </p>
                        )}
                    </div>
                    {error && <p className="error" role="alert">{error}</p>}
                    <Button
                        variant="default"
                        type="submit"
                        disabled={busy ||
                            (kind === "register" &&
                                registrationAvailability !== "open")}
                    >
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
                            registrationAvailability === "open" && (
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
