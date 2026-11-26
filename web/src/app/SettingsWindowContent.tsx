import { AccountPanel, useAccountHeaderActions } from "./AccountPage.tsx";
import { NotFoundContent } from "./NotFoundPage.tsx";
import type { PageHost } from "./page-host.tsx";
import { routes, settingsTab } from "./routes.ts";
import { SettingsPanel } from "./SettingsPage.tsx";
import { type SettingsSection, SettingsShell } from "./SettingsShell.tsx";

/**
 * The settings window hosts the preference tabs and the account section inside
 * one mounted SettingsShell so switching between 「账户与安全」 and other tabs
 * never unmounts the sidebar or loses focus.
 */
export function SettingsWindowContent({ host }: { host: PageHost }) {
    const accountActions = useAccountHeaderActions(host);
    const isAccount = host.location.pathname === routes.account;
    const current: SettingsSection | null = isAccount
        ? "account"
        : settingsTab(host.location.pathname);

    if (!current) {
        return (
            <NotFoundContent
                parent={{ label: "设置", to: routes.settings() }}
                location={host.location}
                Link={host.Link}
            />
        );
    }

    return (
        <SettingsShell
            current={current}
            actions={current === "account" ? accountActions : undefined}
            host={host}
        >
            {current === "account"
                ? <AccountPanel host={host} />
                : <SettingsPanel host={host} tab={current} />}
        </SettingsShell>
    );
}
