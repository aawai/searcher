---
type: concept
title: Web Animations API Runtime Architecture
domain: engineering
created: 2026-10-05
updated: 2026-10-05
sources:
  - sources/SRC-2026-10-05-003
  - sources/SRC-2026-10-05-004
---

# Web Animations API Runtime Architecture

结合 CSS 硬件加速渲染性能与 JavaScript 命令式时序编排能力，直接将图层变换卸载至浏览器合成器线程（Compositor Thread）的原生前端动效架构。

## Definition

传统的 Web 前端动效往往在两种极端之间妥协：
- **纯 CSS 动效 / 关键帧**：性能优异（可由 GPU 合成器线程脱离主线程执行），但缺乏对生命周期、暂停、逆向、速率或动态几何坐标的细粒度命令式控制；
- **requestAnimationFrame (rAF) 主线程轮询**：控制力强大，但每一帧都在主线程执行 JavaScript 计算与内联样式突变，容易因主线程长任务或垃圾回收引发掉帧（jank），且耗电量高。

Web Animations API (WAAPI) 架构通过将底层引擎统一到浏览器合成器管线：
1. **Compositor 卸载（S-Tier）**：针对 `transform`、`opacity`、`filter` 与 `clip-path`，动效直接交由 GPU/合成器线程回放，完全规避 Layout/Paint 与主线程样式重算，即使 JavaScript 主线程被重度密集计算阻塞，视觉画面依旧平滑维持 60fps/120fps；
2. **命令式精确控制**：提供 `pause()`、`reverse()`、`playbackRate` 与 `currentTime` 寻址，支持随时以非侵入方式调整播放状态；
3. **Promise 驱动的生命周期契约**：内置 `anim.finished` 与 `anim.ready` Promise，便于在单写入者（One-Writer）控制器中实现无竞态的时序转场与清理。

## Implementation in Searcher

在 Searcher 项目（Issue #114 / #116）中：
- 壁纸 Temporal Motion System 全面收敛为基于 WAAPI 的单写入者控制器；
- 彻底移除 CSS 多源关键帧，统一在 Compositor 管道中执行平滑漂移与推近，消除循环接缝顿点；
- 开发模式下的 `WallpaperMotionInspector` 作为按需注入诊断工具，可实时监控 WAAPI 回放速度倍率与阶段统计。

## Links

- [Searcher 项目](/entities/searcher-项目.md)
- [The Web Animations API vs. CSS](/sources/SRC-2026-10-05-003.md)
- [The Web Animation Performance Tier List](/sources/SRC-2026-10-05-004.md)
