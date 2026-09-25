# Searcher v1 — Product Specification

## 1. 产品定位

Searcher 是一个中文个人搜索主页 / 起始页 Web App。

首页以搜索框为唯一第一视觉焦点，并在登录后提供：

- Web App / 常用网站
- Markdown 便签
- AI 问答
- 外观与壁纸
- 跨设备同步
- OpenAI-Compatible Provider
- 管理后台

Searcher 不应演变为传统 Dashboard，也不应默认变成 AI Chat 首页。

---

## 2. 核心原则

### 2.1 Search First
搜索框始终是首页第一视觉焦点。

### 2.2 Personal, not Dashboard
Web App、便签和个性化功能围绕搜索存在。

### 2.3 Local-first Deployment
核心功能只依赖 Deno + SQLite + Local filesystem。

### 2.4 Explicit AI
AI 是显式切换的问答模式，不自动介入普通搜索。

### 2.5 No Silent Data Loss
任何草稿、冲突、同步失败、Session 失效、版本恢复都不能静默导致数据丢失。

---

## 3. 用户类型

### 3.1 访客

允许：
- 普通搜索
- Google / Bing / 百度 / DuckDuckGo 切换
- 搜索建议
- 外观设置、壁纸
- 搜索结果打开方式
- 当前设备搜索引擎资源连接检测
- 本地偏好

禁止：
- Web App 收藏
- 便签
- AI 问答
- 管理后台

### 3.2 登录用户

增加：
- Web App 收藏、分组、排序、固定首页
- Markdown 便签、版本历史、固定主页
- AI 问答、历史、重新生成
- 用户级 AI Provider
- 跨设备偏好与壁纸
- 登录设备管理

### 3.3 管理员

增加：
- 用户管理
- 系统 AI Provider
- 模型可见性
- 系统设置
- 审计日志
- 配置导入/导出
- 完整备份/恢复

管理员 UI 不提供读取用户私人便签正文、AI 对话正文或私人收藏内容的浏览能力。

---

## 4. 首页

页面本身即搜索页。

右上角：
- Theme 快捷切换
- Settings
- Avatar / Login

底部仅保留：
- Web App
- Notes

不增加 Home Tab。

---

## 5. 搜索

### 5.1 内置引擎
- Google
- Bing
- 百度
- DuckDuckGo

内部采用可扩展配置模型：
- id
- name
- icon_asset_id
- search_url_template
- resource_check_config
- enabled
- sort_order

### 5.2 搜索模板
`search_url_template` 必须包含 `{query}`。系统负责 URL encode、协议校验和危险 URL 拒绝。

### 5.3 模式
启动默认普通搜索。临时切换引擎不修改默认引擎。只有 Settings 或“设为默认”才改变默认搜索引擎。

### 5.4 快捷命令
仅输入起始位置识别：`/g`、`/b`、`/ba`、`/d`、`/ai`。

### 5.5 快捷键
- `/` → 聚焦搜索框
- `Cmd/Ctrl + K` → 聚焦搜索框
- `Enter` → 按用户默认打开方式
- `Cmd/Ctrl + Enter` → 强制新标签页
- `Esc` → 关闭菜单/弹层
- `↑ / ↓` → 菜单导航

### 5.6 搜索建议
来源：
- Google suggestion adapter
- Bing suggestion adapter
- 本地搜索历史
- Web App 名称
- Web App URL

外部 suggestion provider 失败必须静默降级。

### 5.7 搜索历史
访客默认不保存。登录用户默认关闭，可开启。普通搜索历史与 AI 历史分开。

---

## 6. 搜索引擎资源连接检测

仅客户端执行，服务端不检测，结果保存于 IndexedDB。

显示：
```text
Google       ●
Bing         ●
百度         ●
DuckDuckGo   ●
```

- 绿：最近检测到资源可连接
- 红：最近检测未成功

资源可连接不等于搜索服务可用。

Hover / details 可显示最近检测时间和 latency。菜单底部提供“重新检测”，支持并发全部检测与单引擎检测。

---

## 7. AI 问答

### 7.1 权限
访客不可使用，登录用户可使用。

### 7.2 与搜索共用输入框
普通模式：`[Engine ▼] [Search Input] [Search]`

AI 模式：`[AI ▼] [Model ▼] [Question Input] [Send]`

### 7.3 AI 页面
独立路由。Desktop：History Sidebar + Conversation + Provider/Model + New Chat。Mobile：History 使用 Drawer。

### 7.4 历史
支持保存、删除、搜索、重命名、关闭历史记录。按今天 / 昨天 / 最近 7 天 / 更早分组。

关闭历史时，当前会话仍支持上下文，但新建/关闭后不进入长期历史。

### 7.5 消息
Assistant：Copy、Regenerate。User：Copy。

不支持编辑 User Message 后创建分支。Regenerate 创建 Assistant Variant，不覆盖原回复。

### 7.6 输出
支持 Markdown、Table、Code block、Syntax highlight、Copy、Streaming。中断保留已有内容。

### 7.7 模型切换
允许对话中切换模型。旧消息保留当时 Provider / Model metadata。Provider / Model 失败时禁止偷偷自动切换。

---

## 8. AI Provider

### 8.1 类型
- System Provider
- User Provider

允许多个。

### 8.2 OpenAI-Compatible
v1 主要支持 `GET /models` 和 `POST /chat/completions`。

### 8.3 模型发现
Model ID 必须来自 `/models`。若 `/models` 获取失败，不允许手工输入 model id，Provider 不可用于 AI 问答。

### 8.4 Model Metadata
- model_id
- display_name
- enabled
- visible_to_users
- is_default
- supports_text
- supports_vision
- supports_tools
- supports_streaming

### 8.5 默认模型
优先级：用户默认模型 → 系统默认模型 → 当前第一个可用模型。无可用模型时显示“未配置模型”。

### 8.6 高级参数
默认隐藏 temperature / top_p / max_tokens，折叠在高级设置中。普通用户主要看到“简洁 / 标准 / 详细”。

### 8.7 API Key
所有 AI 请求必须经过 Searcher Backend。浏览器不获取完整 Key。Key 服务端加密存储、UI 掩码显示、API 不返回明文。

---

## 9. Web App

### 9.1 能力
登录用户支持添加、查看、编辑、删除、排序、分组、固定首页、访问。

### 9.2 分组
支持创建、重命名、排序、删除。每个 Web App 最多一个分组，也可不属于任何分组。`group_id = null` 表示未分组。删除分组时 Web App 迁移到未分组。

### 9.3 首页固定
独立 `is_pinned`。首页只显示 pinned，不显示分组标题，支持独立排序。

推荐显示：Desktop 8–12，Mobile 4–8。用户可设 8 / 12 / 16 / 全部。

### 9.4 打开方式
每个 Web App 可 follow global / current page / new tab。

### 9.5 重复 URL
发现重复时提示，但允许继续添加。

### 9.6 URL 修改
修改 URL 后不自动覆盖自定义 Icon，提示是否重新抓取站点图标。

---

## 10. Web App Icon

优先级建议：apple-touch-icon → manifest icons → link rel=icon → favicon.ico → 其他合适资源。

图标获取后本地化存储。

支持网站资源、上传图片、图片 URL、AI 生成。

AI Logo：用户主动触发、2–4 个候选、多风格，不宣称“AI 生成官方 Logo”。SVG 必须 sanitize。

---

## 11. 便签

### 11.1 Markdown
支持 Heading、Bold、Italic、List、Quote、Code、Code block、Link、Task List、External image URL。

禁止 arbitrary raw HTML、script、iframe、javascript:、inline event handlers。

### 11.2 标题
可为空。无标题时 UI 使用正文首段生成 preview title，数据库 title 保持 null/empty。

### 11.3 置顶与固定主页
独立：`is_pinned` 与 `is_home_fixed`。

### 11.4 Desktop 固定便签
自由拖动、允许重叠、点击提升 z-index、展开/收起、自适应内容、搜索框区域软避让。

### 11.5 Mobile 固定便签
Grid / List / vertical，不使用 Desktop absolute x/y。

### 11.6 自动保存
Input → IndexedDB Draft 立即保存 → 停止输入约 3 秒 → 同步服务器。

Cmd/Ctrl+S、blur、切换便签、关闭 editor 可立即同步。

### 11.7 保存反馈
避免高频闪烁。慢保存才显示 Saving；成功弱提示 Saved；失败明显显示 Unsynced/Error。

### 11.8 Session 失效
停止服务端同步，Local Draft 保留，允许复制草稿，重新登录后进行版本比较。

### 11.9 冲突
使用 optimistic concurrency。冲突 UI 同时显示 Cloud Version 与 Local Draft，并提供 Copy Draft / Use Cloud / Overwrite Cloud / Merge & Save。禁止静默覆盖。

### 11.10 版本历史
需要历史版本，但不为每次自动保存永久建立版本。采用时间窗口快照。恢复旧版本时，当前版本保存为历史，旧版本复制为新的 current version。

### 11.11 全文搜索
SQLite FTS5 索引 title + body。结果显示 title、snippet、updated time。

---

## 12. 外观

### Theme
- System
- Light
- Dark

### Style
- Searcher / Quiet
- Minimal
- Glass
- Soft
- Classic

### Search Shape
- Rounded
- Pill

### Accent
建议 Blue、Cyan、Teal、Violet、Orange、Mono。默认不使用 Green / Red 作为 Accent，因为 Green 已用于 reachability success，Red 用于 error / unreachable。

### Wallpaper
支持 Solid、Gradient、Image、Upload。

渲染：Wallpaper → Blur → Grayscale → Mask → UI。

访客本地保存；登录用户跨设备同步。

---

## 13. 设置

路由 `/settings`。

模块：Search、Appearance、AI、Account、Data & Sync。

Desktop：Left nav + Right content。Mobile：一级列表 + 二级页。

即时保存：Theme、Style、Default Search Engine、Open Mode。

显式保存：API URL、API Key、Password。

---

## 14. 登录与账户

支持 username + password、email + password。

- username required + unique
- email optional + unique when present
- display_name non-unique

v1 不要求 email verification，无 SMTP 时无邮件找回密码。

Session：normal 7 days，remember me 30 days。

设备管理：当前设备、创建时间、最近活动、Logout this device、Logout other devices。

---

## 15. 管理后台

路由 `/admin`。

模块：Overview、Users、AI Providers、System Settings、Audit Log、Backup / Restore。

User Management：Search、Create、Enable、Disable、Reset Password、Delete。

Reset Password：invalidate all sessions + force password change after login。

Disable User：invalidate sessions + keep data。

Delete User：two-stage + confirmation + soft delete / pending cleanup。

---

## 16. 审计

记录：Create User、Enable / Disable、Reset Password、Provider changes、Backup restore。

不记录 password、API key、note body、AI conversation body。

默认保留 90 天，可配置。

---

## 17. 删除与回收站

Web App / Notes：soft delete + immediate Undo + 30-day trash。

入口：Data & Sync → Trash。

支持 Restore / Delete Permanently / Empty Trash。

AI conversation：short Undo，不进入通用 Trash。

---

## 18. 弱离线

可继续：已加载 UI、本地便签草稿、普通搜索、已缓存 Web App。

不可用：AI、服务端同步、管理后台写入。

v1 不做完整 offline-first PWA。

---

## 19. v1 非目标

- 编辑历史 User AI Message 并分支
- AI 文件分析
- Artifact workspace
- 复杂团队组织权限
- 多层嵌套收藏分组
- 第三方云基础设施作为必需依赖
