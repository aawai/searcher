/**
 * Fixtures for the Editable Pagination Spike.
 *
 * Provides:
 * 1. "normal": Comprehensive long document with headers, tasks, table, code.
 * 2. "manual": Distinct manual start, consecutive, and end pagebreak markers.
 * 3. "oversized": Deterministic oversized paragraph, tall code block, large table,
 *    and on-demand 2000x3000 PNG canvas image generated strictly on user action.
 */

export type FixtureKey = "normal" | "manual" | "oversized";

export const NORMAL_FIXTURE_MARKDOWN = `# 页面流式排版设计规范

本文档用于验证 **Searcher** 桌面端与平板端的多栏 CSS 原生流式分页系统（Multi-column Fragmentation）。
在分页模式下，编辑器基于物理纸张尺寸（如 A4 或 US Letter）自动流式布局，保证单状态下跨页可编辑性。

## 1. 核心设计原则与架构指标

在保持 ProseMirror 单文档状态自治的前提下，分页系统具备以下特性：

- **单编辑器状态**：不为每页单独实例化 EditorState，选区、历史记录与光标可自由跨页跳转。
- **纯 CSS 流式排版**：借助浏览器的 \`column-width\` 与 \`column-gap\`，块级内容高度溢出时自动推入下一页。
- **物理纸张几何**：精确将 A4 (210×297mm) 或 US Letter (215.9×279.4mm) 映射为 96 DPI 下的 CSS 像素。

### 核心能力清单

- [x] 连续模式与页面模式平滑切换，不销毁或重建底层编辑器实例
- [x] 动态调整纸张规格（A4 / Letter）与方向（纵向 / 横向）
- [x] 边距自定义调节（5–50mm 范围限制与有效浮点数验证）
- [ ] 导出标准 PDF 时保持与视口屏幕呈现像素级一致
- [ ] 离线持久化多页文档草稿与版本冲突解决

### 物理规格与边距参数对照表

| 规格类型 | 纸张宽度 (mm) | 纸张高度 (mm) | 默认边距 (mm) | 默认版式 | 状态 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| A4 纵向 | 210.0 | 297.0 | 20.0 | Portrait | 现行标准 |
| A4 横向 | 297.0 | 210.0 | 20.0 | Landscape | 支持适配 |
| US Letter 纵向 | 215.9 | 279.4 | 20.0 | Portrait | 现行标准 |
| US Letter 横向 | 279.4 | 215.9 | 20.0 | Landscape | 支持适配 |

> 架构提示：本排版引擎消费 shared \`createMarkdownEditor\` 基础内核，通过单一布局 Owner 监听视口并施加几何 CSS 变量，底层 Markdown 解析严格遵循 CommonMark 与 GFM 规范。

### 排版配置接口示例

\`\`\`typescript
export interface PaperConfig {
    readonly size: "A4" | "Letter";
    readonly orientation: "portrait" | "landscape";
    readonly margins: {
        readonly top: number;
        readonly right: number;
        readonly bottom: number;
        readonly left: number;
    };
}
\`\`\`

## 2. 深入排版与长文本流转

当连续段落内容累积增加时，排版引擎利用列断裂算法将后续文字自然流动到下一张物理纸张中。
用户在第一页末尾键入文字，若内容高度超过可打印内容区域（\`--page-content-height\`），
浏览器将即时在下一列排版新生成的文字，无需额外 JavaScript 计算每个字符的位置。

在页面模式下，纸张背景与阴影由独立的渲染层绘制，不污染正文的语义 DOM 结构。
同时，视口限制在局部水平纸张带内横向滚动，防止破坏工作区的全局桌面布局。
`;

export const MANUAL_FIXTURE_MARKDOWN = `<!-- pagebreak -->

# 起始分页符验证

此页位于文档最开头的分页符之后。
验证在文档起始位置插入 \`<!-- pagebreak -->\` 时，能够产生一个干净的起始空白页或独立首页，
且在 Markdown 序列化与往返解析时不丢失起始标记。

这里是第二页的正文第一段内容，用于确认起始分页符后光标定位与内容排版的稳定性。

<!-- pagebreak -->

<!-- pagebreak -->

# 连续分页符验证

上方存在两个连续的手动分页符 \`<!-- pagebreak -->\`。
中间应该呈现一个完全空白的手动分页（或独立跨页），且两个分页符在重新加载及往返解析时严格保留。

<!-- pagebreak -->
`;

/**
 * Lazily creates a real 2000x3000 PNG test image as a Data URL via browser canvas.
 * Guaranteed: NO module-eval or browser-global access at import time.
 * Only called within user fixture actions inside the browser.
 */
export function generateOversizedPngDataUrl(): string {
    if (typeof document === "undefined") {
        // Fallback transparent 1x1 PNG for non-DOM/test environments
        return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    }
    const canvas = document.createElement("canvas");
    canvas.width = 2000;
    canvas.height = 3000;
    const ctx = canvas.getContext("2d");
    if (ctx) {
        // Background
        ctx.fillStyle = "#f8fafc";
        ctx.fillRect(0, 0, 2000, 3000);

        // Header band
        ctx.fillStyle = "#2563eb";
        ctx.fillRect(40, 40, 1920, 220);

        // Title text
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 80px monospace";
        ctx.fillText("Deterministic 2000x3000 PNG Image", 100, 175);

        // Dimension badge
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 56px sans-serif";
        ctx.fillText("Physical Size: 2000px × 3000px", 120, 420);
        ctx.font = "38px sans-serif";
        ctx.fillStyle = "#475569";
        ctx.fillText(
            "Verifies proportional max printable width/height constraints.",
            120,
            490,
        );

        // Border grid
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 16;
        ctx.strokeRect(40, 40, 1920, 2920);

        // Diagonal watermark
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(40, 40);
        ctx.lineTo(1960, 2960);
        ctx.moveTo(1960, 40);
        ctx.lineTo(40, 2960);
        ctx.stroke();
    }
    return canvas.toDataURL("image/png");
}

export function createOversizedFixtureMarkdown(): string {
    const pngDataUrl = generateOversizedPngDataUrl();

    // Deterministic long paragraph exceeding single page height
    const sentence =
        "流式排版超限测试段落：该段落由大量连续文本行组成，不包含额外硬回车换行符，其整体垂直渲染高度显著超出单张纸张的可打印区域高度限制，用于验证现代浏览器 CSS 多栏排版引擎对超限段落的视觉跨栏碎片化（Visual Fragmentation）行为；在正确的排版机制下，普通块级元素虽然设置了 break-inside: avoid，但当其自身固有高度超过容器单列高度时，浏览器排版器将优雅回退并从段落中间断开，平滑流向下一列继续显示后续文字，而不会导致内容截断或产生不可见的视口溢出。";
    const longParagraph = Array.from({ length: 14 }, () => sentence).join(" ");

    // Deterministic oversized code block (70 lines)
    const codeLines = Array.from({ length: 70 }, (_, i) => {
        const lineNum = String(i + 1).padStart(2, "0");
        return `    const columnFragmentationMetric_${lineNum} = measureFragmentRow(${i}, "deterministic-token-${lineNum}");`;
    }).join("\n");

    // Deterministic oversized table (35 rows)
    const tableRows = Array.from({ length: 35 }, (_, i) => {
        const id = String(i + 1).padStart(3, "0");
        const status = i % 3 === 0
            ? "已分割 (Fragmented)"
            : i % 3 === 1
            ? "整块后移 (Pushed)"
            : "正常流式 (Flowing)";
        return `| ROW-${id} | 模块编号-${id} | 数据集分区-${
            (i % 5) + 1
        } | ${status} | ${(i * 17.5).toFixed(1)}ms | 边界跨栏行校验记录 |`;
    }).join("\n");

    return `# 超限排版边界与视觉碎片化测试

本测试文档包含超出单页物理承载能力的段落、长代码块、大尺寸表格以及超宽图像，用于验证 CSS 多列分割（Multi-column fragmentation）与图片最大打印尺寸约束。

## 1. 超限长段落（测试视觉跨栏碎片化）

${longParagraph}

## 2. 超限长代码块（超出单页高度）

\`\`\`typescript
function verifyOversizedCodeBlockFlow(): void {
${codeLines}
}
\`\`\`

## 3. 超限长数据表格（35 行跨栏）

| 索引 | 编号 | 模块分类 | 状态标记 | 耗时统计 | 说明备注 |
| :--- | :--- | :--- | :--- | :--- | :--- |
${tableRows}

## 4. 超限高分辨率图像（2000 × 3000 像素）

![超限测试图像 2000x3000](${pngDataUrl})

图像在排版模式下按最大可打印宽度与高度等比例自适应缩放（\`max-width: var(--page-content-width, 100%)\` / \`max-height: var(--page-content-height, 100%)\`），防止破坏纸张视口几何。
`;
}

export function getFixtureMarkdown(key: FixtureKey): string {
    switch (key) {
        case "normal":
            return NORMAL_FIXTURE_MARKDOWN;
        case "manual":
            return MANUAL_FIXTURE_MARKDOWN;
        case "oversized":
            return createOversizedFixtureMarkdown();
    }
}
