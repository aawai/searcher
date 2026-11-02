---
type: concept
title: "Archive Extraction: Zip Slip and Decompression Limits"
domain: engineering
created: 2026-11-02
updated: 2026-11-02
sources:
  - sources/SRC-2026-11-02-003
  - sources/SRC-2026-11-02-004
  - sources/SRC-2026-11-02-005
---

# Archive Extraction: Zip Slip and Decompression Limits

## 威胁模型（来源）

- **Zip Slip**：恶意归档含 `../../../tmp/evil.sh` 这类条目名，解压代码把条目名直接拼到目标目录而不校验，文件就写到目录之外（[Snyk](/sources/SRC-2026-11-02-005.md)，[raw](../../raw/sources/SRC-2026-11-02-005/extracted.md) 第 11–39 行）。常规归档工具不会生成这种名字，必须手工构造（第 25 行）。
- **解压炸弹**：OWASP 把 ZIP bomb 列为“填满存储、损害可用性”的威胁，并要求大小限制在**解压之后**计算（[OWASP](/sources/SRC-2026-11-02-003.md)，[raw](../../raw/sources/SRC-2026-11-02-003/extracted.md) 第 253、379 行）；同时**不推荐接受 ZIP 上传**（第 335 行）。
- **fflate** 只返回扁平的 `路径 → 字节` 映射，不替调用方校验路径；`unzipSync` 可用 `filter` 按 `name`/`originalSize` 提前跳过，流式 `Unzip` 里 `originalSize` 可能是 `undefined`（[fflate](/sources/SRC-2026-11-02-004.md)，[raw](../../raw/sources/SRC-2026-11-02-004/extracted.md) 第 479–490、548–551 行）。

## Searcher 的实现（2026-11-02 读取 `src/features/system/service.ts`）

管理端“备份恢复”是项目里唯一的归档解析入口。`#unpack`（约第 457–531 行）的措施：

| 风险 | 措施 |
| --- | --- |
| 压缩包过大 | 整包 > 50 MiB 直接拒绝 |
| 路径穿越 / 任意名字 | 只放行 `database.sqlite`、`manifest.json`、`assets/system-settings.json` 与匹配 `^assets/(wallpapers\|icons)/[A-Za-z0-9_.-]+$` 的条目，且名称不得为 `.`、`..`；字符集不含 `/`，因此不能再嵌套路径 |
| 重复条目 | 同名路径出现两次即拒绝 |
| 解压体积 | 单文件上限：数据库 100 MiB、壁纸 5 MiB、图标 2 MiB、其余 1 MiB；总解压量 150 MiB。先看声明的 `originalSize`，再在 `ondata` 里累计实际长度，两处都校验 |
| 未收尾 | 以 `pending` 计数，存在未完成文件或没有任何文件即报“未完整解包” |
| 内容一致性 | 数据库做 `PRAGMA quick_check`、`foreign_key_check`、迁移版本比对；`backup-validator.ts` 校验壁纸负载大小与 magic bytes 与清单一致、清单外的多余文件拒绝 |

恢复时（约第 697–703 行）写盘路径是 `join(stage, path.slice(prefix.length))`，`path` 已被上面的正则约束；写入先到 `stage` 目录。

回归测试：`system.route.test.ts` 把 `assets/icons/../../outside.png` 注入合法备份，期望校验接口返回 400（约第 262–281 行）；`backup.test.ts` 覆盖多余文件、缺失负载、大小不符、类型不符、配额超限。注意：该用例的名字只有一个遍历样本，而防线实际是白名单正则，二者对应关系是读码推断，未对其他变体（如反斜杠、绝对路径）逐一测试。

## 边界与未验证项

- 流式回调内 `throw`（如“备份包含无效资源路径”）能否一定从 `unzip.push()` 传到调用者，依据是 README 对同步流的说明（第 365 行“errors will be thrown by stream.push()”）与上述路由测试通过；未单独验证 `ondata` 异步回调内抛错的传播。
- 总量限制是“解压累计字节”，被拒绝前已缓冲在 `chunks` 的数据最多接近单文件上限；内存峰值未测。
- 本页是对读码的整理，不是安全审计。

## 关联

- [Upload Validation Defense in Depth](/concepts/upload-validation-defense-in-depth.md)
- [SQLite Backup and Recovery Boundaries](/concepts/sqlite-backup-and-recovery-boundaries.md)
- [Deno Permission Boundaries](/concepts/deno-permission-boundaries.md)
