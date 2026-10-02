import type { ComponentProps, ReactNode } from "react";
import { Section } from "../components/searcher/semantic.tsx";
import { Card } from "../components/ui/card.tsx";

export function SettingsSection(
    props: Omit<ComponentProps<typeof Section>, "headingLevel" | "className">,
) {
    return <Section {...props} headingLevel={3} className="settings-group" />;
}

export function SettingsActionCard(
    { title, description, children }: {
        title: string;
        description: ReactNode;
        children?: ReactNode;
    },
) {
    return (
        <Card className="settings-action-card">
            <div className="settings-action-card__content">
                <strong>{title}</strong>
                <p>{description}</p>
            </div>
            {children}
        </Card>
    );
}
