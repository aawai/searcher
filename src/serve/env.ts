import type { UserDto } from "@shared/contracts.ts";
import type { DatabaseStore } from "../db/database.ts";
import type { AuthService } from "../features/auth/service.ts";
import type { WallpaperService } from "../features/wallpaper/service.ts";
import type { WebAppIconService } from "../features/webapp-icons/service.ts";
import type { SystemSettingsStore } from "../features/system/settings-store.ts";
export type AppVariables = {
    user: UserDto;
    sessionToken?: string;
};

export type AppEnv = {
    Bindings: Record<string, unknown>;
    Variables: AppVariables;
};

export interface AppDeps {
    store: DatabaseStore;
    auth: AuthService;
    origin: string;
    wallpaper?: WallpaperService;
    icons?: WebAppIconService;
    settings?: SystemSettingsStore;
    now?: () => number;
}
