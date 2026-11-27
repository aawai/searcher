import type { ReactNode } from "react";
import "./workspace.css";

/** View controls are rendered into the window title bar. */
export function LibraryWindowToolbar({ actions }: { actions?: ReactNode }) {
    return actions
        ? <div className="workspace-toolbar-actions">{actions}</div>
        : null;
}

/** Body of the apps and notes windows; the window frame supplies the chrome. */
export function LibraryWindowBody(
    { fullScreen = false, editor = false, children }: {
        fullScreen?: boolean;
        editor?: boolean;
        children: ReactNode;
    },
) {
    return (
        <div
            className="library-window"
            data-window-fullscreen={fullScreen || undefined}
        >
            <div
                className="workspace-body"
                data-layout={editor ? "editor" : undefined}
            >
                {children}
            </div>
        </div>
    );
}
