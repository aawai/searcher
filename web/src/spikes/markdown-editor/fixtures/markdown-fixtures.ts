import type { MarkdownFixture } from "../../../features/markdown-editor/fixtures/markdown-fixtures.ts";

export const markdownFixtures: MarkdownFixture[] = [
    {
        name: "pagebreak-standalone",
        category: "pagebreak",
        input: "第一页正文内容。\n\n<!-- pagebreak -->\n\n第二页正文内容。",
    },
    {
        name: "pagebreak-consecutive",
        category: "pagebreak",
        input:
            "前置页内容。\n\n<!-- pagebreak -->\n\n<!-- pagebreak -->\n\n跳过一页后的新页内容。",
    },
    {
        name: "pagebreak-document-start",
        category: "pagebreak",
        input: "<!-- pagebreak -->\n\n第一页为空，从第二页开始的内容。",
    },
    {
        name: "pagebreak-document-end",
        category: "pagebreak",
        input: "正文内容结束。\n\n<!-- pagebreak -->",
    },
];
