import { Fragment } from "react";
import { usePageHost } from "../../app/page-host.tsx";
import type { HomeContinueDto } from "@shared/contracts.ts";
import { routes } from "../../app/routes.ts";
import {
    calmDateTimeAttribute,
    formatCalmDate,
    formatCalmTime,
} from "./calm-clock.ts";
import { continueEntries, type ContinueEntry } from "./continue-line.ts";
import { useCalmClock } from "./useHomeCalm.ts";
import "./home-calm.css";

export interface HomeCalmProps {
    showDate: boolean;
    showTime: boolean;
    /** Signed in with 继续 on: the line keeps its height even while empty. */
    showContinue: boolean;
    candidates: HomeContinueDto | null;
    onOpenDocument: (id: string) => void;
}

/**
 * The home “静” layer above the search box: the date (and the optional time)
 * and one 继续 line. It sits on a zero-height anchor so turning any part off
 * never moves the search box.
 */
export function HomeCalm(
    { showDate, showTime, showContinue, candidates, onOpenDocument }:
        HomeCalmProps,
) {
    if (!showDate && !showTime && !showContinue) return null;
    return (
        <div className="home-calm-anchor">
            <div className="home-calm">
                {(showDate || showTime) && (
                    <CalmClock showDate={showDate} showTime={showTime} />
                )}
                {showContinue && (
                    <ContinueLine
                        entries={continueEntries(candidates)}
                        onOpenDocument={onOpenDocument}
                    />
                )}
            </div>
        </div>
    );
}

function CalmClock(
    { showDate, showTime }: { showDate: boolean; showTime: boolean },
) {
    const now = useCalmClock(showTime ? "minute" : "day");
    return (
        <p className="home-calm__clock" data-testid="home-calm-clock">
            <time dateTime={calmDateTimeAttribute(now, showTime)}>
                {showDate && <span>{formatCalmDate(now)}</span>}
                {showTime && (
                    <span className="home-calm__time">
                        {formatCalmTime(now)}
                    </span>
                )}
            </time>
        </p>
    );
}

function ContinueLine(
    { entries, onOpenDocument }: {
        entries: ContinueEntry[];
        onOpenDocument: (id: string) => void;
    },
) {
    if (entries.length === 0) {
        return <div className="home-calm__continue" aria-hidden="true" />;
    }
    return (
        <nav className="home-calm__continue" aria-label="继续">
            {entries.map((entry, index) => (
                <Fragment key={entry.kind}>
                    {index > 0 && (
                        <span
                            className="home-calm__separator"
                            aria-hidden="true"
                        >
                            ·
                        </span>
                    )}
                    <ContinueItem
                        entry={entry}
                        onOpenDocument={onOpenDocument}
                    />
                </Fragment>
            ))}
        </nav>
    );
}

function ContinueItem(
    { entry, onOpenDocument }: {
        entry: ContinueEntry;
        onOpenDocument: (id: string) => void;
    },
) {
    const { Link } = usePageHost();
    if (entry.kind === "conversation") {
        return (
            <Link
                className="home-calm__item home-calm__item--lead"
                to={routes.askConversation(entry.id)}
                viewTransition
            >
                <span className="home-calm__verb">继续对话</span>{" "}
                <span className="home-calm__title">{entry.title}</span>
            </Link>
        );
    }
    if (entry.kind === "document") {
        return (
            <button
                type="button"
                className="home-calm__item home-calm__item--lead"
                onClick={() => onOpenDocument(entry.id)}
            >
                <span className="home-calm__verb">继续编辑</span>{" "}
                <span className="home-calm__title">{entry.title}</span>
            </button>
        );
    }
    return (
        <button
            type="button"
            className="home-calm__item"
            onClick={() => onOpenDocument(entry.documentId)}
        >
            首页 {entry.open} 项待办
        </button>
    );
}
