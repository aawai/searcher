import ts from "typescript";

export interface StaticClass {
    text: string;
    node: ts.Node;
    offset: number;
}

export interface StaticStyle {
    name: string;
    value: ts.Expression;
}

/** Same-file syntax only. Unknown nodes are recorded, never evaluated. */
export function staticExpressions(source: ts.SourceFile) {
    const host: ts.CompilerHost = {
        getSourceFile: (name) => name === source.fileName ? source : undefined,
        getDefaultLibFileName: () => "",
        writeFile: () => {},
        getCurrentDirectory: () => "",
        getDirectories: () => [],
        fileExists: (name) => name === source.fileName,
        readFile: () => undefined,
        getCanonicalFileName: (name) => name,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => "\n",
    };
    const checker = ts.createProgram([source.fileName], {
        noLib: true,
        noResolve: true,
    }, host).getTypeChecker();
    const unknown = new Set<ts.Node>();
    const active = new Set<ts.Node>();
    const limit = 64;
    const unsafe = new Set<ts.Symbol>();
    const aliases = new Map<ts.Symbol, ts.Symbol>();
    let remaining = 4096;

    function isComposer(node: ts.Expression): boolean {
        if (!ts.isIdentifier(node)) return false;
        const symbol = checker.getSymbolAtLocation(node);
        if (!symbol) return ["cn", "clsx"].includes(node.text);
        const declaration = symbol.declarations?.[0];
        if (!declaration) return false;
        const importedName = ts.isImportSpecifier(declaration)
            ? (declaration.propertyName ?? declaration.name).text
            : "default";
        let parent: ts.Node | undefined = declaration;
        while (parent && !ts.isImportDeclaration(parent)) {
            parent = parent.parent;
        }
        if (!parent || !ts.isStringLiteral(parent.moduleSpecifier)) {
            return false;
        }
        const module = parent.moduleSpecifier.text;
        return (module === "clsx" &&
            ["clsx", "default"].includes(importedName)) ||
            (/(?:^|\/)lib\/utils\.ts$/.test(module) && importedName === "cn");
    }

    // Reject local objects/arrays that are written to or escape to unknown calls.
    // Aliases share the same mutation boundary; no initializer is a frozen snapshot.
    function inspect(node: ts.Node) {
        if (ts.isIdentifier(node)) {
            const symbol = checker.getSymbolAtLocation(node);
            let access: ts.Node = node;
            while (
                (ts.isPropertyAccessExpression(access.parent) ||
                    ts.isElementAccessExpression(access.parent)) &&
                access.parent.expression === access
            ) access = access.parent;
            const parent = access.parent;
            const written = ts.isBinaryExpression(parent) &&
                parent.left === access &&
                parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
                parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment;
            const called = ts.isCallExpression(parent) &&
                (parent.expression === access && access !== node ||
                    parent.arguments.some((arg) => arg === access) &&
                        !isComposer(parent.expression));
            if (
                symbol && (written || called || ts.isDeleteExpression(parent) ||
                    ts.isPostfixUnaryExpression(parent) ||
                    ts.isPrefixUnaryExpression(parent) &&
                        [
                            ts.SyntaxKind.PlusPlusToken,
                            ts.SyntaxKind.MinusMinusToken,
                        ].includes(parent.operator))
            ) {
                unsafe.add(symbol);
            }
            if (
                symbol && ts.isVariableDeclaration(parent) &&
                parent.initializer === node && ts.isIdentifier(parent.name)
            ) {
                const alias = checker.getSymbolAtLocation(parent.name);
                if (alias) aliases.set(alias, symbol);
            }
        }
        ts.forEachChild(node, inspect);
    }
    inspect(source);
    for (let changed = true; changed;) {
        changed = false;
        for (const [alias, original] of aliases) {
            if (unsafe.has(alias) === unsafe.has(original)) continue;
            unsafe.add(alias);
            unsafe.add(original);
            changed = true;
        }
    }

    function scalar(
        expr: ts.Expression,
        seen = new Set<ts.Node>(),
    ): { truthy: boolean; nullish: boolean } | undefined {
        if (seen.has(expr) || seen.size >= limit) return undefined;
        seen.add(expr);
        if (
            ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) ||
            ts.isSatisfiesExpression(expr) || ts.isNonNullExpression(expr) ||
            ts.isTypeAssertionExpression(expr)
        ) return scalar(expr.expression, seen);
        if (ts.isStringLiteralLike(expr) || ts.isNumericLiteral(expr)) {
            return {
                truthy: ts.isNumericLiteral(expr)
                    ? Number(expr.text) !== 0
                    : expr.text.length > 0,
                nullish: false,
            };
        }
        if (expr.kind === ts.SyntaxKind.TrueKeyword) {
            return { truthy: true, nullish: false };
        }
        if (expr.kind === ts.SyntaxKind.FalseKeyword) {
            return { truthy: false, nullish: false };
        }
        if (expr.kind === ts.SyntaxKind.NullKeyword) {
            return { truthy: false, nullish: true };
        }
        if (ts.isIdentifier(expr)) {
            const symbol = checker.getSymbolAtLocation(expr);
            if (!symbol && expr.text === "undefined") {
                return { truthy: false, nullish: true };
            }
            const declaration = symbol?.valueDeclaration;
            if (
                symbol && !unsafe.has(symbol) && declaration &&
                ts.isVariableDeclaration(declaration) &&
                ts.isVariableDeclarationList(declaration.parent) &&
                declaration.parent.flags & ts.NodeFlags.Const &&
                declaration.initializer
            ) {
                return scalar(declaration.initializer, seen);
            }
        }
        return undefined;
    }

    function branches<T>(
        expr: ts.Expression,
        leaf: (expr: ts.Expression, depth: number) => T[],
        depth = 0,
        empty: T[] = [],
        splitBranches = true,
    ): T[] {
        if (depth === 0) remaining = 4096;
        if (depth >= limit || --remaining < 0 || active.has(expr)) {
            unknown.add(expr);
            return [];
        }
        active.add(expr);
        const recur = (node: ts.Expression) =>
            branches(node, leaf, depth + 1, empty, splitBranches);
        let result: T[];
        if (
            ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) ||
            ts.isTypeAssertionExpression(expr) ||
            ts.isSatisfiesExpression(expr) ||
            ts.isNonNullExpression(expr)
        ) {
            result = recur(expr.expression);
        } else if (ts.isIdentifier(expr)) {
            const symbol = ts.isShorthandPropertyAssignment(expr.parent)
                ? checker.getShorthandAssignmentValueSymbol(expr.parent)
                : checker.getSymbolAtLocation(expr);
            const declaration = symbol?.valueDeclaration;
            if (
                declaration && ts.isVariableDeclaration(declaration) &&
                ts.isVariableDeclarationList(declaration.parent) &&
                (declaration.parent.flags & ts.NodeFlags.Const) &&
                symbol && !unsafe.has(symbol) &&
                declaration.initializer
            ) {
                result = recur(declaration.initializer);
            } else {
                unknown.add(expr);
                result = [];
            }
        } else if (splitBranches && ts.isConditionalExpression(expr)) {
            const condition = scalar(expr.condition);
            result = condition
                ? recur(condition.truthy ? expr.whenTrue : expr.whenFalse)
                : [...recur(expr.whenTrue), ...recur(expr.whenFalse)];
        } else if (
            splitBranches && ts.isBinaryExpression(expr) &&
            [
                ts.SyntaxKind.AmpersandAmpersandToken,
                ts.SyntaxKind.BarBarToken,
                ts.SyntaxKind.QuestionQuestionToken,
            ].includes(expr.operatorToken.kind)
        ) {
            const left = scalar(expr.left);
            if (
                expr.operatorToken.kind ===
                    ts.SyntaxKind.AmpersandAmpersandToken
            ) {
                result = left
                    ? (left.truthy ? recur(expr.right) : empty)
                    : [...recur(expr.right), ...empty];
            } else if (left) {
                const useRight = expr.operatorToken.kind ===
                        ts.SyntaxKind.QuestionQuestionToken
                    ? left.nullish
                    : !left.truthy;
                result = recur(useRight ? expr.right : expr.left);
            } else {
                result = [...recur(expr.left), ...recur(expr.right)];
            }
        } else {
            // Leaf walkers may inspect the same object in another semantic mode.
            active.delete(expr);
            result = leaf(expr, depth);
        }
        active.delete(expr);
        return result;
    }

    function classes(
        expr: ts.Expression,
        composition = false,
        depth = 0,
    ): StaticClass[] {
        return branches(expr, (node, level) => {
            if (ts.isStringLiteralLike(node)) {
                return [{ text: node.text, node, offset: 1 }];
            }
            if (ts.isTemplateExpression(node)) {
                const parts = [
                    node.head,
                    ...node.templateSpans.map((span) => span.literal),
                ];
                return parts.flatMap((part, index) => {
                    // Only whole whitespace-delimited classes are known. Never join
                    // fragments across substitutions (text-[${size}px], for example).
                    const text = part.text;
                    const start = index === 0
                        ? 0
                        : (text.search(/\s/) < 0
                            ? text.length
                            : text.search(/\s/));
                    const end = index === parts.length - 1
                        ? text.length
                        : text.search(/\S+$/);
                    return [{
                        text: text.slice(start, end < 0 ? text.length : end),
                        node: part,
                        offset: 1 + start,
                    }];
                });
            }
            if (
                ts.isCallExpression(node) && isComposer(node.expression)
            ) {
                return node.arguments.flatMap((arg) =>
                    classes(arg, true, level + 1)
                );
            }
            if (composition && ts.isArrayLiteralExpression(node)) {
                return node.elements.flatMap((element) => {
                    if (!ts.isSpreadElement(element)) {
                        return classes(element, true, level + 1);
                    }
                    // Spreading a string yields characters, not a class token.
                    return branches(
                        element.expression,
                        (spread, spreadDepth) => {
                            if (ts.isArrayLiteralExpression(spread)) {
                                return classes(spread, true, spreadDepth + 1);
                            }
                            unknown.add(spread);
                            return [];
                        },
                        level + 1,
                    );
                });
            }
            if (composition && ts.isObjectLiteralExpression(node)) {
                return objects(node, level + 1).flatMap((object) =>
                    [...object].flatMap(([text, value]): StaticClass[] => {
                        if (scalar(value)?.truthy === false) return [];
                        const name = ts.isPropertyAssignment(value.parent)
                            ? value.parent.name
                            : value;
                        return [{
                            text,
                            node: name,
                            offset: ts.isStringLiteralLike(name) ? 1 : 0,
                        }];
                    })
                );
            }
            unknown.add(node);
            return [];
        }, depth);
    }

    function objects(
        expr: ts.Expression,
        depth = 0,
    ): Map<string, ts.Expression>[] {
        return branches(
            expr,
            (node, level) => {
                if (
                    node.kind === ts.SyntaxKind.NullKeyword ||
                    node.kind === ts.SyntaxKind.FalseKeyword
                ) return [new Map()];
                if (!ts.isObjectLiteralExpression(node)) {
                    unknown.add(node);
                    return [];
                }
                let variants = [new Map<string, ts.Expression>()];
                for (const prop of node.properties) {
                    if (ts.isSpreadAssignment(prop)) {
                        const spreads = objects(prop.expression, level + 1);
                        if (
                            !spreads.length ||
                            spreads.length * variants.length > limit
                        ) {
                            // An unknown spread may overwrite every preceding property.
                            unknown.add(prop);
                            variants = [new Map()];
                        } else {
                            variants = variants.flatMap((base) =>
                                spreads.map((spread) =>
                                    new Map([...base, ...spread])
                                )
                            );
                        }
                    } else if (
                        ts.isPropertyAssignment(prop) ||
                        ts.isShorthandPropertyAssignment(prop)
                    ) {
                        if (
                            ts.isIdentifier(prop.name) ||
                            ts.isStringLiteralLike(prop.name)
                        ) {
                            for (const variant of variants) {
                                variant.set(
                                    prop.name.text,
                                    ts.isPropertyAssignment(prop)
                                        ? prop.initializer
                                        : prop.name,
                                );
                            }
                        } else {
                            unknown.add(prop);
                            variants = [new Map()];
                        }
                    } else {
                        unknown.add(prop);
                    }
                }
                return variants;
            },
            depth,
            [new Map()],
        );
    }

    function styles(expr: ts.Expression): StaticStyle[] {
        // Resolve literal aliases, but do not split property initializers:
        // runtime owner exceptions depend on the complete expression.
        return objects(expr).flatMap((object) =>
            [...object].map(([name, value]) => {
                const literals = branches<ts.Expression>(
                    value,
                    (node) => {
                        if (
                            ts.isStringLiteralLike(node) ||
                            ts.isNumericLiteral(node) ||
                            ts.isPrefixUnaryExpression(node) &&
                                ts.isNumericLiteral(node.operand)
                        ) return [node];
                        unknown.add(node);
                        return [];
                    },
                    0,
                    [],
                    false,
                );
                return { name, value: literals[0] ?? value };
            })
        );
    }

    function stringValues(expr: ts.Expression): ts.StringLiteralLike[] {
        return branches(expr, (node) => {
            if (ts.isStringLiteralLike(node)) return [node];
            unknown.add(node);
            return [];
        });
    }

    return { classes, styles, stringValues, unknown };
}
