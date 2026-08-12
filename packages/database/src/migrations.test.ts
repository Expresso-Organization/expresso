import { describe, expect, it } from "vitest";

import { loadMigrations } from "./migrations.js";

describe("loadMigrations", () => {
  it("loads immutable migrations in version order", async () => {
    const migrations = await loadMigrations();

    expect(migrations.length).toBeGreaterThan(0);
    expect(migrations.map(({ version }) => version)).toEqual(
      [...migrations.map(({ version }) => version)].sort(),
    );
    expect(migrations.every(({ checksum }) => checksum.length === 64)).toBe(true);
  });
});

