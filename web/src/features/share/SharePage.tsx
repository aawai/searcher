import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAppState } from "../../app/state.tsx";
import { authPath, routes } from "../../app/routes.ts";
import { LoadingState } from "../../components/searcher/semantic.tsx";
import {
    sharedNote,
    type SharedNoteHandoff,
    stashSharedNote,
    takeSharedNote,
} from "./share-capture.ts";

/**
 * The manifest's GET share target. The shared fields leave the address bar at
 * once; a signed-in user continues to home, which records the note with the
 * quick-capture undo. A guest signs in first: the share waits in this tab's
 * sessionStorage and `/share` (without fields) picks it up afterwards.
 */
export function SharePage() {
    const { user } = useAppState();
    const location = useLocation();
    const navigate = useNavigate();
    const handled = useRef(false);
    useEffect(() => {
        if (handled.current) return;
        handled.current = true;
        const stashed = takeSharedNote();
        const note = location.search
            ? sharedNote(new URLSearchParams(location.search))
            : stashed;
        if (!note) {
            navigate(routes.home, { replace: true });
            return;
        }
        if (!user) {
            stashSharedNote(note);
            navigate(
                authPath("login", { pathname: routes.share, search: "" }),
                { replace: true },
            );
            return;
        }
        const handoff: SharedNoteHandoff = { sharedNote: note };
        navigate(routes.home, { replace: true, state: handoff });
    }, [location.search, navigate, user]);
    return <LoadingState className="page">正在记录…</LoadingState>;
}
