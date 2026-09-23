import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import type { ValidationTargets } from "hono/types";
import {
    type GenericSchema,
    type GenericSchemaAsync,
    type InferOutput,
    objectAsync,
    safeParseAsync,
} from "@valibot/valibot";

type ValidationSchema = GenericSchema | GenericSchemaAsync;
type ValueNormalizer = (value: unknown) => unknown;

export type ValidationTarget = keyof ValidationTargets;

export interface ValidationSource<
    Target extends ValidationTarget,
    Schema extends ValidationSchema,
> {
    target: Target;
    schema: Schema;
    normalize?: ValueNormalizer;
}

export type ValidationSources = Record<
    string,
    ValidationSource<ValidationTarget, ValidationSchema>
>;

export type InferValidationData<Sources extends ValidationSources> = {
    [Key in keyof Sources]: InferOutput<Sources[Key]["schema"]>;
};

export interface ValidationIssue {
    path: readonly PropertyKey[];
    message: string;
}

export interface ValidationFailure {
    success: false;
    error: { issues: readonly ValidationIssue[] };
}

export interface ValidationSuccess<Data> {
    success: true;
    data: Data;
}

export type ValidationResult<Data> =
    | ValidationSuccess<Data>
    | ValidationFailure;

export const VALIDATOR_BRAND: unique symbol = Symbol.for("servert.validator");

export interface AsyncValidatorFn<ExpectedDataType> {
    (c: Context): Promise<ValidationResult<ExpectedDataType>>;
    readonly [VALIDATOR_BRAND]: true;
}

export function isValidator(
    value: unknown,
): value is AsyncValidatorFn<unknown> {
    return (
        typeof value === "function" &&
        VALIDATOR_BRAND in value &&
        value[VALIDATOR_BRAND] === true
    );
}

export function query<Schema extends ValidationSchema>(
    schema: Schema,
): ValidationSource<"query", Schema> {
    return { target: "query", schema };
}

function normalizeQueryValues(value: unknown): unknown {
    if (value === undefined) {
        return [];
    }

    return Array.isArray(value) ? value : [value];
}

export function queries<Schema extends ValidationSchema>(
    schema: Schema,
): ValidationSource<"query", Schema> {
    return { target: "query", schema, normalize: normalizeQueryValues };
}

export function param<Schema extends ValidationSchema>(
    schema: Schema,
): ValidationSource<"param", Schema> {
    return { target: "param", schema };
}

export function json<Schema extends ValidationSchema>(
    schema: Schema,
): ValidationSource<"json", Schema> {
    return { target: "json", schema };
}

export function form<Schema extends ValidationSchema>(
    schema: Schema,
): ValidationSource<"form", Schema> {
    return { target: "form", schema };
}

interface ValidationGroup {
    keys: string[];
    shape: Record<string, ValidationSchema>;
    normalizers: [string, ValueNormalizer][];
}

interface ValidationPlan {
    target: ValidationTarget;
    keys: readonly string[];
    schema: GenericSchemaAsync<unknown, Record<string, unknown>>;
    normalizers: readonly (readonly [string, ValueNormalizer])[];
}

function compilePlans(sources: ValidationSources): ValidationPlan[] {
    const groups = new Map<ValidationTarget, ValidationGroup>();

    for (const [key, source] of Object.entries(sources)) {
        let group = groups.get(source.target);

        if (!group) {
            group = {
                keys: [],
                shape: {},
                normalizers: [],
            };
            groups.set(source.target, group);
        }

        group.keys.push(key);
        group.shape[key] = source.schema;

        if (source.normalize) {
            group.normalizers.push([key, source.normalize]);
        }
    }

    return Array.from(groups, ([target, group]) => ({
        target,
        keys: group.keys,
        schema: objectAsync(group.shape),
        normalizers: group.normalizers,
    }));
}

interface ValidationIssueInput {
    readonly message: string;
    readonly path?: readonly { readonly key: unknown }[];
}

function isPropertyKey(value: unknown): value is PropertyKey {
    return typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "symbol";
}

function toValidationIssue(issue: ValidationIssueInput): ValidationIssue {
    return {
        path: issue.path?.map((item) => item.key).filter(isPropertyKey) ?? [],
        message: issue.message,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeTarget(
    target: unknown,
    normalizers: ValidationPlan["normalizers"],
): unknown {
    if (normalizers.length === 0 || !isRecord(target)) {
        return target;
    }

    const normalized = { ...target };

    for (const [key, normalize] of normalizers) {
        normalized[key] = normalize(target[key]);
    }

    return normalized;
}

const jsonRegex =
    /^application\/([a-z-\.]+\+)?json(;\s*[a-zA-Z0-9\-]+\=([^;]+))*$/i;
const multipartRegex =
    /^multipart\/form-data(;\s?boundary=[a-zA-Z0-9'"()+_,\-\.\/:=?]+)?$/i;
const urlencodedRegex =
    /^application\/x-www-form-urlencoded(;\s*[a-zA-Z0-9\-]+\=([^;]+))*$/i;

function extractHeaderValue(
    value: Record<string, string>,
    keys: readonly string[],
): Record<string, string> {
    const keyMap = new Map(keys.map((key) => [key.toLowerCase(), key]));

    return Object.fromEntries(
        Object.entries(value).map(([key, headerValue]) => [
            keyMap.get(key) ?? key,
            headerValue,
        ]),
    );
}

function normalizeFormValues(
    value: Record<string, unknown>,
): Record<string, unknown> {
    return Object.fromEntries(
        Object.entries(value).map(([key, formValue]) => {
            if (
                key.endsWith("[]") ||
                !Array.isArray(formValue) ||
                formValue.length !== 1
            ) {
                return [key, formValue];
            }

            return [key, formValue[0]];
        }),
    );
}

async function extractTarget(
    c: Context,
    plan: ValidationPlan,
): Promise<unknown> {
    switch (plan.target) {
        case "query":
            return Object.fromEntries(
                Object.entries(c.req.queries()).map(([key, value]) => [
                    key,
                    value.length === 1 ? value[0] : value,
                ]),
            );
        case "param":
            return c.req.param();
        case "json": {
            const contentType = c.req.header("Content-Type");

            if (!contentType || !jsonRegex.test(contentType)) {
                return {};
            }

            try {
                return await c.req.json();
            } catch (error) {
                if (error instanceof HTTPException) {
                    throw error;
                }
                throw new HTTPException(400, {
                    message: "Malformed JSON in request body",
                });
            }
        }
        case "form": {
            const contentType = c.req.header("Content-Type");

            if (
                !contentType ||
                (!multipartRegex.test(contentType) &&
                    !urlencodedRegex.test(contentType))
            ) {
                return {};
            }

            try {
                const value = await c.req.parseBody({ all: true });
                return normalizeFormValues(value);
            } catch (error) {
                if (error instanceof HTTPException) {
                    throw error;
                }
                throw new HTTPException(400, {
                    message: "Malformed FormData request",
                });
            }
        }
        case "header":
            return extractHeaderValue(c.req.header(), plan.keys);
        case "cookie":
            return getCookie(c);
    }
}

export function validator<Sources extends ValidationSources>(
    sources: Sources,
): AsyncValidatorFn<InferValidationData<Sources>> {
    const plans = compilePlans(sources);

    const fn = async (
        c: Context,
    ): Promise<ValidationResult<InferValidationData<Sources>>> => {
        const data: Record<string, unknown> = {};

        for (const plan of plans) {
            const rawValue = await extractTarget(c, plan);
            const normalizedValue = normalizeTarget(
                rawValue,
                plan.normalizers,
            );
            const result = await safeParseAsync(plan.schema, normalizedValue);

            if (!result.success) {
                return {
                    success: false,
                    error: {
                        issues: result.issues.map(toValidationIssue),
                    },
                };
            }

            for (const key of plan.keys) {
                data[key] = result.output[key];
            }
        }

        return {
            success: true,
            // All fields passed their Valibot schemas and are gathered by source key.
            data: data as InferValidationData<Sources>,
        };
    };

    return Object.assign(fn, {
        [VALIDATOR_BRAND]: true as const,
    });
}
