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
export class DocumentHomeOrderConflictError extends Error {
    constructor(message = "首页笔记列表已变更，请刷新后重试") {
        super(message);
        this.name = "DocumentHomeOrderConflictError";
    }
}
