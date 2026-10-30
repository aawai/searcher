import type { ComponentProps } from "react";
import { LibraryAppsView } from "../library/LibraryAppsView.tsx";
import { DocumentsWorkspace } from "./DocumentsWorkspace.tsx";
import { WorkspaceActivity } from "./WorkspaceActivity.ts";

/** Content is independent of the URL and of the window that presents it.
 * The owner supplies the existing library state and document subscriptions;
 * `active` is true only while the window has focus, and gates Escape layers.
 */
export type HomeWorkspaceContentProps =
    | {
        view: "apps";
        active: boolean;
        apps: ComponentProps<typeof LibraryAppsView>;
    }
    | {
        view: "notes";
        active: boolean;
        notes: ComponentProps<typeof DocumentsWorkspace>;
    };

export function HomeWorkspaceContent(props: HomeWorkspaceContentProps) {
    if (props.view === "apps") {
        return (
            <div
                className="library-pane library-pane--apps"
                data-active={props.active ? "true" : undefined}
            >
                <WorkspaceActivity value={props.active}>
                    <LibraryAppsView {...props.apps} />
                </WorkspaceActivity>
            </div>
        );
    }
    return (
        <div
            data-library-view="notes"
            className="library-pane library-pane--notes library-notes"
            data-active={props.active ? "true" : undefined}
        >
            <WorkspaceActivity value={props.active}>
                <DocumentsWorkspace key={props.notes.userId} {...props.notes} />
            </WorkspaceActivity>
        </div>
    );
}
