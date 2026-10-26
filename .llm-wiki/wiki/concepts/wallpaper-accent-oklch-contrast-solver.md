---
type: concept
title: Wallpaper Accent OKLCH Contrast Solver
domain: design-system
created: 2026-10-25
updated: 2026-10-25
sources: [sources/SRC-2026-10-25-001, sources/SRC-2026-10-25-002, sources/SRC-2026-10-25-003]
---

# Wallpaper Accent OKLCH Contrast Solver（跟随壁纸的强调色）

[[entities/searcher-项目]] 的强调色默认"跟随壁纸"（迁移 `0028` 让偏好 `accent` 接受 `wallpaper`）。实现为纯函数模块 `web/src/design-system/wallpaper-accent.ts`：相同像素 + 相同构图焦点 → 相同调色板，因此所有能读取壁纸的设备派生出同一颜色，无需上传或同步派生结果。

## 算法

1. **取样区域**：有构图焦点时取以焦点为中心、宽高各 50%（`FOCAL_WINDOW`）的窗口（贴边时平移不缩小）；无焦点取整图。alpha < 128 的像素跳过。
2. **色相投票（Oklab）**：像素 → OKLab（[[sources/SRC-2026-10-25-001]] 的矩阵内联实现）。`chroma < 0.04` 视为灰色不投票；权重 = chroma × 亮度权重（L 接近 0.1 以下或 0.98 以上的近黑 / 近白像素权重趋 0）。色相分 24 箱，按"本箱 + 0.5 × 相邻两箱"打分取最佳，再在 3 箱窗口内做向量平均得到色相。
3. **中性判定**：窗口内投票像素少于计入像素的 4%（`MIN_HUE_SHARE`）→ `chroma = 0`，得到中性色（"中性壁纸得到中性色"）。
4. **种子量化**：hue 取整度、chroma 取 1/200，吸收不同解码器的细微差异。
5. **解亮度**：chroma 夹在 `[0.08, 0.2]`。浅色主题从 L 0.56 向下、深色主题从 L 0.74 向上，以 0.005 步进；每步生成 accent / hover / active（相邻 0.07 L 阶），OKLCH → sRGB 时固定 L、h，二分降低 chroma 直到进入 gamut。全部对比度对满足 `minimum + 0.1` 即返回；到达 L 0 / 1 时黑 / 白必然通过，循环可终止。

## 对比度契约

| 对 | 最低值 | 依据 |
|---|---|---|
| 强调色文字 / 表面、/ 浅底（`--accent-soft-mix` 混色） | 4.5 | [[sources/SRC-2026-10-25-002]] 1.4.3 |
| 前景 / 强调色、/ hover、/ active | 4.5 | 1.4.3 |
| 焦点环 / `--background`、`--surface`、`--surface-soft` | 3 | [[sources/SRC-2026-10-25-003]] 1.4.11 |

- 浅色前景固定白色；深色主题前景为 L 0.18、chroma ≤ 0.04 的同色相深色。
- `CONTRAST_MARGIN = 0.1` 为浏览器 `color-mix()` 取整预留——WCAG 阈值不取整，算法内 4.5 必须是实际渲染后的 4.5。
- 表面颜色在模块内镜像 `tokens.css`；`wallpaper-accent.test.ts` 对照实时 Token 检查，`web/e2e/accent-contrast.test.ts` 检查 9 个预设色走同一组 `accentContrast` 对。

## 设计取舍

- 选 Oklab 而非 HSV/HSL：HSV 等 S/V 下不同色相亮度差异大（黄、青远亮于蓝），固定色相解 L 时会出现色相漂移；Oklab 的 L/C/h 近似正交。
- 只解 L、降 C，不改 h：保证"取自壁纸的颜色"在用户感知上仍是该色相。
- 无壁纸或图片无法读取时回退经典蓝；已有账户与设备保留原强调色（迁移不改变外观）。

## 关联

- [[concepts/tailwind-v4-css-first-architecture]]（Token 层）
- [[concepts/pointer-target-size]]（同属 `VISUAL_LANGUAGE.md` "底线"）
- 原型：`/design-lab/accent`
