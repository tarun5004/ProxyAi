import { AppError } from "../../shared/errors/app-error.js";
import { OrganisationModel } from "../organisations/organisation.model.js";
import type {
    OrganisationPlan,
    OrganisationPolicy,
    RetentionMode,
} from "../organisations/organisation.types.js";
import { DEFAULT_MAX_OUTPUT_TOKENS_PER_REQUEST } from "../organisations/organisation.types.js";

export interface ChatOrganisationContext {
    readonly plan: OrganisationPlan;
    readonly policy: Readonly<OrganisationPolicy>;
    readonly autoRoutingEnabled: boolean;
    readonly retentionMode: RetentionMode;
}

interface OrganisationChatRecord {
    readonly plan: OrganisationPlan;
    readonly policy: Omit<OrganisationPolicy, "maxOutputTokensPerRequest"> & {
        readonly maxOutputTokensPerRequest?: number;
    };
    readonly featureFlags: {
        readonly autoRouting: boolean;
    };
    readonly retention: {
        readonly mode: RetentionMode;
    };
}

export async function loadChatOrganisationContext(
    orgId: string,
): Promise<ChatOrganisationContext> {
    let organisation: OrganisationChatRecord | null;

    try {
        organisation = await OrganisationModel.findOne({
            orgId,
            status: "ACTIVE",
        })
            .select({
                _id: 0,
                plan: 1,
                policy: 1,
                "featureFlags.autoRouting": 1,
                "retention.mode": 1,
            })
            .lean<OrganisationChatRecord>()
            .exec();
    } catch {
        throw new AppError(
            503,
            "DEPENDENCY_UNAVAILABLE",
            "Chat processing is temporarily unavailable.",
        );
    }

    if (organisation === null) {
        throw new AppError(
            401,
            "UNAUTHORIZED",
            "Authentication required.",
        );
    }

    return Object.freeze({
        plan: organisation.plan,
        policy: Object.freeze({
            maskThreshold: organisation.policy.maskThreshold,
            blockThreshold: organisation.policy.blockThreshold,
            maxOutputTokensPerRequest:
                organisation.policy.maxOutputTokensPerRequest
                ?? DEFAULT_MAX_OUTPUT_TOKENS_PER_REQUEST,
        }),
        autoRoutingEnabled: organisation.featureFlags.autoRouting,
        retentionMode: organisation.retention.mode,
    });
}
