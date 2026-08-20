#!/usr/bin/env bash
set -Eeuo pipefail

request_id="${1:?request ID is required}"
root="/opt/proxiai"
release_sha="$(cat "${root}/current-release")"
release_dir="${root}/releases/${release_sha}"
temporary="$(mktemp)"
trap 'rm -f "${temporary}"' EXIT

cd "${release_dir}"
for _attempt in {1..24}; do
  docker compose --env-file release.env logs --no-color --since 15m worker \
    > "${temporary}"
  if grep -q '"event":"billing.job.completed"' "${temporary}" \
    && grep -q '"outcome":"APPLIED"' "${temporary}" \
    && grep -q '"event":"analytics.job.completed"' "${temporary}" \
    && grep -q '"event":"provider.health.updated"' "${temporary}" \
    && grep -q '"event":"async.enqueue_recovery.scan_completed"' "${temporary}" \
    && grep -q "${request_id}" "${temporary}"; then
    docker compose --env-file release.env exec -T \
      --env REQUEST_ID="${request_id}" worker \
      /usr/local/bin/node --input-type=module --eval '
        import { Queue } from "bullmq";
        import Redis from "ioredis";

        const connection = new Redis(process.env.REDIS_URL, {
          enableReadyCheck: false,
          maxRetriesPerRequest: null,
        });
        const queue = new Queue("anomaly-queue", { connection });
        try {
          const jobs = await queue.getJobs(["completed"], 0, 99, true);
          if (!jobs.some((job) => job.data?.requestId === process.env.REQUEST_ID)) {
            process.exitCode = 1;
          }
        } finally {
          await queue.close();
          await connection.quit();
        }
      '
    echo "PASS worker accounting, analytics, provider health, and recovery"
    echo "PASS anomaly worker completed correlated usage job"
    exit 0
  fi
  sleep 5
done

echo "Timed out waiting for safe worker evidence." >&2
exit 1
