export function largeDocumentMarkdown(assetId: string): string {
    return Array.from({ length: 200 }, (_, index) => {
        const parts = [
            `## 章节 ${index + 1}`,
            "长文正文与中文编辑边界。".repeat(50),
        ];
        if (index < 50) parts.push(`![图 ${index + 1}](asset://${assetId})`);
        if (index < 20) {
            parts.push(
                "| 名称 | 值 |\n| --- | --- |\n| 中文 | 保留 |\n| 边界 | 123 |",
            );
        }
        if (index < 30) parts.push("<!-- pagebreak -->");
        return parts.join("\n\n");
    }).join("\n\n");
}
