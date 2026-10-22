export type SettingsTab = "search" | "appearance" | "ai" | "data" | "shortcuts";
export type AdminTab = "overview" | "users" | "settings" | "audit" | "backup";

export const routes = {
    home: "/",
    ask: "/ask",
    login: "/login",
    register: "/register",
    account: "/account",
    trash: "/trash",
    designLab: "/design-lab",
    settings: (tab?: SettingsTab) => tab ? `/settings/${tab}` : "/settings",
    admin: (tab: AdminTab = "overview") =>
        tab === "overview" ? "/admin" : `/admin/${tab}`,
};

export function settingsTab(pathname: string): SettingsTab | null {
    switch (pathname) {
        case routes.settings():
        case routes.settings("search"):
            return "search";
        case routes.settings("appearance"):
            return "appearance";
        case routes.settings("ai"):
            return "ai";
        case routes.settings("data"):
            return "data";
        case routes.settings("shortcuts"):
            return "shortcuts";
        default:
            return null;
    }
}

export function adminTab(pathname: string): AdminTab | null {
    switch (pathname) {
        case routes.admin():
            return "overview";
        case routes.admin("users"):
            return "users";
        case routes.admin("settings"):
            return "settings";
        case routes.admin("audit"):
            return "audit";
        case routes.admin("backup"):
            return "backup";
        default:
            return null;
    }
}

/** Auth destinations must remain same-origin and must not loop into authentication. */
export function authDestination(search: string): string {
    const next = new URLSearchParams(search).get("next");
    if (
        !next || !next.startsWith("/") || next.startsWith("//") ||
        next.includes("\\")
    ) return routes.home;
    for (let index = 0; index < next.length; index++) {
        const code = next.charCodeAt(index);
        if (code <= 32 || code === 127) return routes.home;
    }
    const target = new URL(next, "https://searcher.invalid");
    if (
        target.origin !== "https://searcher.invalid" ||
        target.pathname.startsWith("//") ||
        target.pathname === routes.login || target.pathname === routes.register
    ) return routes.home;
    return `${target.pathname}${target.search}${target.hash}`;
}

export function authPath(
    kind: "login" | "register",
    location: { pathname: string; search: string },
): string {
    const next = authDestination(
        `?next=${encodeURIComponent(location.pathname + location.search)}`,
    );
    return `${routes[kind]}?${new URLSearchParams({ next })}`;
}
