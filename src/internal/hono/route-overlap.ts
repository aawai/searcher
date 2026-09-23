// 保守前缀分析器
// 用于在 Routes.mount 前检测不同 access（public 与 protected）之间在相交 HTTP Method 下的路径重叠。
// 规则：
// 1. 只精确分析普通静态段、完整命名参数段（:param）、末尾可选参数（:param?）和独立通配符（*）。
// 2. 遇到含 '{'、'}'、反斜杠 '\'、嵌入通配符（如 foo*）或中间可选参数等复杂语法，
//    直接从该位置起视作任意后缀（opaque suffix），只使用之前已确定的前缀来排除冲突。
// 3. 避免完整自制 router；一旦前缀可能相交且后续存在非确定段，采取保守拒绝。

export interface RoutePrefixBranch {
    segments: Segment[];
    isOpaqueSuffix: boolean; // 是否包含复杂语法/通配符/任意后缀
}
export type Segment =
    | { kind: "static"; value: string }
    | { kind: "param"; name: string; optional?: boolean }
    | { kind: "wildcard" }
    | { kind: "complex"; raw: string };

export interface ParsedRoutePattern {
    path: string;
    segments: Segment[];
    hasComplex: boolean;
    hasWildcard: boolean;
}

export function parseRoutePattern(path: string): ParsedRoutePattern {
    let normalized = path.trim();
    if (!normalized.startsWith("/")) {
        normalized = `/${normalized}`;
    }
    if (normalized.length > 1 && normalized.endsWith("/")) {
        normalized = normalized.slice(0, -1);
    }

    if (normalized === "/") {
        return {
            path: normalized,
            segments: [],
            hasComplex: false,
            hasWildcard: false,
        };
    }

    const rawParts = normalized.split("/").slice(1);
    const segments: Segment[] = [];
    let hasComplex = false;
    let hasWildcard = false;

    for (let i = 0; i < rawParts.length; i++) {
        const part = rawParts[i];

        if (
            part.includes("{") ||
            part.includes("}") ||
            part.includes("\\") ||
            (part.includes("*") && part !== "*")
        ) {
            hasComplex = true;
            segments.push({ kind: "complex", raw: part });
            continue;
        }

        if (part === "*") {
            hasWildcard = true;
            segments.push({ kind: "wildcard" });
            continue;
        }

        if (part.startsWith(":")) {
            const isOptional = part.endsWith("?");
            const paramName = isOptional ? part.slice(1, -1) : part.slice(1);

            if (!paramName || !/^[a-zA-Z0-9_]+$/.test(paramName)) {
                hasComplex = true;
                segments.push({ kind: "complex", raw: part });
                continue;
            }

            if (isOptional && i !== rawParts.length - 1) {
                hasComplex = true;
                segments.push({ kind: "complex", raw: part });
                continue;
            }

            segments.push({
                kind: "param",
                name: paramName,
                optional: isOptional,
            });
            continue;
        }

        segments.push({ kind: "static", value: part });
    }

    return {
        path: normalized,
        segments,
        hasComplex,
        hasWildcard,
    };
}

function segmentRank(segment: Segment): number {
    switch (segment.kind) {
        case "static":
            return 0;
        case "param":
            return segment.optional ? 2 : 1;
        case "complex":
            return 3;
        case "wildcard":
            return 4;
    }
}

export function compareRouteSpecificity(
    p1: ParsedRoutePattern,
    p2: ParsedRoutePattern,
): number {
    const minLen = Math.min(p1.segments.length, p2.segments.length);
    for (let i = 0; i < minLen; i++) {
        const s1 = p1.segments[i];
        const s2 = p2.segments[i];
        const r1 = segmentRank(s1);
        const r2 = segmentRank(s2);
        if (r1 !== r2) {
            return r1 - r2;
        }
        if (s1.kind === "static" && s2.kind === "static") {
            const comp = s1.value.localeCompare(s2.value);
            if (comp !== 0) {
                return comp;
            }
        }
    }

    if (p1.segments.length !== p2.segments.length) {
        const last1 = p1.segments[p1.segments.length - 1];
        const last2 = p2.segments[p2.segments.length - 1];
        const isWildcard1 = last1?.kind === "wildcard";
        const isWildcard2 = last2?.kind === "wildcard";
        if (isWildcard1 && !isWildcard2) {
            return 1;
        }
        if (!isWildcard1 && isWildcard2) {
            return -1;
        }
        return p2.segments.length - p1.segments.length;
    }

    return p1.path.localeCompare(p2.path);
}

export function hasAmbiguousOverlap(
    p1: ParsedRoutePattern,
    p2: ParsedRoutePattern,
): boolean {
    if (p1.path === p2.path) {
        return false;
    }

    if (p1.hasComplex || p2.hasComplex) {
        return routesOverlap(p1.path, p2.path);
    }

    const minLen = Math.min(p1.segments.length, p2.segments.length);
    let hasStaticDivergence = false;
    let hasParam1Static2 = false;
    let hasStatic1Param2 = false;
    let hasParamNameMismatch = false;

    for (let i = 0; i < minLen; i++) {
        const s1 = p1.segments[i];
        const s2 = p2.segments[i];

        if (s1.kind === "static" && s2.kind === "static") {
            if (s1.value !== s2.value) {
                hasStaticDivergence = true;
                break;
            }
            continue;
        }

        if (s1.kind === "wildcard" || s2.kind === "wildcard") {
            break;
        }

        if (s1.kind === "param" && s2.kind === "static") {
            hasParam1Static2 = true;
        } else if (s1.kind === "static" && s2.kind === "param") {
            hasStatic1Param2 = true;
        } else if (s1.kind === "param" && s2.kind === "param") {
            if (s1.name !== s2.name) {
                hasParamNameMismatch = true;
            }
        }
    }

    if (hasStaticDivergence) {
        return false;
    }

    if (hasParam1Static2 && hasStatic1Param2) {
        return true;
    }

    if (p1.segments.length === p2.segments.length && hasParamNameMismatch) {
        let identicalExceptParamNames = true;
        for (let i = 0; i < p1.segments.length; i++) {
            const s1 = p1.segments[i];
            const s2 = p2.segments[i];
            if (s1.kind !== s2.kind) {
                identicalExceptParamNames = false;
                break;
            }
            if (s1.kind === "param" && s2.kind === "param") {
                if (Boolean(s1.optional) !== Boolean(s2.optional)) {
                    identicalExceptParamNames = false;
                    break;
                }
            }
        }
        if (identicalExceptParamNames) {
            return true;
        }
    }

    return false;
}

/**
 * 将路由路径切分为确定性前缀分支。
 * 普通静态: /users -> [{kind: "static", value: "users"}]
 * 命名参数: /:id -> [{kind: "param"}]
 * 独立通配符: /* -> isOpaqueSuffix = true
 * 末尾可选参数: /items/:cat? -> 两条分支: /items (静态) 和 /items/:cat (带参数)
 * 复杂语法: 含 '{', '}', '\', 嵌入 '*' (如 foo* 或 :id{[0-9]+}) -> 到该处截止，标记 isOpaqueSuffix = true
 */
export function extractPrefixBranches(path: string): RoutePrefixBranch[] {
    const { segments } = parseRoutePattern(path);
    const prefix: Segment[] = [];

    for (const segment of segments) {
        if (segment.kind === "complex" || segment.kind === "wildcard") {
            return [{ segments: prefix, isOpaqueSuffix: true }];
        }
        if (segment.kind === "param" && segment.optional) {
            return [
                { segments: prefix, isOpaqueSuffix: false },
                { segments: [...prefix, segment], isOpaqueSuffix: false },
            ];
        }
        prefix.push(
            segment.kind === "param"
                ? { kind: "param", name: segment.name }
                : segment,
        );
    }

    return [{ segments: prefix, isOpaqueSuffix: false }];
}

/**
 * 两个段在位置对应时是否可能匹配同一个 path 节点。
 */
function segmentsCompatible(s1: Segment, s2: Segment): boolean {
    if (s1.kind === "static" && s2.kind === "static") {
        return s1.value === s2.value;
    }
    return true;
}

/**
 * 比较两条分支是否可能重叠。
 */
function branchesMightOverlap(
    b1: RoutePrefixBranch,
    b2: RoutePrefixBranch,
): boolean {
    const minLen = Math.min(b1.segments.length, b2.segments.length);

    // 比较公共前缀段
    for (let i = 0; i < minLen; i++) {
        if (!segmentsCompatible(b1.segments[i], b2.segments[i])) {
            // 静态前缀不匹配，绝对不冲突
            return false;
        }
    }

    // 若公共前缀完全一致：
    if (b1.segments.length === b2.segments.length) {
        // 长度相同，如果都没有后续不确定段，则重叠；如果任一有任意后缀，也重叠
        return true;
    }

    // 长度不同：较短的一方如果有 isOpaqueSuffix（例如包含 *、复杂正则或跨段正则），则它可以匹配较长的一方，属于重叠
    if (b1.segments.length < b2.segments.length) {
        return b1.isOpaqueSuffix;
    } else {
        return b2.isOpaqueSuffix;
    }
}

/**
 * 检查两条路由路径是否存在重叠匹配可能。
 */
export function routesOverlap(path1: string, path2: string): boolean {
    const branches1 = extractPrefixBranches(path1);
    const branches2 = extractPrefixBranches(path2);

    for (const b1 of branches1) {
        for (const b2 of branches2) {
            if (branchesMightOverlap(b1, b2)) {
                return true;
            }
        }
    }
    return false;
}

/**
 * 检查两个 HTTP Method 是否相交。
 * "ALL" 与任意方法相交；相同的方法相互相交。
 */
export function methodsIntersect(m1: string, m2: string): boolean {
    return m1 === "ALL" || m2 === "ALL" || m1 === m2;
}
