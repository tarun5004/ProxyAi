import mongoose from "mongoose";
import type { ClientSession } from "mongoose";

import { AppError } from "../../shared/errors/app-error.js";
import { auditRepository, type AuditRepository } from "./audit.repository.js";
import type { NewAuditLog } from "./audit.types.js";

export async function appendAudit(
    input: NewAuditLog,
    session?: ClientSession,
    repository: AuditRepository = auditRepository,
): Promise<void> {
    try {
        await repository.append(input, session);
    } catch {
        throw auditUnavailableError();
    }
}

export async function withAuditedTransaction<T>(
    operation: (session: ClientSession) => Promise<T>,
): Promise<T> {
    const session = await mongoose.startSession();

    try {
        let result: T | undefined;

        await session.withTransaction(async () => {
            result = await operation(session);
        });

        if (result === undefined) {
            throw auditUnavailableError();
        }

        return result;
    } catch (error: unknown) {
        if (error instanceof AppError && error.code !== "AUDIT_UNAVAILABLE") {
            throw error;
        }

        throw auditUnavailableError();
    } finally {
        await session.endSession();
    }
}

function auditUnavailableError(): AppError {
    return new AppError(
        503,
        "AUDIT_UNAVAILABLE",
        "The audited operation is temporarily unavailable.",
    );
}
