---
type: source
title: "Observation: Mobile masthead centered search halo-only peek implemented (issue 363)"
tags:
  - issue-363
  - home
  - masthead
  - mobile
  - implementation
status: observation
created: 2026-11-04
updated: 2026-11-04
slug: obs-2026-11-04-mobile-masthead-centered-search-halo-only-peek-implemented-i
relevance: high
observed_at: 2026-11-04T01:46:08.677Z
source_context: Issue 363 移动端刊头实现 B + 无导语 + V3
---

# ⭐ Observation: Mobile masthead centered search halo-only peek implemented (issue 363)

用户选定 B 居中 + 无导语 + V3 纯柔光，已在 main 工作区实现（未提交）。tokens.css <768 时 --home-hero-inset: max(64px, calc(48dvh - 84px))，新增 --home-hero-inset-engaged: clamp(64px,16dvh,140px)；home-layouts.css 中 .hero 在 :has(.search-form-wrap:focus-within) 或 [data-inline-answer=open] 时过渡到该值（ZenLayout 设置 data-inline-answer；css-prefix-ownership 禁止在 home-layouts.css 里引用 .inline-ai-card）。收起态只显示 content 的第一块：HomeMasthead 用 ResizeObserver 量出 peekBlockHeight，peekHeight = min(placement.peek.height, 块高 + MASTHEAD_PEEK_HALO_ROOM 24)，其余子元素 opacity 0，dek 粗线透明，最后 --space-6 渐隐。--masthead-peek-veil(-mix) 由 --masthead-peek-veil-opacity 取代（默认 0；off、减少透明度、无 backdrop-filter 时为 1）；halo 加强为 1/1/2/4/8/16/28px。重叠修复：ZenLayout measure 用 rect.top 减去 computed transform 的 m42，不再在展开时 return，并以 {box:'border-box'} 观察 hero（padding 变化不触发 content-box RO，这是第二个坑）。刊头的 escape layer 由 overlay 改为 host，任务栏不再半透明禁用，撤销提示不再被隐藏。UI guard 新增 exceptions.ts 中 HomeMasthead height === peekHeight 的豁免。验证：deno task test 823 通过；check:ui 通过；完整 E2E 145/146 通过，shortcuts-search 因 hero 过渡导致测量竞态，已在测试里等待 hero 动画结束；修改后 shortcuts-search/home-masthead-placement/home-composition/inline-ai-answer 全部通过。像素对比度（390x844@2x，4 种壁纸）：日数字 ≥14.9，月份 ≥6.2，星期与时间行浅色 ≥3.0、深色 ≥4.5，与旧版 22% 衬底持平。

*Relevance: high*
*Context: Issue 363 移动端刊头实现 B + 无导语 + V3*
*Tags: issue-363 home masthead mobile implementation*

---
*Observed: 2026-11-04T01:46:08.677Z*
