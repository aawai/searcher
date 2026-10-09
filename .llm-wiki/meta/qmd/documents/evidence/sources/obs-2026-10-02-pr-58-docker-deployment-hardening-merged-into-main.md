---
type: source
title: "Observation: PR #58 Docker deployment hardening merged into main"
tags:
  - docker,ghcr,unraid,deployment,pr-58
status: observation
created: 2026-10-02
updated: 2026-10-02
slug: obs-2026-10-02-pr-58-docker-deployment-hardening-merged-into-main
relevance: high
observed_at: 2026-10-02T07:43:26.919Z
---

# ⭐ Observation: PR #58 Docker deployment hardening merged into main

PR https://github.com/aawai/searcher/pull/58 merged into remote main on 2026-10-02 at 07:42:49Z, merge commit 2859b076aaabdd4deda7e3371a9e83e6b8f0493e. Hardening commit 0ed63a8; main integration commit 20bd6091fc0bf2fd8d1e19753b19c602197f81fd resolved only additive CHANGELOG conflict, retaining both entries. Docker workflow builds/loads, smoke-tests all events offline, then non-PR events push the same tested image; same-ref concurrency cancels obsolete builds. Runtime lock generated from main lock, runtime imports and two entrypoint graphs, preserving integrity/version with frozen installation; config drift rejected. Default USER deno 1000:1000; Unraid bind ownership/custom --user documented. Public image explicitly includes backend source; tests and frontend/build dependencies excluded. Local image smoke, admin create/reset, offline same-volume recreation, custom UID 99:100 bind login, SIGTERM exit0, typecheck/lint/format/actionlint passed; image 161629066 bytes. GitHub CI check access returned403; no claim remote CI passed or package published.

*Relevance: high*
*Tags: docker,ghcr,unraid,deployment,pr-58*

---
*Observed: 2026-10-02T07:43:26.919Z*
