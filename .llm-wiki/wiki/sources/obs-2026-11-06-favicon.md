---
type: source
title: "Observation: 浏览器标签 favicon 未随新图标更换的根因与修复"
tags:
  - pwa
  - favicon
  - icon
  - brand
status: observation
created: 2026-11-06
updated: 2026-11-06
slug: obs-2026-11-06-favicon
relevance: high
observed_at: 2026-11-06T10:53:53.472Z
source_context: 用户反馈标签页 logo 没换
---

# ⭐ Observation: 浏览器标签 favicon 未随新图标更换的根因与修复

commit 30217cd 更新了 web/public/icons/ 与 manifest，但 web/index.html 的 <link rel="icon"> 仍是内联 data URI 旧放大镜（#245DBD 细线）。已改为 href="/icons/icon.svg"（未提交），deno task build 后 web/dist/index.html 引用正确。今后换图标须同时检查 index.html。Chrome 缓存 favicon，部署后需强刷。

*Relevance: high*
*Context: 用户反馈标签页 logo 没换*
*Tags: pwa favicon icon brand*

---
*Observed: 2026-11-06T10:53:53.472Z*
