import assert from "node:assert/strict";
import test from "node:test";

const { buildBoundedProviderHistory } = await import(
    "../dist/features/chat/chat-context.js"
);

test("history keeps complete recent pairs and omits blocked pairs", () => {
    const messages = [{
        requestId: "allowed",
        role: "user",
        content: "allowed question",
    }, {
        requestId: "allowed",
        role: "assistant",
        content: "allowed answer",
    }, {
        requestId: "blocked",
        role: "user",
        content: "blocked sentinel",
    }, {
        requestId: "blocked",
        role: "assistant",
        content: "must not escape with blocked history",
    }];

    const history = buildBoundedProviderHistory({
        messages,
        sanitizeUserContent: (content) => content.includes("blocked") ? null : content,
    });

    assert.deepEqual(history, [{ role: "user", content: "allowed question" }, {
        role: "assistant",
        content: "allowed answer",
    }]);
});

test("history drops older pairs instead of splitting a pair at the bound", () => {
    const messages = [{
        requestId: "older",
        role: "user",
        content: "older question",
    }, {
        requestId: "older",
        role: "assistant",
        content: "older answer",
    }, {
        requestId: "newer",
        role: "user",
        content: "new question",
    }, {
        requestId: "newer",
        role: "assistant",
        content: "new answer",
    }];

    const history = buildBoundedProviderHistory({
        messages,
        sanitizeUserContent: (content) => content,
        maxEstimatedTokens: 40,
    });

    assert.deepEqual(history, [{ role: "user", content: "new question" }, {
        role: "assistant",
        content: "new answer",
    }]);
});
