export interface MarkdownFixture {
    name: string;
    category: string;
    input: string;
    expectedCanonical?: string;
    notes?: string;
}

export const markdownFixtures: MarkdownFixture[] = [
    {
        name: "empty-document",
        category: "structure",
        input: "",
        expectedCanonical: "",
        notes: "空文档边界: 允许空字符串往返保持为空",
    },
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
        name: "chinese-rich-text",
        category: "chinese",
        input:
            "在中文语境下，需要保持全角标点符号（如“双引号”、《书名号》、以及——破折号）与混合 English 词汇的排版正确性。\n\n### 中文多级子标题\n\n测试中文字符在段落、列表与**强调粗体**中的语义稳定性：\n\n- 第一条中文要点：支持《红楼梦》等书名号格式\n- 第二条中文要点：支持“引用双引号”与‘单引号’\n- 第三条中文要点：支持中文省略号……与顿号、逗号、句号。",
    },
    {
        name: "emoji-text",
        category: "emoji",
        input:
            "这是一个含有 Emoji 🎉 🚀 和 👨‍💻 编码人员的段落。\n\n- 任务 1: 完成 📝 笔记\n- 任务 2: 交付 💡 方案\n\n> 提示：保持表情符号 ❤️ 与 👍 在 Markdown 中的序列化不发生字符损坏。",
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
        name: "long-content",
        category: "stress",
        input:
            "# 架构设计与长文档技术规范\n\n## 1. 系统概览\n\n本章节详细阐述统一编辑器内核的技术架构。为了实现跨 Notes 与 Documents 的可维护性，基础设计需要兼顾性能与纯净的序列化往返能力。\n\n---\n\n## 2. 核心技术指标\n\n以下是各个功能模块与性能预算表：\n\n| 模块名称 | 目标大小 (gzip) | 延迟上限 (ms) | 状态 |\n| :--- | :---: | ---: | :--- |\n| 共享适配器 | <= 150 KiB | 16ms | 进行中 |\n| 命令集合 | <= 20 KiB | 8ms | 就绪 |\n| 解析与序列化 | 内置核心 | 5ms | 就绪 |\n\n## 3. 实现细节与约束\n\n### 3.1 列表与任务项\n\n长文档包含深层嵌套项目列表：\n\n- 规范化阶段：\n  - 统一换行符处理\n  - 统一列表标记处理为破折号\n- 任务清单追踪：\n  - [x] Phase 1 适配器实现完成\n  - [x] Phase 2 往返测试套件就绪\n  - [ ] Phase 3 工具栏命令集成\n\n### 3.2 代码与引用\n\n```typescript\nexport function verifyPerformance(budgetKiB: number): boolean {\n    const currentSize = 120;\n    return currentSize <= budgetKiB;\n}\n```\n\n> 关键设计原则：\n> 必须保证长文档在反复往返（round-trip）解析与序列化过程中，不产生 AST 语义漂移或节点丢失。\n\n## 4. 结论与下一步\n\n长文档在编辑器生命周期中能够稳定保持段落、标题、表格与内联格式的一致性。",
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
