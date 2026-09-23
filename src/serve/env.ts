import type { UserDto } from "@shared/contracts.ts";
import type { DatabaseStore } from "../db/database.ts";
import type { AuthService } from "../features/auth/service.ts";

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
    now?: () => number;
}
