# Searcher v1 — UX / IA / Wireframe

## 1. Route IA

```text
/
├─ Search Home
│  ├─ Search
│  ├─ AI Mode Entry
│  ├─ Pinned Web Apps
│  └─ Pinned Notes
├─ /ask
├─ /settings
├─ /login
├─ /register
├─ /design-lab
└─ /admin
```

## 2. Desktop 首页

```text
┌───────────────────────────────────────────────────────────────┐
│                                       Theme Settings Avatar  │
│                                                               │
│                           Searcher                            │
│                                                               │
│           [ G ▼ ][ Search......................... ][Search]  │
│                                                               │
│              ○        ○        ○        ○                     │
│            GitHub   Figma   ChatGPT   ...                     │
│                                                               │
│      ┌──────────────┐          ┌──────────────┐               │
│      │ pinned note  │          │ pinned note  │               │
│      │ markdown...  │          │ markdown...  │               │
│      └──────────────┘          └──────────────┘               │
│                                                               │
│                      Web App     Notes                        │
└───────────────────────────────────────────────────────────────┘
```

视觉层级：Search Input → Pinned Web Apps → Pinned Notes → Utility / Navigation →
Wallpaper。

## 3. Search Area

Desktop：`width: clamp(680px, 52vw, 1080px);`

Mobile：`width: calc(100vw - 32px);`

垂直位置约 viewport 30%–35%。

必须验证 375 / 430 / 768 / 1440 / 1920 / 2560 / 3840。

## 4. Search Input

普通：`[ Engine Logo ▼ ] [ Search Input ] [ Search ]`

AI：`[ AI ▼ ] [ Model ▼ ] [ Question Input ] [ Send ]`

同一组件支持 Quiet / Minimal / Glass / Soft / Classic，以及 Rounded /
Pill。不可复制多套业务逻辑组件。

## 5. Search Engine Menu

```text
Google       ●
Bing         ●
百度         ●
DuckDuckGo   ●

重新检测
```

视觉只显示红/绿点；accessible detail 必须说明连接检测成功或未成功。Hover/tooltip
可显示 checked_at 与 latency。

## 6. Pinned Web App

手机桌面式 Icon + Label；首页不显示分组 title；支持 drag reorder。

Desktop 48–56px；Mobile 44–52px。Icon size preference：Compact / Default /
Large。

## 7. Floating Notes

Desktop：独立自由层、drag、overlap、z-index、expand、search safe area。

Mobile：Grid / List / Single column，不使用绝对坐标。

## 8. Layout Edit Mode

Search 仍显示但暂不可执行；Web App 可拖动；Note 显示 drag handle；z-index
可调整；可 reset layout。

## 9. Bottom Navigation

仅：`Web App`、`Notes`。

## 10. Web App Bottom Sheet

Desktop：少量内容时采用 760px 宽、内容驱动高度（最小 340px、最大 560px）的居中面板；内容较多时使用标准面板，均可展开全屏。Mobile：标准自适应高度 Bottom Sheet，内容过长时内部滚动。

默认浏览态提供网站搜索、添加网站、文件夹管理和明确的“整理布局”入口；进入整理态后显示操作提示及“完成整理”，拖动网站调整顺序，点击网站编辑。进入文件夹管理时隐藏浏览工具栏，使用面板标题栏返回。每次打开默认进入全部网站。

网站与小文件夹（1×1）、大文件夹（2×2）排列在同一基础栅格；名称最多展示两行。大文件夹所在网格在显示/隐藏名称、三种图标大小和窄屏下都必须满足 `2 × 列宽 + 列间距 = 2 × 行高 + 行间距`：大文件夹占位与相邻四个普通网站占位均为正方形，文件夹预览表面也为正方形，预览中的 3×3 图标距其边缘至少 8px。该网格尺寸仅作用于含大文件夹的网站面板及其拖动预览，不改变首页固定图标的尺寸和列数规则。首排仍有容纳空间时，普通网站应先填满首排，不因大文件夹占两列而提前换行。单网站缩略图使用与网站图标一致的独立底面；最多显示 3×3 预览，点图标直达网站，点背景打开完整文件夹；文件夹管理和右键菜单均可切换大小。外观设置中的“显示 Web App 名称”默认开启；关闭后顶层网站和文件夹均仅显示图标、行高同步收紧。文件夹内容面板仍显示名称。

Context Menu：Open、Pin/Unpin、Edit、Move Group、Change Icon、Delete。

## 11. Add Web App

Quick：输入 URL → 自动获取网站名称及图标，提交按钮固定在表单底部。

Advanced：名称、文件夹、首页固定与打开方式位于基础信息之后；图标显示当前预览，支持自动获取、本地上传、网络图片及 AI 生成。

## 12. Notes Bottom Sheet

支持 Card/List、Search、New、Pinned、Others。

Note menu：Edit、Pin List、Pin Home、Color、History、Delete。

## 13. Note Editor

Desktop：Edit / Preview / Split。Mobile：Edit / Preview，无 Split。

保存状态：Saved、Saving、Unsynced、Error。Saved 弱提示，Saving
延迟显示，Unsynced 明确但不阻塞，Error 明显。

## 14. Conflict UI

同时显示 Cloud Version 与 Local Draft。操作：Copy Draft、Use
Cloud、Overwrite、Merge & Save。

## 15. AI Conversation

Desktop 左侧 History，中间 Conversation。History
默认展开，可折叠并记住状态；Mobile 使用 Drawer。

主区顶部：Provider / Model / New Chat。

消息支持 Markdown / Code / Table / Copy / Regenerate。

## 16. Settings

Desktop：左导航 + 右内容。Mobile：一级列表 → 二级页面。

## 17. Appearance

Theme：System / Light / Dark。

Style：Quiet / Minimal / Glass / Soft / Classic。

Accent：Blue / Cyan / Teal / Violet / Orange / Rose / Emerald / Amber / Mono（全量 9 款预设并支持微光层次卡片）。

Search Shape：Rounded / Pill。

Wallpaper：Blur / Grayscale / Mask 实时调节。

## 18. Admin

沿用 Searcher Design System，不设计成过重企业 SaaS 控制台。

User table：User / Status / Role / Created / Last Login / Actions。

Provider：Base URL / API Key / Test / Models / Visibility / Default。

Backup：Config export/import / Full backup / Restore。

## 19. Responsive Principles

Desktop-first ≠ Desktop-only。

2K/4K 增加主内容宽度、留白、字号与间距，不无限放大控件。

Mobile 保持 Search First、Bottom Sheet、Note Grid/List、AI Drawer、Settings
二级页。
