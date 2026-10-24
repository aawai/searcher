import { parseVisualRegistry } from "./registry.ts";

/** A small registry in the exact table format of docs/design/VISUAL_LANGUAGE.md. */
export const FIXTURE_MARKDOWN = `
**断点登记。**

| 下界（px） | 档位 | 用途 | owner |
| --- | --- | --- | --- |
| \`0\` | 窄 | 单列 | 页面 |
| \`640\` | 小 | 表单 | 表单 |
| \`768\` | 中 | 侧栏 | Shell |
| \`1024\` | 宽 | 画布 | 首页 |

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

**强调色填充登记。** 说明文字。

| 语义        | 文件                              | 选择器                                |
| ----------- | --------------------------------- | ------------------------------------- |
| primary     | \`web/src/components/ui/button.css\` | \`.button--primary\`                    |
| 选中 / 激活 | \`web/src/components/ui/switch.css\` | \`.switch[data-checked], .switch--on\`  |
`;

export const FIXTURE_REGISTRY = parseVisualRegistry(FIXTURE_MARKDOWN);
