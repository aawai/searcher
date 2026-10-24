import type { DocumentDto } from "../../shared/documents.ts";

export class DocumentNotFoundError extends Error {
    constructor(message = "笔记不存在") {
        super(message);
        this.name = "DocumentNotFoundError";
    }
}
export class DocumentValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "DocumentValidationError";
    }
}
export class DocumentConflictError extends Error {
    constructor(public readonly currentDocument: DocumentDto) {
        super("笔记版本冲突");
        this.name = "DocumentConflictError";
    }
}
export class DocumentLayoutConflictError extends Error {
    constructor() {
        super("该单元已有其他首页笔记");
        this.name = "DocumentLayoutConflictError";
    }
}
