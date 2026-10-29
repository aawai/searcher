import {
    createContext,
    type ReactNode,
    type RefObject,
    useContext,
    useEffect,
    useRef,
} from "react";
import {
    type NavigationIntent,
    useNavigationGuard,
} from "../../app/navigation-guards.tsx";
import {
    type AppSession,
    type AppSessionOptions,
    useAppSession,
} from "./useAppSession.ts";

export interface AppSessionNavigation {
    readonly isDirty: boolean;
    readonly isSubmitting: boolean;
    readonly hasDialog: boolean;
    dismissDialog: () => void;
}

export interface AppSessionRouteIntent {
    proceed: () => void;
    reset: () => void;
}

const SessionContext = createContext<AppSession | null>(null);

export interface AppSessionProviderProps {
    options: AppSessionOptions;
    navigationRef: RefObject<AppSessionNavigation | null>;
    onRouteBlocked: (intent: AppSessionRouteIntent | null) => void;
    onRouteCommitted?: () => void;
    isExternalDirty?: () => boolean;
    willDestroyContent?: (intent: NavigationIntent) => boolean;
    children: ReactNode;
}

export function AppSessionProvider({
    options,
    navigationRef,
    onRouteBlocked,
    onRouteCommitted,
    isExternalDirty,
    willDestroyContent,
    children,
}: AppSessionProviderProps) {
    const session = useAppSession(options);
    const blocker = useNavigationGuard({
        blocks: (intent) => {
            const destroysContent = willDestroyContent
                ? willDestroyContent(intent)
                : intent.currentLocation.pathname !==
                        intent.nextLocation.pathname ||
                    intent.currentLocation.search !==
                        intent.nextLocation.search;
            const appDirty = Boolean(options.sessionKey);
            return destroysContent &&
                (appDirty || Boolean(isExternalDirty?.()));
        },
        warnOnUnload: () =>
            (Boolean(options.sessionKey) && session.isDirty) ||
            Boolean(isExternalDirty?.()),
        onCommit: () => {
            if (options.sessionKey) onRouteCommitted?.();
        },
    });
    const reportedLocationKey = useRef<string | null>(null);
    navigationRef.current = session;
    useEffect(() => {
        if (!blocker) {
            if (reportedLocationKey.current !== null) {
                reportedLocationKey.current = null;
                onRouteBlocked(null);
            }
            return;
        }
        const appDirty = Boolean(options.sessionKey) && session.isDirty &&
            !session.isSubmitting;
        const externalDirty = Boolean(isExternalDirty?.());
        const hasUnsaved = appDirty || externalDirty;
        if (session.isSubmitting && options.sessionKey) {
            blocker.reset();
            return;
        }
        if (!hasUnsaved) {
            blocker.proceed();
            return;
        }
        if (session.hasDialog) return;

        const key = blocker.location.key;
        if (reportedLocationKey.current === key) return;
        reportedLocationKey.current = key;
        let resolved = false;
        onRouteBlocked({
            proceed: () => {
                if (resolved) return;
                resolved = true;
                blocker.proceed();
            },
            reset: () => {
                if (resolved) return;
                resolved = true;
                blocker.reset();
            },
        });
    }, [
        blocker,
        onRouteBlocked,
        session.hasDialog,
        session.isDirty,
        session.isSubmitting,
        options.sessionKey,
        isExternalDirty,
    ]);
    useEffect(() => () => {
        navigationRef.current = null;
    }, [navigationRef]);
    return <SessionContext value={session}>{children}</SessionContext>;
}

export function useAppSessionContext(): AppSession {
    const session = useContext(SessionContext);
    if (!session) throw new Error("AppForm requires AppSessionProvider");
    return session;
}
