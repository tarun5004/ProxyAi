import type { ClientSession, QueryFilter } from "mongoose";

import { AuditLogModel } from "./audit.model.js";
import type {
    AuditBrowseFilter,
    AuditBrowseResult,
    AuditExportFilter,
    AuditLog,
    AuditLogDocument,
    NewAuditLog,
} from "./audit.types.js";

export interface AuditRepository {
    append(input: NewAuditLog, session?: ClientSession): Promise<AuditLogDocument>;
    listForBrowse(input: AuditBrowseFilter): Promise<AuditBrowseResult>;
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
    async listForBrowse(input) {
        const documents = await AuditLogModel.find({
            orgId: input.orgId,
            occurredAt: { $gte: input.dateFrom, $lte: input.dateTo },
            ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
            ...(input.action === undefined ? {} : { action: input.action }),
            ...(input.cursor === undefined ? {} : {
                $or: [
                    { occurredAt: { $lt: input.cursor.occurredAt } },
                    {
                        occurredAt: input.cursor.occurredAt,
                        auditId: { $lt: input.cursor.auditId },
                    },
                ],
            }),
        })
            .select({
                _id: 0,
                __v: 0,
                orgId: 0,
                ipAddress: 0,
                userAgent: 0,
            })
            .sort({ occurredAt: -1, auditId: -1 })
            .limit(input.limit + 1)
            .lean<AuditBrowseResult["items"]>()
            .exec();

        return {
            items: documents.slice(0, input.limit),
            hasMore: documents.length > input.limit,
        };
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
            ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
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
