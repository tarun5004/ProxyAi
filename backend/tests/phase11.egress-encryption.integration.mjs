import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { applyAuthTestEnvironment } from "./helpers/test-env.mjs";

applyAuthTestEnvironment();
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "fatal";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI = process.env.PHASE11_A4_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_phase11_a4_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const [
    mongoModule,
    auditModelModule,
] = await Promise.all([
    import("../dist/shared/lib/mongo.js"),
    import("../dist/features/audit/audit.model.js"),
]);

const { connectMongo, disconnectMongo } = mongoModule;
const { AuditLogModel } = auditModelModule;

test.before(async () => {
    await connectMongo();
    await AuditLogModel.db.dropDatabase();
    await AuditLogModel.init();
});

test.after(async () => {
    await AuditLogModel.db.dropDatabase();
    await disconnectMongo();
});

test("AuditLog rejects replacement and bulk mutation bypasses", async () => {
    const record = await AuditLogModel.create({
        orgId: randomUUID(),
        actorType: "SYSTEM",
        action: "auth.login_failed",
        outcome: "FAILURE",
        resourceType: "AUTH_SESSION",
        metadata: { reasonCode: "USER_NOT_FOUND" },
        requestId: randomUUID(),
    });

    await assert.rejects(
        AuditLogModel.findOneAndReplace(
            { auditId: record.auditId },
            { ...record.toObject(), outcome: "SUCCESS" },
        ),
        /append-only/,
    );
    await assert.rejects(
        AuditLogModel.bulkWrite([{
            updateOne: {
                filter: { auditId: record.auditId },
                update: { $set: { outcome: "SUCCESS" } },
            },
        }]),
        /append-only/,
    );
    await assert.rejects(
        AuditLogModel.bulkWrite([{
            deleteOne: {
                filter: { auditId: record.auditId },
            },
        }]),
        /append-only/,
    );

    const persisted = await AuditLogModel.findOne({
        auditId: record.auditId,
    }).lean();

    assert.equal(persisted?.outcome, "FAILURE");
});
