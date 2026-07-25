import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const { OrganisationModel } = await import(
    "../dist/features/organisations/organisation.model.js"
);

function validOrganisation(overrides = {}) {
    return {
        name: "Example Organisation",
        slug: `example-${randomUUID()}`,
        policy: {
            maskThreshold: 20,
            blockThreshold: 60,
        },
        ...overrides,
    };
}

async function assertValidationFailure(input, path) {
    await assert.rejects(
        new OrganisationModel(input).validate(),
        (error) => {
            assert.equal(error?.name, "ValidationError");
            assert.notEqual(error?.errors?.[path], undefined);
            return true;
        },
    );
}

async function assertStrictFailure(input) {
    let document;

    try {
        document = new OrganisationModel(input);
    } catch (error) {
        assert.match(
            String(error),
            /StrictModeError|strict mode is set to throw/i,
        );
        return;
    }

    await assert.rejects(
        document.validate(),
        /StrictModeError|strict mode is set to throw/i,
    );
}

test("valid organisation receives safe defaults and a UUID v4", async () => {
    const organisation = new OrganisationModel(validOrganisation());

    await organisation.validate();

    assert.match(
        organisation.orgId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.equal(organisation.status, "SUSPENDED");
    assert.equal(organisation.plan, "FREE");
    assert.equal(organisation.monthlyTokenBudget, 0);
    assert.deepEqual(organisation.retention.toObject(), {
        mode: "METADATA_ONLY",
    });
    assert.deepEqual(organisation.featureFlags.toObject(), {
        autoRouting: false,
        teamLeadView: false,
        anomalyDetection: false,
        auditExport: false,
    });
});

test("orgId and slug are declared immutable while name remains mutable", () => {
    assert.equal(OrganisationModel.schema.path("orgId").options.immutable, true);
    assert.equal(OrganisationModel.schema.path("slug").options.immutable, true);
    assert.notEqual(OrganisationModel.schema.path("name").options.immutable, true);
});

test("status, plan, and retention mode reject unknown enum values", async () => {
    await assertValidationFailure(
        validOrganisation({
            status: "DISABLED",
        }),
        "status",
    );
    await assertValidationFailure(
        validOrganisation({
            plan: "UNLIMITED",
        }),
        "plan",
    );
    await assertValidationFailure(
        validOrganisation({
            retention: {
                mode: "CUSTOM_RETENTION",
            },
        }),
        "retention.mode",
    );
});

test("name and slug constraints reject invalid values", async () => {
    await assertValidationFailure(
        validOrganisation({
            name: " ".repeat(3),
        }),
        "name",
    );
    await assertValidationFailure(
        validOrganisation({
            name: "x".repeat(121),
        }),
        "name",
    );
    await assertValidationFailure(
        validOrganisation({
            slug: "A",
        }),
        "slug",
    );
    await assertValidationFailure(
        validOrganisation({
            slug: "Upper-Case",
        }),
        "slug",
    );
    await assertValidationFailure(
        validOrganisation({
            slug: "contains spaces",
        }),
        "slug",
    );
});

test("monthly token budget must be a non-negative safe integer", async () => {
    await assertValidationFailure(
        validOrganisation({
            monthlyTokenBudget: -1,
        }),
        "monthlyTokenBudget",
    );
    await assertValidationFailure(
        validOrganisation({
            monthlyTokenBudget: 1.5,
        }),
        "monthlyTokenBudget",
    );
    await assertValidationFailure(
        validOrganisation({
            monthlyTokenBudget: Number.MAX_SAFE_INTEGER + 1,
        }),
        "monthlyTokenBudget",
    );

    const maximumBudget = new OrganisationModel(
        validOrganisation({
            monthlyTokenBudget: Number.MAX_SAFE_INTEGER,
        }),
    );

    await maximumBudget.validate();
});

test("policy thresholds accept boundaries only when block is greater", async () => {
    for (const policy of [
        {
            maskThreshold: 0,
            blockThreshold: 1,
        },
        {
            maskThreshold: 99,
            blockThreshold: 100,
        },
    ]) {
        await new OrganisationModel(
            validOrganisation({
                policy,
            }),
        ).validate();
    }

    for (const policy of [
        {
            maskThreshold: -1,
            blockThreshold: 1,
        },
        {
            maskThreshold: 0,
            blockThreshold: 101,
        },
        {
            maskThreshold: 20,
            blockThreshold: 20,
        },
        {
            maskThreshold: 60,
            blockThreshold: 20,
        },
        {
            maskThreshold: 20.5,
            blockThreshold: 60,
        },
    ]) {
        await assert.rejects(
            new OrganisationModel(
                validOrganisation({
                    policy,
                }),
            ).validate(),
            (error) => error?.name === "ValidationError",
        );
    }
});

test("unknown top-level and nested fields fail strict validation", async () => {
    await assertStrictFailure(
        validOrganisation({
            unexpected: true,
        }),
    );
    await assertStrictFailure(
        validOrganisation({
            retention: {
                mode: "METADATA_ONLY",
                unexpected: true,
            },
        }),
    );
    await assertStrictFailure(
        validOrganisation({
            policy: {
                maskThreshold: 20,
                blockThreshold: 60,
                unexpected: true,
            },
        }),
    );
    await assertStrictFailure(
        validOrganisation({
            featureFlags: {
                unexpected: true,
            },
        }),
    );
});

test("deferred organisation fields are rejected", async () => {
    await assertStrictFailure(
        validOrganisation({
            routing: {},
        }),
    );
    await assertStrictFailure(
        validOrganisation({
            currentBillingPeriod: "2026-07",
        }),
    );
    await assertStrictFailure(
        validOrganisation({
            featureFlags: {
                advancedPiiEngine: true,
            },
        }),
    );
});

test("schema declares only the approved indexes and collection", () => {
    assert.equal(OrganisationModel.collection.collectionName, "organisations");
    assert.deepEqual(
        OrganisationModel.schema.indexes(),
        [
            [
                {
                    orgId: 1,
                },
                {
                    name: "uniq_organisations_org_id",
                    unique: true,
                },
            ],
            [
                {
                    slug: 1,
                },
                {
                    name: "uniq_organisations_slug",
                    unique: true,
                },
            ],
            [
                {
                    status: 1,
                },
                {
                    name: "idx_organisations_status",
                },
            ],
        ],
    );
});
