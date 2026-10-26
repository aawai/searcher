import {
    createContext,
    type ReactNode,
    type RefObject,
    useContext,
    useEffect,
    useRef,
} from "react";
import { useBlocker } from "react-router-dom";
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
    isExternalDirty?: () => boolean;
    children: ReactNode;
}

export function AppSessionProvider({
    options,
    navigationRef,
    onRouteBlocked,
    isExternalDirty,
    children,
}: AppSessionProviderProps) {
    const session = useAppSession(options);
    const blocker = useBlocker(({ currentLocation, nextLocation }) => {
        const urlChanged = currentLocation.pathname !== nextLocation.pathname ||
            currentLocation.search !== nextLocation.search;
        const appDirty = Boolean(options.sessionKey) &&
            (session.isDirty || session.isSubmitting);
        const externalDirty = Boolean(isExternalDirty?.());
        return urlChanged && (appDirty || externalDirty);
    });
    const reportedLocationKey = useRef<string | null>(null);
    navigationRef.current = session;
    useEffect(() => {
        if (blocker.state !== "blocked") {
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
        if (!hasUnsaved) {
            if (reportedLocationKey.current !== null) {
                reportedLocationKey.current = null;
                onRouteBlocked(null);
            }
            blocker.reset();
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
    useEffect(() => {
        if (typeof window === "undefined") return;
        function preventUnload(event: BeforeUnloadEvent) {
            if (
                !(Boolean(options.sessionKey) && session.isDirty) &&
                !isExternalDirty?.()
            ) return;
            event.preventDefault();
            event.returnValue = "";
        }
        globalThis.addEventListener("beforeunload", preventUnload);
        return () =>
            globalThis.removeEventListener("beforeunload", preventUnload);
    }, [session.isDirty, options.sessionKey, isExternalDirty]);
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
