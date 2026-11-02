---
type: concept
title: Playwright Actionability and E2E Wait Conditions
domain: engineering
created: 2026-11-01
updated: 2026-11-01
sources:
  - sources/SRC-2026-11-01-002
---

# Playwright Actionability and E2E Wait Conditions

[Playwright 文档](/sources/SRC-2026-11-01-002.md)（[raw](../../raw/sources/SRC-2026-11-01-002/extracted.md) 第 33–98 行）：动作前自动检查 Visible、Stable、Receives Events、Enabled（输入类动作另需 Editable），`timeout` 内不通过抛 `TimeoutError`。这些检查只回答“元素现在能不能被操作”，**不回答“应用状态是否到位”**。

## 检查的边界（易误判点）

- **`opacity:0` 算 Visible**（第 71 行）；因此“淡出完成”不能靠 Playwright 的可见性判断，需要对 `opacity`、`data-ending-style` 或节点移除另写条件。
- **Stable = 连续两帧包围盒相同**（第 75 行）：只看几何，不看内容、焦点或数据；动画只改 `opacity`/颜色时仍被视为稳定。
- **Enabled 包含 `aria-disabled=true` 祖先**（第 85 行），不包含 `inert`；`inert` 元素的行为需要靠 Receives Events 间接发现（见下）。
- **Receives Events** 在动作点做命中测试（第 98 行）；被覆盖层截获则等待。`force` 会关闭该检查（第 51 行），测试就不再证明用户真的点得到。

## Searcher 的 E2E 现状（2026-11-01 读取 `web/e2e`）

`scripts/e2e/suites.ts` 第 334–368 行要求通过 `web/e2e/helpers/browser.ts` 导入 `chromium`，而非直接从 `"playwright"` 导入，使 `run.ts --timeout` 生效。`web/e2e` 内出现次数（grep 计数，含重复出现）：

| 模式 | 次数 |
| --- | --- |
| `force: true` | 0 |
| `trial: true` | 0 |
| `waitForFunction` | 307 |
| `waitForTimeout` | 38 |

没有 `force: true`，与仓库 `AGENTS.md` 的“不以强制操作掩盖失败”一致；等待状态主要由 `waitForFunction` 对应用状态/几何建立可观察条件。38 处 `waitForTimeout` 未逐一核对用途（可能是负向观察的固定窗口，规则允许固定采样窗口，但未验证）。

项目 `docs/testing.md` 第 45 行说明首轮限时的原因：定位器找不到元素时会等满默认 30s；这与 actionability 的“超时前一直重试”语义一致，因此限时只缩短失败前的等待，不改变应用行为。

## 与 inert/淡出的交互（推断）

[INFERENCE] 项目的关闭过渡把节点保留并设 `inert` 与 `data-ending-style`（见 [Inert and Top Layer in Searcher Overlays](/concepts/inert-and-top-layer-in-searcher-overlays.md)）。此时元素仍可 `opacity:0` 地“可见”，但点击会被命中测试判为不接收事件而继续等待；若测试想断言“已关闭”，应断言状态而非依赖 click 超时。该行为未在本次运行实测。

## 关联

- [Contract-First Testing](/concepts/contract-first-testing.md)
- [Reduced Motion Replacement Strategy](/concepts/reduced-motion-replacement-strategy.md)：动画替换后 Stable 判定受影响的是位移而非透明度。
