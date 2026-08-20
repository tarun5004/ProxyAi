# Provider Circuit Open Incident Runbook

## Symptom

`proxiai_provider_circuit_state{provider="groq",state="OPEN"}` is `1`, provider
errors/retries rise, and chat requests may return `PROVIDER_UNAVAILABLE`. Only
the currently approved production provider, `groq`, is expected.

## Trigger

- Circuit remains `OPEN` for more than two minutes.
- All enabled production candidates are unavailable for a sustained period.

## Severity

- **SEV-3:** one provider circuit open while an approved alternative remains.
- **SEV-1/SEV-2:** all enabled production providers unavailable, depending on
  duration and user impact. With the current Groq-only production chain, a
  sustained open circuit is a direct chat outage.

## Likely Causes

- Provider timeout, rate limiting, transient `5xx`, or service outage.
- Invalid provider credentials/model configuration.
- Runtime egress/DNS/TLS failure.
- A release regression in provider request mapping.

## Immediate Checks

1. Confirm the API itself was not intentionally stopped; demo `soft-stop` or
   `deep-stop` is expected service unavailability, not a production provider
   incident.
2. Check provider circuit, health, error-category, retry, and request metrics.
3. Confirm policy-blocked requests did not increment provider metrics.
4. Check the provider's official status and safe application error categories.

## Investigation Sequence

1. Record provider label, circuit transition time, deployment SHA, and whether
   Redis provider health is `HEALTHY`, `UNHEALTHY`, or `UNKNOWN`.
2. Inspect `provider.circuit.opened`, retry, health, and request-failed events;
   never inspect/log raw SDK request, response, headers, or API key.
3. Determine the normalized category: `timeout`, `rate_limit`,
   `authentication`, `invalid_request`, `unavailable`, or `provider_error`.
4. Check whether the failure threshold (five consecutive availability failures)
   opened the in-process breaker and whether the 30-second cooldown permits a
   bounded half-open trial.
5. Verify `GROQ_MODEL` remains present in the approved capability registry and
   the secret key exists without printing either secret material or SDK body.
6. Check network egress and provider status. Compare behavior with the previous
   immutable release if the incident started at deployment.
7. Confirm no unapproved second provider, retry loop, or manual circuit reset was
   introduced.

## Safe Recovery

- Correct validated credentials/model configuration or restore network access.
- Allow the breaker cooldown and single half-open trial to recover naturally.
- Roll back the adapter release when mapping behavior caused the incident.
- Verify a controlled ALLOW chat stream, provider success metrics, and circuit
  transition back to `CLOSED`.

## Rollback Guidance

Use immutable application image rollback only for an application regression.
Do not repeatedly restart processes to erase in-memory breaker state, increase
retry limits, or bypass the circuit; those actions can amplify provider load and
paid calls.

## Escalation

Escalate authentication failures to secret/config owners and sustained provider
outages to Groq support using timestamps and provider-safe request identifiers
only when approved. Notify service owners when the Groq-only chain leaves chat
unavailable.

## False Positives

- Expected circuit opening during a controlled provider-failure exercise.
- A brief `OPEN` state that recovers within cooldown and does not pass the alert
  duration.
- API/NAT shutdown during intentional demo deep stop; validate infrastructure
  state before attributing the outage to Groq.
