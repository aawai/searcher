---
type: source
title: "Observation: Ubuntu Chromium 系统依赖修复与默认启动验收"
tags:
  - browser
  - environment
  - chromium
  - playwright
  - verification
status: observation
created: 2026-10-09
updated: 2026-10-09
slug: obs-2026-10-09-ubuntu-chromium
relevance: high
observed_at: 2026-10-09T01:43:00.846Z
source_context: 独立修复本机浏览器环境
---

# ⭐ Observation: Ubuntu Chromium 系统依赖修复与默认启动验收

本机 Ubuntu 24.04 的 Playwright Chromium 141 与 omp managed Chromium 150 曾缺少 libatk 等共享库，managed daemon exit 127。用户已通过 apt 安装 libatk1.0-0t64、libatk-bridge2.0-0t64、libatspi2.0-0t64、libcups2t64、libasound2t64、libgbm1、libcairo2、libpango-1.0-0、libxcomposite1、libxdamage1、libxfixes3、libxrandr2 及其依赖。随后两套 binary 的 ldd 全部解析为系统库；清除 LD_LIBRARY_PATH、PLAYWRIGHT_BROWSERS_PATH 后 Playwright 默认 launch 通过，本地页面输入/点击/结果断言/截图通过且无 pageerror。browser.open 默认 managed launch 同样通过，本地页面交互/截图通过，errors 为空。后续同机任务无需 /tmp/searcher-browser-libs 或手动 CDP；不保证其他机器或未来新版本依赖。未修改仓库或浏览器 binary。

*Relevance: high*
*Context: 独立修复本机浏览器环境*
*Tags: browser environment chromium playwright verification*

---
*Observed: 2026-10-09T01:43:00.846Z*
