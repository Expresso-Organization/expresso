export interface ReadinessCheck {
  readonly name: string;
  run(): Promise<void>;
}

export interface ReadinessResult {
  status: "ready" | "not_ready";
  checks: Record<string, "up" | "down">;
}

export async function inspectReadiness(
  checks: readonly ReadinessCheck[],
): Promise<ReadinessResult> {
  const results = await Promise.all(
    checks.map(async (check) => {
      try {
        await check.run();
        return [check.name, "up"] as const;
      } catch {
        return [check.name, "down"] as const;
      }
    }),
  );
  const checkStatuses = Object.fromEntries(results);
  const isReady = results.every(([, status]) => status === "up");

  return {
    status: isReady ? "ready" : "not_ready",
    checks: checkStatuses,
  };
}

