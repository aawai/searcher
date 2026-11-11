import { PageShell } from "../components/searcher/PageShell.tsx";
import { PageHeader } from "../components/searcher/PageHeader.tsx";
import {
    SettingsGroup,
    SettingsRow,
    StatusBanner,
} from "../components/searcher/semantic.tsx";
import {
    type SubmitEvent,
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
import "./narrow-form.css";
import "./auth.css";

type AuthKind = "login" | "register";
type RegistrationAvailability = "checking" | "open" | "closed" | "unknown";
const usernameRules = AUTH_CREDENTIAL_RULES.username;
const passwordRules = AUTH_CREDENTIAL_RULES.password;
const usernamePattern = new RegExp(AUTH_USERNAME_PATTERN);
const pageTitles: Record<AuthKind, string> = {
    login: "登录",
    register: "创建账户",
};

export function AuthPage({ kind }: { kind: AuthKind }) {
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
    // A submit attempt belongs to the page it happened on, so switching
    // between login and register starts without required-field errors.
    const [attemptedKind, setAttemptedKind] = useState<AuthKind | null>(
        null,
    );
    const usernameRef = useRef<HTMLInputElement>(null);
    const displayNameRef = useRef<HTMLInputElement>(null);
    const passwordRef = useRef<HTMLInputElement>(null);
    const [registrationState, setRegistrationState] = useState<{
        kind: AuthKind;
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
            navigate(authDestination(location.search), {
                replace: true,
                viewTransition: true,
            });
        }
    }, [ready, user, location.search, navigate]);

    useEffect(() => {
        const previousTitle = document.title;
        document.title = `${pageTitles[kind]} · Searcher`;
        return () => {
            document.title = previousTitle;
        };
    }, [kind]);

    const submitAttempted = attemptedKind === kind;
    const usernameMalformed = !usernamePattern.test(
        username.trim().toLowerCase(),
    );
    const passwordOutOfRange = password.length < passwordRules.minLength ||
        password.length > passwordRules.maxLength;
    const usernameMissing = submitAttempted && username.trim() === "";
    const displayNameMissing = kind === "register" && submitAttempted &&
        displayName.trim() === "";
    const passwordMissing = submitAttempted && password === "";
    const usernameInvalid = kind === "register"
        ? usernameTouched && usernameMalformed
        : usernameMissing;
    const passwordInvalid = kind === "register"
        ? passwordTouched && passwordOutOfRange
        : passwordMissing;

    let registrationStatusMessage: string | null = null;
    if (registrationAvailability === "checking") {
        registrationStatusMessage = "正在检查注册状态…";
    } else if (registrationAvailability === "closed") {
        registrationStatusMessage = "当前未开放注册，无法创建账户。";
    } else if (registrationAvailability === "unknown") {
        registrationStatusMessage =
            "暂时无法确认注册状态，重试检查前不会提交注册请求。";
    }

    function firstInvalidField(): HTMLInputElement | null {
        if (kind === "login") {
            if (username.trim() === "") return usernameRef.current;
            if (password === "") return passwordRef.current;
            return null;
        }
        if (usernameMalformed) return usernameRef.current;
        if (displayName.trim() === "") return displayNameRef.current;
        if (passwordOutOfRange) return passwordRef.current;
        return null;
    }

    async function submit(event: SubmitEvent<HTMLFormElement>) {
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
        setAttemptedKind(kind);
        setUsernameTouched(true);
        setPasswordTouched(true);
        const invalidField = firstInvalidField();
        if (invalidField) {
            setError("");
            invalidField.focus();
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
            // The `ready && user` effect then leaves for the destination, once.
            login(result.user);
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

    const offerRegistration = registrationAvailability === "open";
    const usernameRule =
        `用户名需为 ${usernameRules.minLength}–${usernameRules.maxLength} 个字符，只能使用英文字母、数字或下划线。`;
    const passwordRule =
        `密码长度须为 ${passwordRules.minLength}–${passwordRules.maxLength} 个字符。`;
    let usernameMessage: React.ReactNode;
    let passwordMessage: React.ReactNode;
    if (kind === "register") {
        usernameMessage = usernameInvalid
            ? <span role="alert">{usernameRule}</span>
            : usernameRule;
        passwordMessage = passwordInvalid
            ? <span role="alert">{passwordRule}</span>
            : passwordRule;
    } else {
        usernameMessage = usernameMissing
            ? <span role="alert">请输入用户名</span>
            : undefined;
        passwordMessage = passwordMissing
            ? <span role="alert">请输入密码</span>
            : undefined;
    }

    return (
        <PageShell archetype="utility">
            <div className="narrow-form">
                <PageHeader title={pageTitles[kind]} />
                <div className="auth-body">
                    {kind === "register" &&
                        registrationAvailability !== "open" && (
                        <div className="auth-registration">
                            <StatusBanner
                                tone={registrationAvailability === "unknown"
                                    ? "warning"
                                    : "info"}
                            >
                                {registrationStatusMessage}
                            </StatusBanner>
                            {registrationAvailability !== "checking" && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="auth-retry"
                                    disabled={busy}
                                    onClick={() =>
                                        void refreshRegistrationAvailability()}
                                >
                                    重新检查
                                </Button>
                            )}
                        </div>
                    )}
                    <form className="auth-fields" noValidate onSubmit={submit}>
                        <SettingsGroup>
                            <SettingsRow
                                className="settings-row--vertical"
                                title="用户名"
                                labelFor="auth-username"
                                message={usernameMessage}
                                messageId="auth-username-hint"
                                invalid={usernameInvalid}
                            >
                                <Input
                                    ref={usernameRef}
                                    id="auth-username"
                                    placeholder="例如：alice"
                                    autoComplete="username"
                                    // Only where focusing cannot raise an
                                    // on-screen keyboard over the form.
                                    autoFocus={matchMedia("(pointer: fine)")
                                        .matches}
                                    required
                                    minLength={usernameRules.minLength}
                                    maxLength={usernameRules.maxLength}
                                    pattern={kind === "register"
                                        ? AUTH_USERNAME_PATTERN
                                        : undefined}
                                    aria-describedby={usernameMessage
                                        ? "auth-username-hint"
                                        : undefined}
                                    aria-invalid={usernameInvalid || undefined}
                                    value={username}
                                    onChange={(e) =>
                                        setUsername(e.target.value)}
                                    onBlur={() => setUsernameTouched(true)}
                                />
                            </SettingsRow>
                            {kind === "register" && (
                                <SettingsRow
                                    className="settings-row--vertical"
                                    title="显示名称"
                                    labelFor="auth-display-name"
                                    message={displayNameMissing
                                        ? (
                                            <span role="alert">
                                                请输入显示名称
                                            </span>
                                        )
                                        : undefined}
                                    messageId="auth-display-name-hint"
                                    invalid={displayNameMissing}
                                >
                                    <Input
                                        ref={displayNameRef}
                                        id="auth-display-name"
                                        placeholder="例如：爱丽丝"
                                        required
                                        maxLength={40}
                                        aria-describedby={displayNameMissing
                                            ? "auth-display-name-hint"
                                            : undefined}
                                        aria-invalid={displayNameMissing ||
                                            undefined}
                                        value={displayName}
                                        onChange={(e) =>
                                            setDisplayName(e.target.value)}
                                    />
                                </SettingsRow>
                            )}
                            <SettingsRow
                                className="settings-row--vertical"
                                title="密码"
                                labelFor="auth-password"
                                message={passwordMessage}
                                messageId="auth-password-hint"
                                invalid={passwordInvalid}
                            >
                                <Input
                                    ref={passwordRef}
                                    id="auth-password"
                                    placeholder={kind === "register"
                                        ? `至少 ${passwordRules.minLength} 个字符`
                                        : "区分大小写"}
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
                                    aria-describedby={passwordMessage
                                        ? "auth-password-hint"
                                        : undefined}
                                    aria-invalid={passwordInvalid || undefined}
                                    value={password}
                                    onChange={(e) =>
                                        setPassword(e.target.value)}
                                    onBlur={() => setPasswordTouched(true)}
                                />
                            </SettingsRow>
                        </SettingsGroup>
                        {error && (
                            <StatusBanner tone="error">{error}</StatusBanner>
                        )}
                        <Button
                            variant="default"
                            type="submit"
                            className="auth-submit"
                            disabled={busy ||
                                (kind === "register" &&
                                    registrationAvailability !== "open")}
                        >
                            {busy ? "处理中…" : pageTitles[kind]}
                        </Button>
                    </form>
                    {kind === "register"
                        ? (
                            <p className="auth-footer">
                                已有账户？<Link
                                    to={toggleToLogin}
                                    viewTransition
                                >
                                    登录
                                </Link>
                            </p>
                        )
                        : offerRegistration && (
                            <p className="auth-footer">
                                没有账户？<Link
                                    to={toggleToRegister}
                                    viewTransition
                                >
                                    注册
                                </Link>
                            </p>
                        )}
                </div>
            </div>
        </PageShell>
    );
}
