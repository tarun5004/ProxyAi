import { AppError } from "../../shared/errors/app-error.js";
import { OrganisationModel } from "../organisations/organisation.model.js";
import { appendAudit } from "./audit.service.js";
import { buildAuditMetadata } from "./audit.metadata.js";
import { auditRepository, type AuditRepository } from "./audit.repository.js";
import type { AuditLog } from "./audit.types.js";
import type { AdminMutationContext } from "../admin/admin.mutation.service.js";

const MAX_EXPORT_ROWS = 10_000;

export async function exportOrganisationAuditCsv(
    context: AdminMutationContext,
    input: {
        readonly dateFrom: Date;
        readonly dateTo: Date;
        readonly action?: string;
    },
    repository: AuditRepository = auditRepository,
) {
    const organisation = await OrganisationModel.findOne({ orgId: context.orgId })
        .select({ _id: 0, "featureFlags.auditExport": 1 })
        .lean<{ featureFlags: { auditExport: boolean } }>()
        .exec();

    if (organisation === null) {
        throw new AppError(404, "NOT_FOUND", "Organisation not found.");
    }
    if (!organisation.featureFlags.auditExport) {
        throw new AppError(403, "FEATURE_DISABLED", "Audit export is not enabled.");
    }

    const records = await repository.listForExport({
        orgId: context.orgId,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        ...(input.action === undefined ? {} : { action: input.action }),
        limit: MAX_EXPORT_ROWS + 1,
    });

    if (records.length > MAX_EXPORT_ROWS) {
        throw new AppError(413, "EXPORT_TOO_LARGE", "Audit export exceeds the row limit.");
    }

    const csv = buildAuditCsv(records);
    await appendAudit({
        orgId: context.orgId,
        actorId: context.actorId,
        actorType: "USER",
        actorRole: context.actorRole,
        action: "audit.exported",
        outcome: "SUCCESS",
        resourceType: "AUDIT_EXPORT",
        metadata: buildAuditMetadata("audit.exported", {
            dateFrom: input.dateFrom.toISOString(),
            dateTo: input.dateTo.toISOString(),
            actionFilter: input.action ?? null,
            rowCount: records.length,
        }),
        requestId: context.requestId,
        ...(context.ipAddress === undefined ? {} : { ipAddress: context.ipAddress }),
        ...(context.userAgent === undefined ? {} : { userAgent: context.userAgent }),
    });

    return {
        csv,
        filename: `proxiai-audit-${datePart(input.dateFrom)}-to-${datePart(input.dateTo)}.csv`,
    };
}

export function buildAuditCsv(records: readonly AuditLog[]): string {
    const header = [
        "occurredAt",
        "actorId",
        "actorType",
        "action",
        "resourceType",
        "resourceId",
        "ipAddress",
        "userAgent",
        "metadata",
    ];
    const rows = records.map((record) => [
        record.occurredAt.toISOString(),
        record.actorId ?? "",
        record.actorType,
        record.action,
        record.resourceType,
        record.resourceId ?? "",
        record.ipAddress ?? "",
        record.userAgent ?? "",
        JSON.stringify(record.metadata ?? {}),
    ]);

    return [header, ...rows]
        .map((row) => row.map(csvCell).join(","))
        .join("\r\n");
}

function csvCell(value: string): string {
    const neutralized = /^[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${neutralized.replaceAll('"', '""')}"`;
}

function datePart(value: Date): string {
    return value.toISOString().slice(0, 10);
}
