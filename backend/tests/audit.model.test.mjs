import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import "./helpers/test-env.mjs";

const { AuditLogModel } = await import("../dist/features/audit/audit.model.js");
const { buildAuditMetadata } = await import("../dist/features/audit/audit.metadata.js");
const { buildAuditCsv } = await import("../dist/features/audit/audit.export.service.js");

test("audit metadata is action-specific and rejects unknown fields", () => {
    assert.deepEqual(buildAuditMetadata("user.role_changed", {
        oldRole: "EMPLOYEE",
        newRole: "ORG_ADMIN",
    }), { oldRole: "EMPLOYEE", newRole: "ORG_ADMIN" });
    assert.throws(() => buildAuditMetadata("user.role_changed", {
        oldRole: "EMPLOYEE",
        newRole: "ORG_ADMIN",
        password: "sentinel",
    }));
});

test("AuditLog schema rejects update and delete operations", async () => {
    const orgId = randomUUID();

    await assert.rejects(
        AuditLogModel.updateOne({ orgId }, { $set: { outcome: "FAILURE" } }),
        /append-only/,
    );
    await assert.rejects(AuditLogModel.deleteMany({ orgId }), /append-only/);
});

test("audit CSV neutralizes spreadsheet formulas and omits sensitive content", () => {
    const csv = buildAuditCsv([{
        auditId: randomUUID(),
        orgId: randomUUID(),
        actorType: "SYSTEM",
        action: "auth.login_failed",
        outcome: "FAILURE",
        resourceType: "AUTH_SESSION",
        resourceId: "=HYPERLINK(\"https://example.test\")",
        metadata: { reasonCode: "INVALID_CREDENTIALS" },
        requestId: randomUUID(),
        occurredAt: new Date("2026-08-21T00:00:00.000Z"),
    }]);

    assert.match(csv, /'=HYPERLINK/);
    assert.doesNotMatch(csv, /password|prompt|response|tokenHash/i);
});
