const SKILL_ALIASES: Record<string, string> = {
  js: "javascript",
  k8s: "kubernetes",
  postgres: "postgresql",
  ts: "typescript",
};

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1_000;

export function normalizeSkillName(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
  return SKILL_ALIASES[normalized] ?? normalized;
}

export function computeSkillAggregate(
  evidenceCount: number,
  lastUsedAt: Date,
  computedAt: Date,
): { level: number; strength: "weak" | "supported" | "strong" } {
  if (!Number.isSafeInteger(evidenceCount) || evidenceCount < 1) {
    throw new RangeError("skills require at least one record evidence");
  }
  let level = evidenceCount >= 8
    ? 5
    : evidenceCount >= 5
      ? 4
      : evidenceCount >= 3
        ? 3
        : evidenceCount >= 2
          ? 2
          : 1;
  if (computedAt.getTime() - lastUsedAt.getTime() > TWO_YEARS_MS) {
    level = Math.max(level - 1, 1);
  }
  const strength = evidenceCount <= 1
    ? "weak"
    : evidenceCount >= 5
      ? "strong"
      : "supported";
  return { level, strength };
}
