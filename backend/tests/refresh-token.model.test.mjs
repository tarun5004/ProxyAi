import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

const { RefreshTokenModel } = await import(
    "../dist/features/auth/refresh-token.model.js"
);

function validRefreshToken(overrides = {}) {
    return {
        tokenId: randomUUID(),
        sessionId: randomUUID(),
        familyId: randomUUID(),
        orgId: randomUUID(),
        userId: randomUUID(),
        tokenHash: createHash("sha256")
            .update(randomUUID())
            .digest("hex"),
        expiresAt: new Date(Date.now() + 60_000),
        ...overrides,
    };
}

async function assertStrictFailure(input) {
    let document;

    try {
        document = new RefreshTokenModel(input);
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

test("valid refresh token accepts separate immutable identifiers", async () => {
    const token = new RefreshTokenModel(validRefreshToken());

    await token.validate();

    for (const path of [
        "tokenId",
        "sessionId",
        "familyId",
        "orgId",
        "userId",
        "tokenHash",
        "expiresAt",
    ]) {
        assert.equal(
            RefreshTokenModel.schema.path(path).options.immutable,
            true,
        );
    }
    assert.equal(token.tokenId === token.sessionId, false);
    assert.equal(token.sessionId === token.familyId, false);
});

test("refresh token validates UUID, hash, and replacement shapes", async () => {
    for (const [path, value] of [
        ["tokenId", "invalid"],
        ["sessionId", "invalid"],
        ["familyId", "invalid"],
        ["orgId", "invalid"],
        ["userId", "invalid"],
        ["tokenHash", "not-a-sha256-hash"],
        ["replacedByTokenId", "invalid"],
    ]) {
        await assert.rejects(
            new RefreshTokenModel(
                validRefreshToken({
                    [path]: value,
                }),
            ).validate(),
            (error) => {
                assert.notEqual(error.errors[path], undefined);
                return true;
            },
        );
    }
});

test("token hash is excluded from normal selection and serialization", async () => {
    const token = new RefreshTokenModel(validRefreshToken());

    await token.validate();

    assert.equal(
        RefreshTokenModel.schema.path("tokenHash").options.select,
        false,
    );
    assert.equal("tokenHash" in token.toJSON(), false);
    assert.equal("tokenHash" in token.toObject(), false);
});

test("raw refresh tokens and unknown fields are rejected", async () => {
    await assertStrictFailure(
        validRefreshToken({
            rawToken: "SENTINEL_RAW_REFRESH_TOKEN",
        }),
    );
});

test("refresh token schema declares approved indexes and TTL cleanup", () => {
    assert.equal(
        RefreshTokenModel.collection.collectionName,
        "refresh_tokens",
    );
    assert.deepEqual(
        RefreshTokenModel.schema.indexes(),
        [
            [
                {
                    tokenId: 1,
                },
                {
                    name: "uniq_refresh_tokens_token_id",
                    unique: true,
                },
            ],
            [
                {
                    tokenHash: 1,
                },
                {
                    name: "uniq_refresh_tokens_token_hash",
                    unique: true,
                },
            ],
            [
                {
                    orgId: 1,
                    sessionId: 1,
                },
                {
                    name: "idx_refresh_tokens_org_session",
                },
            ],
            [
                {
                    orgId: 1,
                    familyId: 1,
                },
                {
                    name: "idx_refresh_tokens_org_family",
                },
            ],
            [
                {
                    expiresAt: 1,
                },
                {
                    expireAfterSeconds: 0,
                    name: "ttl_refresh_tokens_expires_at",
                },
            ],
        ],
    );
});
