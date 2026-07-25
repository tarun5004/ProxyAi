import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "warn";
process.env.FRONTEND_ORIGIN ??= "http://localhost:3000";
process.env.MONGO_URI =
    process.env.ORGANISATION_TEST_MONGO_URI
    ?? "mongodb://127.0.0.1:27017/proxiai_organisation_model_test";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

const databaseName = new URL(process.env.MONGO_URI).pathname.slice(1);

assert.match(
    databaseName,
    /_test$/,
    "Organisation integration tests require a dedicated *_test database.",
);

const [
    mongooseModule,
    mongoModule,
    organisationModule,
] = await Promise.all([
    import("mongoose"),
    import("../dist/shared/lib/mongo.js"),
    import("../dist/features/organisations/organisation.model.js"),
]);

const mongoose = mongooseModule.default;
const { connectMongo, disconnectMongo } = mongoModule;
const { OrganisationModel } = organisationModule;

function validOrganisation(overrides = {}) {
    const suffix = randomUUID();

    return {
        name: `Integration Organisation ${suffix}`,
        slug: `integration-${suffix}`,
        policy: {
            maskThreshold: 20,
            blockThreshold: 60,
        },
        ...overrides,
    };
}

function isDuplicateKey(error, expectedField) {
    return error?.code === 11000
        && error?.keyPattern?.[expectedField] === 1;
}

test.before(async () => {
    await connectMongo();
    await mongoose.connection.dropDatabase();
    await OrganisationModel.init();
});

test.after(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectMongo();
});

test("real Mongo creates only the declared organisation indexes", async () => {
    const indexes = await OrganisationModel.collection.indexes();
    const indexNames = indexes
        .map((index) => index.name)
        .filter((name) => name !== "_id_")
        .sort();

    assert.deepEqual(indexNames, [
        "idx_organisations_status",
        "uniq_organisations_org_id",
        "uniq_organisations_slug",
    ]);
});

test("timestamps persist and orgId/slug remain immutable", async () => {
    const originalOrgId = randomUUID();
    const originalSlug = `immutable-${randomUUID()}`;
    const organisation = await OrganisationModel.create(
        validOrganisation({
            orgId: originalOrgId,
            slug: originalSlug,
        }),
    );

    assert.equal(organisation.createdAt instanceof Date, true);
    assert.equal(organisation.updatedAt instanceof Date, true);

    const originalName = organisation.name;
    organisation.orgId = randomUUID();
    organisation.slug = `changed-${randomUUID()}`;
    organisation.name = "Changed Organisation Name";
    await assert.rejects(
        organisation.save(),
        (error) => error?.name === "ValidationError"
            && error?.errors?.orgId !== undefined
            && error?.errors?.slug !== undefined,
    );

    let persisted = await OrganisationModel.findById(
        organisation._id,
    ).orFail();

    assert.equal(persisted.orgId, originalOrgId);
    assert.equal(persisted.slug, originalSlug);
    assert.equal(persisted.name, originalName);

    persisted.name = "Changed Organisation Name";
    await persisted.save();

    persisted = await OrganisationModel.findById(organisation._id).orFail();

    assert.equal(persisted.name, "Changed Organisation Name");
});

test("duplicate orgId fails with Mongo error code 11000", async () => {
    const orgId = randomUUID();

    await OrganisationModel.create(
        validOrganisation({
            orgId,
        }),
    );

    await assert.rejects(
        OrganisationModel.create(
            validOrganisation({
                orgId,
            }),
        ),
        (error) => isDuplicateKey(error, "orgId"),
    );
});

test("duplicate slug fails with Mongo error code 11000", async () => {
    const slug = `duplicate-${randomUUID()}`;

    await OrganisationModel.create(
        validOrganisation({
            slug,
        }),
    );

    await assert.rejects(
        OrganisationModel.create(
            validOrganisation({
                slug,
            }),
        ),
        (error) => isDuplicateKey(error, "slug"),
    );
});
