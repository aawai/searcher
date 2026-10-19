export type RuleId =
    | "raw-box-shadow"
    | "raw-z-index"
    | "raw-font-size"
    | "raw-border-radius"
    | "raw-spacing-literal"
    | "inline-visual-style"
    | "arbitrary-tailwind";

export interface UiViolation {
    file: string;
    rule: RuleId;
    property: string;
    value: string;
    line: number;
    column: number;
    fingerprint: string;
}

export interface BaselineEntry {
    rule: RuleId;
    property: string;
    snippet: string;
    fingerprint: string;
    count: number;
}

export interface BaselineFile {
    version: 1;
    generatedAt: string;
    totalViolations: number;
    allowances: Record<string, BaselineEntry[]>;
}

export interface CheckSummary {
    passed: boolean;
    totalScannedFiles: number;
    totalViolations: number;
    matchedAllowances: number;
    newViolations: UiViolation[];
    increasedViolations: {
        file: string;
        entry: BaselineEntry;
        actualCount: number;
        excess: number;
    }[];
    staleAllowances: {
        file: string;
        entry: BaselineEntry;
        actualCount: number;
        deficit: number;
    }[];
}
