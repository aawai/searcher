import { type ReactNode, useId } from "react";
import { ActionGroup } from "../../components/searcher/semantic.tsx";

export function WorkspaceSection({ title, count, actions, leading, children }: {
    title: string;
    count?: number;
    actions?: ReactNode;
    leading?: ReactNode;
    children: ReactNode;
}) {
    const headingId = useId();
    return (
        <section className="workspace-section" aria-labelledby={headingId}>
            <header className="workspace-section-header">
                {leading}
                <div className="workspace-section-label">
                    <h3 className="workspace-section-title" id={headingId}>
                        {title}
                    </h3>
                    {count !== undefined && (
                        <span className="workspace-section-count">{count}</span>
                    )}
                </div>
                {actions && <ActionGroup>{actions}</ActionGroup>}
            </header>
            {children}
        </section>
    );
}
