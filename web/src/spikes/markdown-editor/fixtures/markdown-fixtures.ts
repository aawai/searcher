export interface MarkdownFixture {
    name: string;
    category: string;
    input: string;
    expectedCanonical?: string;
    notes?: string;
}

export const markdownFixtures: MarkdownFixture[] = [
    {
        name: "paragraphs",
        category: "blocks",
        input:
            "第一段普通文本内容。\n\n第二段普通文本，测试段落之间的分隔与空行保持。",
    },
    {
        name: "headings-1-to-6",
        category: "headings",
        input:
            "# 一级标题 H1\n\n## 二级标题 H2\n\n### 三级标题 H3\n\n#### 四级标题 H4\n\n##### 五级标题 H5\n\n###### 六级标题 H6",
    },
    {
        name: "inline-formatting",
        category: "inlines",
        input:
            "正文包含 **加粗文本**、*斜体文本*、~~删除线文本~~ 以及 `inline code` 代码。",
    },
    {
        name: "fenced-code-blocks",
        category: "code",
        input:
            '```typescript\ninterface DocumentEntity {\n    id: string;\n    title: string;\n}\nconst doc: DocumentEntity = { id: "1", title: "Test" };\n```',
    },
    {
        name: "fenced-code-without-lang",
        category: "code",
        input: "```\nplain code block without language\nline 2\n```",
    },
    {
        name: "unordered-list",
        category: "lists",
        input: "- 项目一\n- 项目二\n- 项目三",
    },
    {
        name: "unordered-list-star-normalization",
        category: "lists",
        input: "* 项目星号一\n* 项目星号二",
        expectedCanonical: "- 项目星号一\n- 项目星号二\n",
        notes: "规范化: 星号列表标记规范化为统一破折号 -",
    },
    {
        name: "ordered-list",
        category: "lists",
        input: "1. 顺序一\n2. 顺序二\n3. 顺序三",
    },
    {
        name: "nested-lists",
        category: "lists",
        input:
            "- 顶级项 A\n  - 子项 A-1\n  - 子项 A-2\n    1. 深入有序项 1\n    2. 深入有序项 2\n- 顶级项 B",
    },
    {
        name: "task-lists",
        category: "tasks",
        input: "- [ ] 待办任务项 1\n- [x] 已完成任务项 2\n- [ ] 未完成任务项 3",
    },
    {
        name: "blockquotes",
        category: "quotes",
        input: "> 第一行引用正文。\n>\n> 第二行引用正文。\n> > 嵌套深层引用。",
    },
    {
        name: "links",
        category: "inlines",
        input:
            '[Searcher 首页](https://searcher.test) 与 [带标题链接](https://searcher.test/docs "文档中心")。',
    },
    {
        name: "images-standard-and-asset",
        category: "images",
        input:
            '![网络图片](https://example.com/cover.png)\n\n![内部资产图片](asset://document-asset-987654321)\n\n![带标题内部资产](asset://doc-img-42 "资产展示说明")',
    },
    {
        name: "horizontal-rules",
        category: "rules",
        input: "段落上方。\n\n---\n\n段落下方。",
    },
    {
        name: "gfm-tables",
        category: "tables",
        input:
            "| 列 A (左对齐) | 列 B (居中) | 列 C (右对齐) |\n| :--- | :---: | ---: |\n| 单元格 1 | 单元格 2 | 单元格 3 |\n| 文本内容 | 居中数据 | 999.00 |",
    },
    {
        name: "line-breaks",
        category: "breaks",
        input: "第一行硬折行  \n第二行硬折行\\\n第三行接续。",
        expectedCanonical: "第一行硬折行\\\n第二行硬折行\\\n第三行接续。\n",
        notes: "规范化: CommonMark 硬折行规范化为反斜杠折行",
    },
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
    {
        name: "raw-html-inline",
        category: "html",
        input:
            '包含行内 <span class="text-accent">高亮标记</span> 与 <kbd>Ctrl</kbd>+<kbd>S</kbd> 快捷键提示。',
        notes:
            "Raw HTML 策略: 行内合法 HTML 标签按 CommonMark 保持原样 roundtrip",
    },
];
