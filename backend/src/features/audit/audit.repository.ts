import type { ClientSession, QueryFilter } from "mongoose";

import { AuditLogModel } from "./audit.model.js";
import type {
    AuditExportFilter,
    AuditLog,
    AuditLogDocument,
    NewAuditLog,
} from "./audit.types.js";

export interface AuditRepository {
    append(input: NewAuditLog, session?: ClientSession): Promise<AuditLogDocument>;
    listForExport(input: AuditExportFilter): Promise<AuditLog[]>;
}

export const auditRepository: AuditRepository = {
    async append(input, session) {
        const documents = await AuditLogModel.create([input], {
            ...(session === undefined ? {} : { session }),
        });
        const document = documents[0];

        if (document === undefined) {
            throw new Error("Audit append failed.");
        }

        return document;
    },
    async listForExport(input) {
        const actionCondition: unknown = input.action === undefined
            ? undefined
            : input.action.endsWith(".*")
                ? { $regex: `^${escapeRegex(input.action.slice(0, -1))}` }
                : input.action;
        const filter = {
            orgId: input.orgId,
            occurredAt: { $gte: input.dateFrom, $lte: input.dateTo },
            ...(actionCondition === undefined ? {} : { action: actionCondition }),
        } as QueryFilter<AuditLog>;

        return AuditLogModel.find(filter)
            .select({ _id: 0, __v: 0 })
            .sort({ occurredAt: 1, auditId: 1 })
            .limit(input.limit)
            .lean<AuditLog[]>()
            .exec();
    },
};

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
