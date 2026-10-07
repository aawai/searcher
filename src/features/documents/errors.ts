import type { DocumentDto } from "../../shared/documents.ts";

export class DocumentNotFoundError extends Error {
    constructor(message = "文档不存在") {
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
        super("文档版本冲突");
        this.name = "DocumentConflictError";
    }
}
