import type { Context } from "hono";
import type { Env } from "hono/types";
import { STATUS_CODE } from "@std/http";
import { logger } from "@logger";
import type { DefaultVariables } from "./type.ts";
import { failResponse } from "./middleware/response.ts";
import type {
    AsyncValidatorFn as ValidatorFn,
} from "@internal/validator/hono.ts";

export type AsyncValidatorFn<ExpectedDataType> = ValidatorFn<ExpectedDataType>;
export type Handler<E extends Env = DefaultVariables> = (
    c: Context<E>,
) => Response | Promise<Response>;

export type HandlerData<T, E extends Env = DefaultVariables> = (
    c: Context<E>,
    data: T,
) => Response | Promise<Response>;

export function createRequestIntake<T, E extends Env = DefaultVariables>(
    validator: AsyncValidatorFn<T>,
    callback: HandlerData<T, E>,
): Handler<E> {
    return async function (c: Context<E>): Promise<Response> {
        const params = await validator(c);

        if (!params.success) {
            logger.info({
                method: c.req.method,
                path: c.req.path,
                event: "validation-failed",
            });

            return failResponse(
                c,
                STATUS_CODE.BadRequest,
                "Validation failed",
                { issues: params.error.issues },
            );
        }

        return await callback(c, params.data);
    };
}
