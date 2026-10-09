---
type: source
title: "Observation: 主题配色与多层级 Accent Scale 重构"
tags:
  - design-system
  - theme
  - accent-scale
  - ui-ux
  - database-migration
status: observation
created: 2026-09-27
updated: 2026-09-27
slug: obs-2026-09-27-accent-scale
relevance: high
observed_at: 2026-09-27T13:44:06.687Z
source_context: 用户反馈主题配色寡淡单调没有层次，重构强调色设计体系并扩展多样化色板
---

# ⭐ Observation: 主题配色与多层级 Accent Scale 重构

重构了全局主题与强调色设计体系：
1. 建立 Accent Scale 语义阶梯（--accent, --accent-hover, --accent-active, --accent-soft, --accent-subtle, --accent-border, --accent-glow, --accent-foreground），将全站散落的随意 color-mix（7%/12%/14%/15%/18%/30%/40%）全面收敛。
2. 重调原有 6 款色板（blue, cyan, teal, violet, orange, mono），提升色相纯净度与明快感，彻底消除深色模式下粉笔灰的无层次感；浅色主按钮白字对比度经 WCAG AA 验证均达到 5.18:1 ~ 14.89:1。
3. 扩充 3 款风格化强调色：绯红玫瑰 (rose)、森林翡翠 (emerald)、金珀破晓 (amber)，形成共计 9 款多样化风格。
4. 移除固定冷蓝灰壁纸渐变，采用纯净 Zinc 中性基底漫反射当前强调色环境微光（自适应环境壁纸），消除暖色撕裂感。
5. 集中在 src/shared/contracts.ts 导出 ACCENT_IDS 与 ACCENTS 元数据，并提交 0012_furry_nico_minoru.sql 迁移，preferences 表无损兼容。

*Relevance: high*
*Context: 用户反馈主题配色寡淡单调没有层次，重构强调色设计体系并扩展多样化色板*
*Tags: design-system theme accent-scale ui-ux database-migration*

---
*Observed: 2026-09-27T13:44:06.687Z*
