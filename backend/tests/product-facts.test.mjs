import assert from "node:assert/strict";
import test from "node:test";

const {
    PROXIAI_PRODUCT_FACTS,
    PROXIAI_PRODUCT_FACTS_INSTRUCTION,
    buildProductAwareProviderMessages,
    isProxiAiProductQuestion,
} = await import("../dist/features/chat/product-facts.js");

const controllingQuestions = [
    "What security certifications does ProxiAI have?",
    "Does ProxiAI use HSM?",
    "Which AI providers does ProxiAI support?",
    "Does ProxiAI store all prompts and responses?",
    "Is ProxiAI SOC2 certified?",
    "Does ProxiAI support regional data residency?",
];

test("canonical product facts state the approved security and product boundaries", () => {
    assert.equal(PROXIAI_PRODUCT_FACTS.version, "1.0.0");
    assert.deepEqual(
        PROXIAI_PRODUCT_FACTS.providers.enabledProduction,
        ["Groq"],
    );
    assert.match(
        PROXIAI_PRODUCT_FACTS.compliance.statement,
        /does not claim SOC 2/,
    );
    assert.match(
        PROXIAI_PRODUCT_FACTS.keyManagement.statement,
        /HSM.*not implemented/,
    );
    assert.match(
        PROXIAI_PRODUCT_FACTS.retention.statement,
        /METADATA_ONLY stores no message content/,
    );
    assert.match(
        PROXIAI_PRODUCT_FACTS.retention.statement,
        /Plaintext content.*not persisted/,
    );
    assert.match(PROXIAI_PRODUCT_FACTS.residency.statement, /not implemented/);
    assert.match(PROXIAI_PRODUCT_FACTS_INSTRUCTION, /unknown or not implemented/);
    assert.match(PROXIAI_PRODUCT_FACTS_INSTRUCTION, /Do not infer, speculate, or invent/);
});

test("only ProxiAI self-description requests activate product grounding", () => {
    for (const question of controllingQuestions) {
        assert.equal(isProxiAiProductQuestion(question), true, question);
    }
    assert.equal(isProxiAiProductQuestion("What is ProxyAI?"), true);
    assert.equal(
        isProxiAiProductQuestion("Tell me about Proxi AI architecture."),
        true,
    );

    for (const ordinaryPrompt of [
        "Explain zero-trust networking.",
        "Summarize exactly: ProxiAI is a placeholder name.",
        "Write a TypeScript queue implementation.",
    ]) {
        assert.equal(
            isProxiAiProductQuestion(ordinaryPrompt),
            false,
            ordinaryPrompt,
        );
    }
});

test("controlling questions bind the canonical system instruction before exact user content", () => {
    for (const question of controllingQuestions) {
        const messages = buildProductAwareProviderMessages({
            originalPrompt: question,
            approvedPrompt: question,
        });

        assert.equal(messages.length, 2, question);
        assert.deepEqual(messages[0], {
            role: "system",
            content: PROXIAI_PRODUCT_FACTS_INSTRUCTION,
        });
        assert.deepEqual(messages[1], {
            role: "user",
            content: question,
        });
        assert.equal(Object.isFrozen(messages), true);
        assert.equal(Object.isFrozen(messages[0]), true);
        assert.equal(Object.isFrozen(messages[1]), true);
    }
});

test("ordinary and masked prompts preserve approved egress safely", () => {
    const ordinaryPrompt = "Explain adapter patterns.";
    const ordinaryMessages = buildProductAwareProviderMessages({
        originalPrompt: ordinaryPrompt,
        approvedPrompt: ordinaryPrompt,
    });
    const sensitiveValue = "product-owner@example.test";
    const maskedMessages = buildProductAwareProviderMessages({
        originalPrompt: `Does ProxiAI store ${sensitiveValue}?`,
        approvedPrompt: "Does ProxiAI store [EMAIL_REDACTED]?",
    });

    assert.deepEqual(
        ordinaryMessages,
        [{ role: "user", content: ordinaryPrompt }],
    );
    assert.equal(JSON.stringify(maskedMessages).includes(sensitiveValue), false);
    assert.equal(
        maskedMessages[1]?.content,
        "Does ProxiAI store [EMAIL_REDACTED]?",
    );
    assert.match(maskedMessages[0]?.content ?? "", /Markdown\/GFM only/);
    assert.match(maskedMessages[0]?.content ?? "", /Do not emit raw HTML/);
    assert.match(maskedMessages[0]?.content ?? "", /code fences/);
});
