# UI 验收清单

本清单作为 UI 改动的基础自检参考，依据 [VISUAL_LANGUAGE.md](VISUAL_LANGUAGE.md)。不再强制多视口截图矩阵与历史阶段逐项勾选。

## 基础可用性

- [ ] **双主题可读性**：浅色（`light`）与深色（`dark`）模式下，文字、图标与核心控件清晰可辨，无明显裁切或重叠。
- [ ] **键盘与 Escape**：核心交互支持键盘操作；弹窗、菜单或抽屉可用 `Escape` 正常关闭，不出现焦点丢失或键盘陷阱。
- [ ] **减少动效**：开启 `prefers-reduced-motion: reduce` 时，核心功能与状态切换仍清晰可用，无剧烈位移或闪烁。
- [ ] **安全确认**：破坏性操作使用 `AlertDialog` 二次确认或提供撤销提示。

## 卫生门禁

- [ ] **静态检查**：`deno task check:ui` 通过（无未定义的 CSS 变量引用、无原生 `confirm()`、无裸原生选择控件）。
- [ ] **基础构建与测试**：`deno task test` 与 `deno task build` 通过。
