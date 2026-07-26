import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const { TeamModel } = await import(
    "../dist/features/teams/team.model.js"
);

function validTeam(overrides = {}) {
    return {
        orgId: randomUUID(),
        name: "Platform Engineering",
        createdBy: randomUUID(),
        ...overrides,
    };
}

async function assertValidationFailure(input, path) {
    await assert.rejects(
        new TeamModel(input).validate(),
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
        document = new TeamModel(input);
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

test("valid team receives safe defaults and a UUID v4", async () => {
    const team = new TeamModel(
        validTeam({
            name: "  Platform Engineering  ",
        }),
    );

    await team.validate();

    assert.match(
        team.teamId,
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.equal(team.name, "Platform Engineering");
    assert.equal(team.nameNormalized, "platform engineering");
    assert.equal(team.isActive, false);
});

test("orgId and teamId are required immutable UUID identifiers", async () => {
    await assertValidationFailure(
        validTeam({
            orgId: undefined,
        }),
        "orgId",
    );
    await assertValidationFailure(
        validTeam({
            orgId: "not-a-uuid",
        }),
        "orgId",
    );

    assert.equal(TeamModel.schema.path("orgId").options.immutable, true);
    assert.equal(TeamModel.schema.path("teamId").options.immutable, true);
});

test("team name and creator constraints reject invalid values", async () => {
    await assertValidationFailure(
        validTeam({
            name: "   ",
        }),
        "name",
    );
    await assertValidationFailure(
        validTeam({
            name: "x".repeat(101),
        }),
        "name",
    );
    await assertValidationFailure(
        validTeam({
            createdBy: "not-a-uuid",
        }),
        "createdBy",
    );
});

test("nameNormalized stays internal during serialization", async () => {
    const team = new TeamModel(validTeam());

    await team.validate();

    assert.equal(
        TeamModel.schema.path("nameNormalized").options.select,
        false,
    );
    assert.equal("nameNormalized" in team.toJSON(), false);
    assert.equal("nameNormalized" in team.toObject(), false);
});

test("unknown team fields fail strict validation", async () => {
    await assertStrictFailure(
        validTeam({
            memberIds: [randomUUID()],
        }),
    );
});

test("team schema declares only approved indexes and collection", () => {
    assert.equal(TeamModel.collection.collectionName, "teams");
    assert.deepEqual(
        TeamModel.schema.indexes(),
        [
            [
                {
                    teamId: 1,
                },
                {
                    name: "uniq_teams_team_id",
                    unique: true,
                },
            ],
            [
                {
                    orgId: 1,
                    nameNormalized: 1,
                },
                {
                    name: "uniq_teams_org_name_normalized",
                    unique: true,
                },
            ],
            [
                {
                    orgId: 1,
                    isActive: 1,
                },
                {
                    name: "idx_teams_org_active",
                },
            ],
        ],
    );
});
