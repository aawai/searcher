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

视觉层级：Search Input → Pinned Web Apps → Pinned Notes → Utility / Navigation → Wallpaper。

## 3. Search Area

Desktop：`width: clamp(680px, 52vw, 1080px);`

Mobile：`width: calc(100vw - 32px);`

垂直位置约 viewport 30%–35%。

必须验证 375 / 430 / 768 / 1440 / 1920 / 2560 / 3840。

## 4. Search Input

普通：`[ Engine Logo ▼ ] [ Search Input ] [ Search ]`

AI：`[ AI ▼ ] [ Model ▼ ] [ Question Input ] [ Send ]`

同一组件支持 Quiet / Minimal / Glass / Soft / Classic，以及 Rounded / Pill。不可复制多套业务逻辑组件。

## 5. Search Engine Menu

```text
Google       ●
Bing         ●
百度         ●
DuckDuckGo   ●

重新检测
```

视觉只显示红/绿点；accessible detail 必须说明连接检测成功或未成功。Hover/tooltip 可显示 checked_at 与 latency。

## 6. Pinned Web App

手机桌面式 Icon + Label；首页不显示分组 title；支持 drag reorder。

Desktop 48–56px；Mobile 44–52px。Icon size preference：Compact / Default / Large。

## 7. Floating Notes

Desktop：独立自由层、drag、overlap、z-index、expand、search safe area。

Mobile：Grid / List / Single column，不使用绝对坐标。

## 8. Layout Edit Mode

Search 仍显示但暂不可执行；Web App 可拖动；Note 显示 drag handle；z-index 可调整；可 reset layout。

## 9. Bottom Navigation

仅：`Web App`、`Notes`。

## 10. Web App Bottom Sheet

Desktop 40% / 65% / 90%。Mobile 标准 Bottom Sheet。

内容包括 Search、All / Group / Ungrouped、App Grid、Add、Manage。每次打开默认进入 All。

Context Menu：Open、Pin/Unpin、Edit、Move Group、Change Icon、Delete。

## 11. Add Web App

Quick：URL → 自动 fetch title + icon candidates。

Advanced：Name、URL、Group、Icon、Open Mode、Pin Home。

## 12. Notes Bottom Sheet

支持 Card/List、Search、New、Pinned、Others。

Note menu：Edit、Pin List、Pin Home、Color、History、Delete。

## 13. Note Editor

Desktop：Edit / Preview / Split。Mobile：Edit / Preview，无 Split。

保存状态：Saved、Saving、Unsynced、Error。Saved 弱提示，Saving 延迟显示，Unsynced 明确但不阻塞，Error 明显。

## 14. Conflict UI

同时显示 Cloud Version 与 Local Draft。操作：Copy Draft、Use Cloud、Overwrite、Merge & Save。

## 15. AI Conversation

Desktop 左侧 History，中间 Conversation。History 默认展开，可折叠并记住状态；Mobile 使用 Drawer。

主区顶部：Provider / Model / New Chat。

消息支持 Markdown / Code / Table / Copy / Regenerate。

## 16. Settings

Desktop：左导航 + 右内容。Mobile：一级列表 → 二级页面。

## 17. Appearance

Theme：System / Light / Dark。

Style：Quiet / Minimal / Glass / Soft / Classic。

Accent：Blue / Cyan / Teal / Violet / Orange / Mono。

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

Mobile 保持 Search First、Bottom Sheet、Note Grid/List、AI Drawer、Settings 二级页。
