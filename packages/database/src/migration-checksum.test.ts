import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { checksumMigrationManifest } from "./migration-checksum.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function fixture(manifest: string, helper = "export const value = 1;\n"): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "expresso-migration-checksum-"));
  temporaryDirectories.push(directory);
  await writeFile(join(directory, "manifest.json"), manifest);
  await writeFile(join(directory, "helper.ts"), helper);
  await writeFile(join(directory, "migration.ts"), "import { value } from './helper.js';\nexport const result = value;\n");
  return directory;
}

describe("version-local migration checksum", () => {
  it("changes for helper or manifest bytes but ignores undeclared test and docs files", async () => {
    const manifest = "{\n  \"entries\": [\"helper.ts\", \"migration.ts\"]\n}\n";
    const directory = await fixture(manifest);
    const initial = await checksumMigrationManifest(directory);

    await writeFile(join(directory, "notes.md"), "documentation only\n");
    expect(await checksumMigrationManifest(directory)).toBe(initial);

    await writeFile(join(directory, "helper.ts"), "export const value = 2;\n");
    expect(await checksumMigrationManifest(directory)).not.toBe(initial);

    const sameSourcesDifferentManifest = await fixture(
      "{ \"entries\": [\"helper.ts\", \"migration.ts\"] }\n",
    );
    expect(await checksumMigrationManifest(sameSourcesDifferentManifest)).not.toBe(initial);
  });

  it("rejects duplicate, missing, unordered, and undeclared version-local dependencies", async () => {
    const duplicate = await fixture('{"entries":["helper.ts","helper.ts","migration.ts"]}\n');
    await expect(checksumMigrationManifest(duplicate)).rejects.toThrow(/duplicate/i);

    const missing = await fixture('{"entries":["helper.ts","migration.ts","missing.ts"]}\n');
    await expect(checksumMigrationManifest(missing)).rejects.toThrow(/missing/i);

    const unordered = await fixture('{"entries":["migration.ts","helper.ts"]}\n');
    await expect(checksumMigrationManifest(unordered)).rejects.toThrow(/order/i);

    const undeclared = await fixture('{"entries":["migration.ts"]}\n');
    await expect(checksumMigrationManifest(undeclared)).rejects.toThrow(/undeclared/i);

    const sideEffect = await fixture('{"entries":["migration.ts"]}\n');
    await writeFile(join(sideEffect, "migration.ts"), 'import "./helper.js";\n');
    await expect(checksumMigrationManifest(sideEffect)).rejects.toThrow(/undeclared/i);

    const multiline = await fixture('{"entries":["migration.ts"]}\n');
    await writeFile(join(multiline, "migration.ts"), 'import {\n  value,\n} from "./helper.js";\nexport { value };\n');
    await expect(checksumMigrationManifest(multiline)).rejects.toThrow(/undeclared/i);

    const dynamic = await fixture('{"entries":["migration.ts"]}\n');
    await writeFile(join(dynamic, "migration.ts"), 'export const load = () => import("./helper.js");\n');
    await expect(checksumMigrationManifest(dynamic)).rejects.toThrow(/undeclared/i);

    const parentImport = await fixture('{"entries":["migration.ts"]}\n');
    await writeFile(join(parentImport, "migration.ts"), 'import { value } from "../shared.js";\nexport { value };\n');
    await expect(checksumMigrationManifest(parentImport)).rejects.toThrow(/undeclared|outside/i);
  });

  it("produces the same checksum from identical source and dist bytes", async () => {
    const manifest = "{\n  \"entries\": [\"helper.ts\", \"migration.ts\"]\n}\n";
    const source = await fixture(manifest);
    const dist = await fixture(manifest);
    expect(await checksumMigrationManifest(dist)).toBe(await checksumMigrationManifest(source));
  });

  it.each(["0011", "0012"])("keeps %s source and built dist checksum inputs byte-identical", async (version) => {
    const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
    const source = join(packageRoot, "src", "mongodb-migrations", version);
    const dist = join(packageRoot, "dist", "mongodb-migrations", version);

    expect(await checksumMigrationManifest(dist)).toBe(await checksumMigrationManifest(source));
  });
});
