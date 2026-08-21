import { isMongoReady } from "../lib/mongo.js";
import { isRedisReady } from "../lib/redis.js";
import { metrics } from "./metrics.js";

export function refreshDependencyReadinessMetrics(): void {
    recordDependencyReadiness(isMongoReady(), isRedisReady());
}

export function recordDependencyReadiness(
    mongoReady: boolean,
    redisReady: boolean,
): void {
    metrics.dependencyReady.set(
        { dependency: "mongodb" },
        mongoReady ? 1 : 0,
    );
    metrics.dependencyReady.set(
        { dependency: "redis" },
        redisReady ? 1 : 0,
    );
}
