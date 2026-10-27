import { parseVisualRegistry } from "./registry.ts";

/** A small registry in the exact table format of docs/design/VISUAL_LANGUAGE.md. */
export const FIXTURE_MARKDOWN = `
**断点登记。**

| 下界（px） | 档位 | 用途 | owner | Tailwind |
| --- | --- | --- | --- | --- |
| \`0\` | 窄 | 单列 | 页面 | — |
| \`640\` | 小 | 表单 | 表单 | \`sm\` |
| \`768\` | 中 | 侧栏 | Shell | \`md\` |
| \`1024\` | 宽 | 画布 | 首页 | \`lg\` |

**字号阶梯登记。** 说明文字。

| Token                    | 尺寸 | 用途 |
| ------------------------ | ---- | ---- |
| \`--font-body-size\`       | 14   | 正文 |
| \`--font-page-title-size\` | 24   | 标题 |

**圆角阶梯登记。** 说明文字。

| Token              | 值 | 用途 |
| ------------------ | -- | ---- |
| \`--control-radius\` | 8  | 控件 |
| \`--radius\`         | 12 | 卡片 |

**Tailwind 视觉工具类登记。** 说明文字。

| 工具类            | 维度 | 唯一来源                   | 语义用途 |
| ----------------- | ---- | -------------------------- | -------- |
| \`font-normal\`     | 字重 | \`var(--font-body-weight)\`  | 正文     |
| \`font-medium\`     | 字重 | \`var(--font-label-weight)\` | 标签     |
| \`font-semibold\`   | 字重 | \`var(--font-title-weight)\` | 标题     |
| \`m-0\`             | 间距 | \`0\`                        | 清零     |
| \`p-0\`             | 间距 | \`0\`                        | 清零     |
| \`gap-1\`           | 间距 | \`var(--space-1)\`           | 紧凑     |
| \`gap-2\`           | 间距 | \`var(--space-2)\`           | 控件     |
| \`gap-3\`           | 间距 | \`var(--space-3)\`           | 行       |
| \`gap-4\`           | 间距 | \`var(--space-4)\`           | 区块     |
| \`p-4\`             | 间距 | \`var(--space-4)\`           | 内边距   |
| \`rounded-none\`    | 圆角 | \`0\`                        | 直角     |
| \`rounded-control\` | 圆角 | \`var(--control-radius)\`    | 控件圆角 |
| \`rounded\`         | 圆角 | \`var(--radius)\`            | 卡片圆角 |
| \`shadow-none\`     | 阴影 | \`none\`                     | 无阴影   |
| \`icon-sm\`         | 图标 | \`var(--icon-sm)\`           | 小图标   |
| \`icon-md\`         | 图标 | \`var(--icon-md)\`           | 中图标   |
| \`icon-lg\`         | 图标 | \`var(--icon-lg)\`           | 大图标   |

**强调色填充登记。** 说明文字。

| 语义        | 文件                              | 选择器                                |
| ----------- | --------------------------------- | ------------------------------------- |
| primary     | \`web/src/components/ui/button.css\` | \`.button--primary\`                    |
| 选中 / 激活 | \`web/src/components/ui/switch.css\` | \`.switch[data-checked], .switch--on\`  |
`;

export const FIXTURE_REGISTRY = parseVisualRegistry(FIXTURE_MARKDOWN);
