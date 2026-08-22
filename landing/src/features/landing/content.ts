export const problemStatements = [
    {
        number: "01",
        title: "Uncontrolled provider access",
        detail: "Direct AI access can bypass organisation policy, identity boundaries, and consistent operational controls.",
    },
    {
        number: "02",
        title: "Sensitive-data egress",
        detail: "Prompts may carry contact, financial, government, credential, internal-secret, or business-confidential data.",
    },
    {
        number: "03",
        title: "Missing operational evidence",
        detail: "Security and operations teams need bounded audit, usage, policy, and delivery evidence without storing raw sensitive values.",
    },
] as const;

export const lifecycleSteps = [
    "Authentication",
    "Trusted tenant and permissions",
    "Strict request validation",
    "Idempotency and rate limits",
    "Authoritative token budget",
    "PII detection, classification, and risk",
    "ALLOW / MASK / BLOCK policy",
    "Provider retry, circuit, and routing",
    "SSE response",
    "Retention, accounting, and audit",
    "BullMQ background jobs",
] as const;

export const piiCategories = [
    "CONTACT_INFO",
    "FINANCIAL",
    "GOVERNMENT_ID",
    "CREDENTIAL",
    "INTERNAL_SECRET",
    "BUSINESS_CONFIDENTIAL",
] as const;

export const policyActions = [
    {
        action: "ALLOW",
        detail: "Approved prompt continues to the configured provider path.",
        tone: "green",
    },
    {
        action: "ALLOW_WITH_MASK",
        detail: "Only the masked providerPrompt crosses the provider boundary.",
        tone: "amber",
    },
    {
        action: "BLOCK",
        detail: "The request stops before streaming; zero provider calls are made.",
        tone: "red",
    },
] as const;

export const rbacRoles = [
    {
        role: "EMPLOYEE",
        detail: "Restricted chat and own-conversation access through canonical permissions.",
    },
    {
        role: "TEAM_LEAD",
        detail: "Team-scoped capabilities only when current permissions and tenant context allow them.",
    },
    {
        role: "ORG_ADMIN",
        detail: "Tenant administration, policy, billing, audit, and user operations through audited mutations.",
    },
] as const;

export const limitations = [
    "The interactive demo may be deep-stopped and started on demand for cost control.",
    "Attachments are deferred; there is no upload or multipart API in this release.",
    "Prompt caching and completed-response replay remain deferred pending safe storage contracts.",
    "Interrupted provider usage stays unknown when the provider supplies no authoritative usage; ProxiAI never estimates it as zero.",
    "Continuous hosted metrics collection and alert delivery may be intentionally deferred while demo infrastructure is stopped.",
    "No external penetration-test or compliance certification is claimed.",
] as const;
