import { cyan, yellow } from "@std/fmt/colors";
import { fromFileUrl, toFileUrl } from "@std/path";
import { getFilesByWalk } from "../tool/read-dir.ts";
import { Hono } from "hono";
import type { Env, MiddlewareHandler } from "hono";
import { isValidator } from "@internal/validator/hono.ts";
import type { AsyncValidatorFn } from "@internal/validator/hono.ts";
import { createRequestIntake } from "./request-intake.ts";
import type { Handler, HandlerData } from "./request-intake.ts";
import {
    compareRouteSpecificity,
    hasAmbiguousOverlap,
    methodsIntersect,
    parseRoutePattern,
    routesOverlap,
} from "./route-overlap.ts";
import type { ParsedRoutePattern } from "./route-overlap.ts";
import type {
    Access,
    DefaultVariables,
    Method,
    Route,
    RouteRegistration,
    RouterHandler,
} from "./type.ts";

function wrapHandlers<E extends Env = DefaultVariables>(
    handlers: readonly unknown[],
): RouterHandler<E>[] {
    if (handlers.length === 0) {
        return [];
    }

    if (handlers.length === 1) {
        const only = handlers[0] as RouterHandler<E>;
        return [only];
    }

    const secondLast = handlers[handlers.length - 2];
    const last = handlers[handlers.length - 1];

    if (isValidator(secondLast)) {
        const middlewares = handlers.slice(0, -2) as RouterHandler<E>[];
        const terminal = createRequestIntake(
            secondLast,
            last as HandlerData<unknown, E>,
        ) as RouterHandler<E>;
        return [...middlewares, terminal];
    }

    return handlers as RouterHandler<E>[];
}

type MiddlewareHandlerList<E extends Env = DefaultVariables> = [
    ...MiddlewareHandler<E>[],
    Handler<E>,
];

type MiddlewareValidatorHandlerList<
    T,
    E extends Env = DefaultVariables,
> = [
    ...MiddlewareHandler<E>[],
    AsyncValidatorFn<T>,
    HandlerData<T, E>,
];

export class RouteRegistrar<E extends Env = DefaultVariables> {
    constructor(
        private readonly registrations: RouteRegistration<E>[],
        private readonly access: Access,
        private readonly isSealed: () => boolean,
    ) {}

    all(path: Route, handler: Handler<E>): this;
    all<T>(
        path: Route,
        validator: AsyncValidatorFn<T>,
        handler: HandlerData<T, E>,
    ): this;
    all<T>(
        path: Route,
        ...handlers: MiddlewareValidatorHandlerList<T, E>
    ): this;
    all(
        path: Route,
        ...handlers: MiddlewareHandlerList<E>
    ): this;
    all(path: Route, ...handlers: unknown[]): this {
        this.#add("ALL", path, handlers);
        return this;
    }

    get(path: Route, handler: Handler<E>): this;
    get<T>(
        path: Route,
        validator: AsyncValidatorFn<T>,
        handler: HandlerData<T, E>,
    ): this;
    get<T>(
        path: Route,
        ...handlers: MiddlewareValidatorHandlerList<T, E>
    ): this;
    get(
        path: Route,
        ...handlers: MiddlewareHandlerList<E>
    ): this;
    get(path: Route, ...handlers: unknown[]): this {
        this.#add("GET", path, handlers);
        return this;
    }

    post(path: Route, handler: Handler<E>): this;
    post<T>(
        path: Route,
        validator: AsyncValidatorFn<T>,
        handler: HandlerData<T, E>,
    ): this;
    post<T>(
        path: Route,
        ...handlers: MiddlewareValidatorHandlerList<T, E>
    ): this;
    post(
        path: Route,
        ...handlers: MiddlewareHandlerList<E>
    ): this;
    post(path: Route, ...handlers: unknown[]): this {
        this.#add("POST", path, handlers);
        return this;
    }

    put(path: Route, handler: Handler<E>): this;
    put<T>(
        path: Route,
        validator: AsyncValidatorFn<T>,
        handler: HandlerData<T, E>,
    ): this;
    put<T>(
        path: Route,
        ...handlers: MiddlewareValidatorHandlerList<T, E>
    ): this;
    put(
        path: Route,
        ...handlers: MiddlewareHandlerList<E>
    ): this;
    put(path: Route, ...handlers: unknown[]): this {
        this.#add("PUT", path, handlers);
        return this;
    }

    delete(path: Route, handler: Handler<E>): this;
    delete<T>(
        path: Route,
        validator: AsyncValidatorFn<T>,
        handler: HandlerData<T, E>,
    ): this;
    delete<T>(
        path: Route,
        ...handlers: MiddlewareValidatorHandlerList<T, E>
    ): this;
    delete(
        path: Route,
        ...handlers: MiddlewareHandlerList<E>
    ): this;
    delete(path: Route, ...handlers: unknown[]): this {
        this.#add("DELETE", path, handlers);
        return this;
    }

    patch(path: Route, handler: Handler<E>): this;
    patch<T>(
        path: Route,
        validator: AsyncValidatorFn<T>,
        handler: HandlerData<T, E>,
    ): this;
    patch<T>(
        path: Route,
        ...handlers: MiddlewareValidatorHandlerList<T, E>
    ): this;
    patch(
        path: Route,
        ...handlers: MiddlewareHandlerList<E>
    ): this;
    patch(path: Route, ...handlers: unknown[]): this {
        this.#add("PATCH", path, handlers);
        return this;
    }

    #add(method: Method, path: Route, handlers: readonly unknown[]): void {
        if (this.isSealed()) {
            throw new Error("Routes already mounted");
        }

        this.registrations.push({
            method,
            path,
            handlers: wrapHandlers<E>(handlers),
            access: this.access,
        });
    }
}

interface RouteState<E extends Env = DefaultVariables> {
    registrations: RouteRegistration<E>[];
    isMounted: boolean;
}

export class Routes<E extends Env = DefaultVariables>
    extends RouteRegistrar<E> {
    #state: RouteState<E>;
    readonly public: RouteRegistrar<E>;

    constructor() {
        const state: RouteState<E> = {
            registrations: [],
            isMounted: false,
        };

        super(
            state.registrations,
            "protected",
            () => state.isMounted,
        );

        this.#state = state;
        this.public = new RouteRegistrar(
            state.registrations,
            "public",
            () => state.isMounted,
        );
    }

    async discover(
        dir: string,
        ext: `.${string}.${"ts" | "js"}` = ".route.ts",
    ): Promise<void> {
        const directory = dir.startsWith("file://") ? fromFileUrl(dir) : dir;
        const entries = await getFilesByWalk(directory, ext);

        for (const { path, name } of entries) {
            // 路由文件由目录扫描在运行时决定，静态 import 无法替代。
            await import(toFileUrl(path).href);
            console.log(
                `${cyan("Routing initialization successful:")} ${yellow(name)}`,
            );
        }
    }

    mount(app: Hono<E>, authMiddleware?: MiddlewareHandler<E>[]): void {
        if (this.#state.isMounted) {
            throw new Error("Routes already mounted");
        }

        const hasProtected = this.#state.registrations.some(
            (registration) => registration.access === "protected",
        );
        if (hasProtected && !authMiddleware?.length) {
            throw new Error("protected route requires authMiddleware");
        }

        const parsedPatterns = new Map<string, ParsedRoutePattern>();
        const getPattern = (path: string): ParsedRoutePattern => {
            let pattern = parsedPatterns.get(path);
            if (!pattern) {
                pattern = parseRoutePattern(path);
                parsedPatterns.set(path, pattern);
            }
            return pattern;
        };

        const registrations = [...this.#state.registrations].sort(
            (left, right) => {
                const patternLeft = getPattern(left.path);
                const patternRight = getPattern(right.path);
                const specificity = compareRouteSpecificity(
                    patternLeft,
                    patternRight,
                );
                if (specificity !== 0) {
                    return specificity;
                }
                return left.method.localeCompare(right.method);
            },
        );

        // 1. 同字面重复检查
        const registeredRoutes = new Set<string>();
        const allRoutes = new Set<string>();
        const specificRoutesByPath = new Map<string, string[]>();
        for (const registration of registrations) {
            const routeKey = `${registration.method}:${registration.path}`;
            if (registeredRoutes.has(routeKey)) {
                throw new Error(
                    `Duplicate route: ${registration.method} ${registration.path}`,
                );
            }
            registeredRoutes.add(routeKey);

            if (registration.method === "ALL") {
                allRoutes.add(registration.path);
            } else {
                const specificMethods =
                    specificRoutesByPath.get(registration.path) ?? [];
                specificMethods.push(registration.method);
                specificRoutesByPath.set(registration.path, specificMethods);
            }
        }

        // 2. 同 path 下 ALL 与具体 Method 冲突检查
        for (const path of allRoutes) {
            const specificMethods = specificRoutesByPath.get(path);
            if (specificMethods?.length) {
                throw new Error(
                    `Conflicting route: ALL and ${
                        specificMethods[0]
                    } on ${path}`,
                );
            }
        }
        // 3. 歧义重叠检查与跨 access 路径重叠检查
        // 3.1 同 access 歧义重叠检查 (如复杂的互相包含或无法可靠定序的重叠)
        for (let i = 0; i < registrations.length; i++) {
            const r1 = registrations[i];
            const p1 = getPattern(r1.path);
            for (let j = i + 1; j < registrations.length; j++) {
                const r2 = registrations[j];
                if (r1.access !== r2.access) {
                    continue;
                }
                if (!methodsIntersect(r1.method, r2.method)) {
                    continue;
                }
                const p2 = getPattern(r2.path);
                if (hasAmbiguousOverlap(p1, p2)) {
                    throw new Error(
                        `Ambiguous route overlap: ${r1.access} ${r1.method} ${r1.path} and ${r2.method} ${r2.path}`,
                    );
                }
            }
        }

        // 3.2 跨 access 路径重叠检查 (public 与 protected)
        // 必须在任何 app.on 之前完成，确保 mount 失败时保持原子性（零挂载）
        const publicRoutes = registrations.filter((r) => r.access === "public");
        const protectedRoutes = registrations.filter((r) =>
            r.access === "protected"
        );

        for (const pub of publicRoutes) {
            for (const prot of protectedRoutes) {
                if (
                    methodsIntersect(pub.method, prot.method) &&
                    routesOverlap(pub.path, prot.path)
                ) {
                    throw new Error(
                        `Overlapping cross-access route conflict: public ${pub.method} ${pub.path} and protected ${prot.method} ${prot.path}`,
                    );
                }
            }
        }

        // 4. 原子挂载
        for (const registration of registrations) {
            const handlers =
                registration.access === "protected" && authMiddleware?.length
                    ? [...authMiddleware, ...registration.handlers]
                    : registration.handlers;
            app.on(registration.method, [registration.path], ...handlers);
        }

        this.#state.isMounted = true;
    }
}
