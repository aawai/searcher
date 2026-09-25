# Searcher v1 — Data Model

## 基线

- SQLite
- Drizzle ORM
- WAL
- FTS5
- Local filesystem for binary assets

现有后台架构已可用，认证、用户、角色、Session 表优先复用现有实现。

## 1. search_engines

```text
id
name
icon_asset_id nullable
search_url_template
resource_check_config_json
enabled
sort_order
created_at
updated_at
```

`search_url_template` 必须包含 `{query}`。Reachability 不存服务端。

## 2. user_preferences

```text
user_id
default_search_engine_id
search_open_mode
search_history_enabled
ai_default_provider_id nullable
ai_default_model_id nullable
ai_history_enabled
theme
style
accent
search_shape
webapp_icon_size
homepage_webapp_limit
wallpaper_asset_id nullable
wallpaper_mask
wallpaper_grayscale
wallpaper_blur
ai_sidebar_collapsed
settings_json
updated_at
```

## 3. webapp_groups

```text
id
user_id
name
sort_order
created_at
updated_at
```

未分组不建立实体。

## 4. webapps

```text
id
user_id
name
url
group_id nullable
icon_asset_id nullable
icon_source
is_pinned
sort_order
pinned_sort_order
open_mode
deleted_at nullable
created_at
updated_at
```

open_mode：global / current / new_tab。

## 5. notes

```text
id
user_id
title nullable
current_body
current_version
color
is_pinned
is_home_fixed
sort_order
deleted_at nullable
created_at
updated_at
```

## 6. note_layouts

```text
id
note_id
user_id
device_class
x nullable
y nullable
width nullable
z_index
expanded
sort_order nullable
updated_at
```

device_class：desktop / tablet / mobile。Mobile 不使用 x/y。

## 7. note_versions

```text
id
note_id
user_id
version
title nullable
body
reason
created_at
```

reason：snapshot / manual / conflict_resolution / restore / system。

## 8. notes_fts

```sql
CREATE VIRTUAL TABLE notes_fts USING fts5(
  note_id UNINDEXED,
  user_id UNINDEXED,
  title,
  body
);
```

## 9. assets

```text
id
owner_user_id nullable
scope
relative_path
mime_type
byte_size
sha256
width nullable
height nullable
metadata_json
created_at
deleted_at nullable
```

scope：webapp_icon / wallpaper / ai_generated_icon / uploaded_icon / other。

业务表引用 asset_id，不直接散落 filesystem path。

## 10. Asset Dedup

SHA-256 去重。相同内容允许共享物理文件，权限与引用仍在 DB 层独立管理。

## 11. ai_providers

```text
id
owner_user_id nullable
scope
name
base_url
encrypted_api_key
enabled
created_at
updated_at
```

scope：system / user。

## 12. ai_models

```text
id
provider_id
model_id
display_name
enabled
visible_to_users
is_default
supports_text
supports_vision
supports_tools
supports_streaming
metadata_json
updated_at
```

Model ID 必须来自 `/models`。

## 13. ai_conversations

```text
id
user_id
title
history_enabled
deleted_at nullable
created_at
updated_at
```

关闭历史时不建立长期记录。

## 14. ai_messages

```text
id
conversation_id
parent_message_id nullable
role
content
provider_id nullable
model_id nullable
status
variant_group_id nullable
input_tokens nullable
output_tokens nullable
created_at
```

status：streaming / complete / interrupted / failed。

## 15. ai_history_fts

v1 仅索引 conversation title + user query，不全文索引所有 assistant output。

## 16. search_history

```text
id
user_id
query
engine_id
created_at
```

仅用户开启后保存。访客历史仅客户端本地。

## 17. audit_logs

```text
id
actor_user_id
action
target_type
target_id nullable
metadata_json
created_at
```

禁止记录敏感正文和密钥。

## 18. Soft Delete

Web App / Notes 使用 deleted_at，默认 30 天。AI Conversation 可 logical delete，但不进入普通 Trash UI。

## 19. Migration

```text
schema_migrations
- version
- applied_at
```

Migration 失败 → 停止新版本启动。

## 20. Repository Layer

建议：SearchEngineRepository、PreferencesRepository、WebAppRepository、WebAppGroupRepository、NoteRepository、NoteVersionRepository、AssetRepository、AIProviderRepository、AIModelRepository、AIConversationRepository、AuditRepository。

Drizzle Query 不应散落在 React 或 Route Component 中。
