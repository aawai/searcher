import type { BlankInput, Env, H } from "hono/types";

export type DefaultVariables = {
    Bindings?: Record<string, unknown>;
    Variables: Record<string, unknown>;
};

export type Route = `/${string}`;

export type Method = "ALL" | "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export type Access = "public" | "protected";

export type RouterHandler<E extends Env = DefaultVariables> = H<
    E,
    Route,
    BlankInput,
    Response
>;
export interface RouteRegistration<
    E extends Env = DefaultVariables,
> {
    method: Method;
    path: Route;
    handlers: RouterHandler<E>[];
    access: Access;
}
