import { STATUS_CODE, STATUS_TEXT } from "@std/http";
export { STATUS_CODE, STATUS_TEXT } from "@std/http";
// 默认导出deno标准库的状态码 与文本

type Code = keyof typeof STATUS_TEXT;

export class HttpException extends Error {
    statusCode: Code;
    constructor(message: string, statusCode: Code) {
        super(message);
        this.statusCode = statusCode;
    }
}

// 400
export class BadRequest extends HttpException {
    constructor(message: string) {
        super(message, STATUS_CODE.BadRequest);
        this.name = "BadRequest";
    }
}

// 401
export class Unauthorized extends HttpException {
    constructor() {
        super(STATUS_TEXT[STATUS_CODE.Unauthorized], STATUS_CODE.Unauthorized);
        this.name = "Unauthorized";
    }
}

// 403
export class Forbidden extends HttpException {
    constructor() {
        super(STATUS_TEXT[STATUS_CODE.Forbidden], STATUS_CODE.Forbidden);
        this.name = "Forbidden";
    }
}

// 404
export class NotFound extends HttpException {
    constructor() {
        super(STATUS_TEXT[STATUS_CODE.NotFound], STATUS_CODE.NotFound);
        this.name = "NotFound";
    }
}

// 405
export class MethodNotAllowed extends HttpException {
    constructor() {
        super(
            STATUS_TEXT[STATUS_CODE.MethodNotAllowed],
            STATUS_CODE.MethodNotAllowed,
        );
        this.name = "MethodNotAllowed";
    }
}

// 500 多服务是报其他服务错误
export class InternalServerError extends HttpException {
    constructor(message: string) {
        super(message, STATUS_CODE.InternalServerError);
        this.name = "InternalServerError";
    }
}

// 502
export class BadGatewayException extends HttpException {
    constructor() {
        super(STATUS_TEXT[STATUS_CODE.BadGateway], STATUS_CODE.BadGateway);
        this.name = "BadGateway";
    }
}

// 503
export class ServiceUnavailable extends HttpException {
    constructor() {
        super(
            STATUS_TEXT[STATUS_CODE.ServiceUnavailable],
            STATUS_CODE.ServiceUnavailable,
        );
        this.name = "ServiceUnavailable";
    }
}

// 504
export class GatewayTimeoutException extends HttpException {
    constructor() {
        super(
            STATUS_TEXT[STATUS_CODE.GatewayTimeout],
            STATUS_CODE.GatewayTimeout,
        );
        this.name = "GatewayTimeoutException";
    }
}
