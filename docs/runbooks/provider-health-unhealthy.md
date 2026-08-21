# Provider Health Unhealthy Incident Runbook

## Symptom

`proxiai_provider_health_state{provider="groq",state="UNHEALTHY"}` remains `1`.
The scheduled provider-health worker has received an explicit unhealthy result;
the routing gate skips only this state. `UNKNOWN` is observable but does not
trigger this incident.

## Trigger

- Provider health remains explicitly `UNHEALTHY` for more than two minutes.
- The approved Groq-only production chain has no healthy candidate.

## Severity

**SEV-3** for a sustained health-check failure without user impact. Raise to
**SEV-2** when chat requests cannot reach the Groq-only provider chain.

## Immediate Checks

1. Confirm the environment is not intentionally in demo `soft-stop` or
   `deep-stop`; intentional shutdown is not a provider incident.
2. Compare provider health, circuit, request, error, and retry metrics.
3. Confirm the provider-health worker heartbeat and health-check queue are
   healthy before attributing the state to Groq.
4. Check Groq's official service status without exposing credentials or raw SDK
   data.

## Investigation Sequence

1. Record the deployment SHA, provider label, first unhealthy time, and worker
   heartbeat state.
2. Inspect safe `provider.health.updated` events and bounded normalized errors;
   never inspect or copy prompts, responses, headers, API keys, or raw provider
   errors into incident notes.
3. Verify Redis connectivity and the 120-second provider-health TTL.
4. Verify the scheduled 60-second health job is active and not retained in the
   failed set.
5. Confirm `GROQ_MODEL` remains approved and the runtime secret key exists
   without printing either value.
6. Check runtime DNS/TLS/egress and whether the current release changed health
   mapping or scheduling.

## Safe Recovery

- Restore worker scheduling, Redis access, runtime egress, or validated provider
  configuration as indicated by evidence.
- Allow the next scheduled health check to update Redis naturally.
- Verify the state changes to `HEALTHY`, then run one controlled ALLOW stream.
- Do not force `HEALTHY`, bypass the routing gate, or invent a second provider.

## Rollback Guidance

Roll back the immutable worker/API image only when the release changed health
checks, state mapping, or networking. Do not edit Redis health state manually to
hide an outage.

## Escalation

Escalate sustained provider-side failures to Groq support using timestamps and
approved provider-safe metadata only. Escalate internally when the Groq-only
chain causes a chat outage.

## False Positives

- A controlled provider-health failure exercise.
- Intentional demo `deep-stop` or network maintenance.
- A stale dashboard view after the Redis health key has already expired to
  `UNKNOWN`.
