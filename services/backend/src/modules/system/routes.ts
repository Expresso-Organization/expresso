import type { FastifyInstance } from "fastify";

import { inspectReadiness, type ReadinessCheck } from "./readiness.js";

export interface SystemRoutesOptions {
  readinessChecks: readonly ReadinessCheck[];
}

export async function registerSystemRoutes(
  app: FastifyInstance,
  options: SystemRoutesOptions,
): Promise<void> {
  app.get("/health/live", { logLevel: "silent" }, async () => ({
    status: "alive" as const,
  }));

  app.get("/health/ready", { logLevel: "silent" }, async (_request, reply) => {
    const readiness = await inspectReadiness(options.readinessChecks);

    if (readiness.status === "not_ready") {
      return reply.code(503).send(readiness);
    }

    return readiness;
  });
}

