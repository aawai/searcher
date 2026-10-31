import { AccountContent } from "./AccountPage.tsx";
import type { PageHost } from "./page-host.tsx";
import { routes } from "./routes.ts";
import { SettingsContent } from "./SettingsPage.tsx";

/**
 * The settings window hosts the preference tabs and the account section. Both
 * ship in one chunk so switching sections never suspends the window and
 * replaces its navigation with a loading fallback.
 */
export function SettingsWindowContent({ host }: { host: PageHost }) {
    return host.location.pathname === routes.account
        ? <AccountContent host={host} />
        : <SettingsContent host={host} />;
}
