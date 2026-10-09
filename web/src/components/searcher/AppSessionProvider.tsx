import {
    createContext,
    type ReactNode,
    type RefObject,
    useContext,
    useEffect,
} from "react";
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

const SessionContext = createContext<AppSession | null>(null);

export function AppSessionProvider({ options, navigationRef, children }: {
    options: AppSessionOptions;
    navigationRef: RefObject<AppSessionNavigation | null>;
    children: ReactNode;
}) {
    const session = useAppSession(options);
    navigationRef.current = session;
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
