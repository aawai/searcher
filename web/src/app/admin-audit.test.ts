import { assertEquals } from "@std/assert";
import { AUDIT_ACTIONS } from "@shared/contracts.ts";
import {
    AUDIT_ACTION_GROUPS,
    describeAuditAction,
    describeAuditMetadata,
    describeAuditTarget,
    parseAuditActionFilter,
} from "./admin-audit.ts";

Deno.test("audit actions: the filter offers every recorded action exactly once", () => {
    const offered = AUDIT_ACTION_GROUPS.flatMap((g) =>
        g.actions.map((a) => a.value)
    );
    assertEquals([...offered].sort(), [...AUDIT_ACTIONS].sort());
});

Deno.test("audit actions: unknown stored actions are not shown as their raw key", () => {
    assertEquals(describeAuditAction("admin.backup.restore"), {
        label: "还原备份",
        danger: true,
    });
    assertEquals(describeAuditAction("admin.legacy.thing"), {
        label: "未知操作",
        danger: false,
        rawKey: "admin.legacy.thing",
    });
    assertEquals(parseAuditActionFilter("admin.legacy.thing"), "");
});

Deno.test("audit targets: system targets are named, users by handle with their id", () => {
    assertEquals(describeAuditTarget("system", "backup", null), {
        label: "备份",
        id: null,
    });
    assertEquals(
        describeAuditTarget("user", "u-1", {
            username: "alice",
            disabled: true,
        }),
        { label: "@alice", id: "u-1" },
    );
});

Deno.test("audit metadata: localized values, columns already shown are omitted", () => {
    assertEquals(
        describeAuditMetadata({
            username: "alice",
            disabled: true,
            auditRetentionDays: 30,
            allowRegistration: false,
            defaultEngine: "baidu",
            futureKey: 1,
        }),
        [
            { label: "审计保留", value: "30 天" },
            { label: "允许访客注册", value: "否" },
            { label: "默认搜索引擎", value: "百度" },
            { label: "futureKey", value: "1" },
        ],
    );
});
