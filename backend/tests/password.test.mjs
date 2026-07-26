import assert from "node:assert/strict";
import test from "node:test";

import {
    hashPassword,
    PasswordVerificationError,
    validateNewPassword,
    verifyPassword,
} from "../dist/shared/security/password.js";

const FIFTEEN_CODE_POINTS = "correct horse battery";
const ONE_HUNDRED_TWENTY_EIGHT_CODE_POINTS = "a".repeat(128);

test("new-password validation enforces Unicode code-point boundaries", () => {
    assert.equal(
        validateNewPassword("a".repeat(15)),
        "a".repeat(15),
    );
    assert.equal(
        validateNewPassword(ONE_HUNDRED_TWENTY_EIGHT_CODE_POINTS),
        ONE_HUNDRED_TWENTY_EIGHT_CODE_POINTS,
    );
    assert.equal(
        validateNewPassword("😀".repeat(15)),
        "😀".repeat(15),
    );

    assert.throws(
        () => validateNewPassword("a".repeat(14)),
        /at least 15 Unicode code points/,
    );
    assert.throws(
        () => validateNewPassword("a".repeat(129)),
        /at most 128 Unicode code points/,
    );
});

test("hashing rejects passwords outside the new-password policy", async () => {
    await assert.rejects(
        hashPassword("a".repeat(14)),
        /at least 15 Unicode code points/,
    );
    await assert.rejects(
        hashPassword("a".repeat(129)),
        /at most 128 Unicode code points/,
    );
});

test("new-password validation normalizes NFC without trimming or casing", () => {
    const decomposed = `${"e\u0301".repeat(15)} Mixed Case `;
    const expected = decomposed.normalize("NFC");

    assert.equal(validateNewPassword(decomposed), expected);
    assert.equal(expected.startsWith("é"), true);
    assert.equal(expected.endsWith(" Mixed Case "), true);
});

test("Argon2id hashes use approved parameters and random salts", async () => {
    const firstHash = await hashPassword(FIFTEEN_CODE_POINTS);
    const secondHash = await hashPassword(FIFTEEN_CODE_POINTS);
    const parameters = firstHash.split("$")[3];

    assert.match(firstHash, /^\$argon2id\$/);
    assert.notEqual(parameters, undefined);
    assert.match(parameters, /(?:^|,)m=19456(?:,|$)/);
    assert.match(parameters, /(?:^|,)t=2(?:,|$)/);
    assert.match(parameters, /(?:^|,)p=1(?:,|$)/);
    assert.notEqual(firstHash, secondHash);
    assert.equal(firstHash.includes(FIFTEEN_CODE_POINTS), false);
});

test("verification accepts the correct password and rejects mismatches", async () => {
    const password = " Password With Spaces ";
    const hash = await hashPassword(password);

    assert.equal(await verifyPassword(hash, password), true);
    assert.equal(await verifyPassword(hash, password.trim()), false);
    assert.equal(await verifyPassword(hash, password.toLowerCase()), false);
});

test("canonically equivalent NFC passwords verify consistently", async () => {
    const composed = `${"é".repeat(15)} secure`;
    const decomposed = `${"e\u0301".repeat(15)} secure`;
    const hash = await hashPassword(composed);

    assert.equal(await verifyPassword(hash, decomposed), true);
});

test("verification enforces only the defensive maximum", async () => {
    const shortPassword = "short";
    const storedHash = await hashPassword(FIFTEEN_CODE_POINTS);

    assert.equal(await verifyPassword(storedHash, shortPassword), false);
    await assert.rejects(
        verifyPassword(storedHash, "a".repeat(129)),
        /at most 128 Unicode code points/,
    );
});

test("malformed and unsupported hashes produce safe operational errors", async () => {
    const candidate = "SENTINEL_CANDIDATE_PASSWORD";
    const malformedHash = "$argon2id$SENTINEL_MALFORMED_HASH";
    const unsupportedHash = "$argon2i$SENTINEL_UNSUPPORTED_HASH";

    for (const storedHash of [malformedHash, unsupportedHash]) {
        await assert.rejects(
            verifyPassword(storedHash, candidate),
            (error) => {
                assert.equal(error instanceof PasswordVerificationError, true);
                assert.equal(error.isOperational, true);
                assert.equal(error.code, "PASSWORD_VERIFICATION_FAILED");
                assert.equal(error.message.includes(candidate), false);
                assert.equal(error.message.includes(storedHash), false);

                return true;
            },
        );
    }
});

test("validation errors never include the rejected password", () => {
    const rejectedPassword = "SENTINEL_SHORT";

    assert.throws(
        () => validateNewPassword(rejectedPassword),
        (error) => {
            assert.equal(String(error).includes(rejectedPassword), false);

            return true;
        },
    );
});
