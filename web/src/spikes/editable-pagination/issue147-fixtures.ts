import {
    createOversizedFixtureMarkdown,
    generateOversizedPngDataUrl,
} from "./fixtures.ts";

export const SHORT_PAGEBREAK_FIXTURES = {
    empty: "",
    middle: "A\n\n<!-- pagebreak -->\n\nB",
    leading: "<!-- pagebreak -->\n\nA",
    trailing: "A\n\n<!-- pagebreak -->",
    consecutive: "A\n\n<!-- pagebreak -->\n\n<!-- pagebreak -->\n\nB",
} as const;

/** Each section fits a physical page at the default A4 settings. */
export function createPerformanceFixture(pages: 10 | 30): string {
    return Array.from({ length: pages }, (_, index) => {
        const heading = `# Performance page ${index + 1}`;
        const paragraphs = Array.from(
            { length: 8 },
            (_, paragraph) =>
                `Page ${index + 1}, paragraph ${paragraph + 1}. ` +
                "The shared editable document keeps text, selections and history in one ProseMirror state. "
                    .repeat(3),
        );
        return [heading, ...paragraphs].join("\n\n");
    }).join("\n\n<!-- pagebreak -->\n\n");
}

export const THREE_PAGE_FIXTURE =
    "First editable page.\n\n<!-- pagebreak -->\n\nSecond editable page.\n\n<!-- pagebreak -->\n\nThird editable page.";

export const AUTOMATIC_FIXTURE = Array.from(
    { length: 95 },
    (_, index) =>
        `Paragraph ${String(index + 1).padStart(3, "0")}. ` +
        "Automatic pagination must retain every word while the same editor remains editable. "
            .repeat(4),
).join("\n\n");

export const FLOAT_FAILURE_FIXTURES = {
    table: "# Native table after text\n\n" +
        "One editable paragraph before the table.\n\n" +
        "| Key | Value |\n| --- | --- |\n" +
        Array.from(
            { length: 70 },
            (_, index) => `| Row ${index + 1} | Cell ${index + 1} |`,
        ).join("\n"),
    oversizedRow: "# One tall editable row\n\n" +
        "| Short | Tall |\n| --- | --- |\n" +
        "| Short cell | " +
        "Tall cell keeps its canonical editable text across physical pages. "
            .repeat(160) +
        " |\n" +
        "| Next row | Text after the tall row |\n\nEnd of document.",
    code: "# Long editable code\n\n```text\n" +
        Array.from(
            { length: 100 },
            (_, index) => `Line ${index + 1}: retain editable code text`,
        ).join("\n") +
        "\n```",
    image: () => createOversizedFixtureMarkdown(),
    adjacentImages: () => {
        const image = generateOversizedPngDataUrl();
        return `![First](${image})![Second](${image})`;
    },
    inlineImage: () =>
        `Before ![Inline](${generateOversizedPngDataUrl()}) After`,
    cellImage: () =>
        `| Cell |\n| --- |\n| Before ![Cell](${generateOversizedPngDataUrl()}) After |`,
    horizontalRules: Array.from({ length: 100 }, () => "---").join("\n\n"),
};
