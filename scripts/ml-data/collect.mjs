import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { collectFile } from "./collect-lib.mjs";
import { dataSources } from "./sources.mjs";

const rawRoot = path.resolve(process.env.EXPRESSO_ML_DATA_ROOT ?? "var/ml-data/raw");
const manifestPath = path.join(path.dirname(rawRoot), "manifest.json");
const results = [];
let failed = false;

for (const source of dataSources) {
  for (const file of source.files) {
    const destination = path.join(rawRoot, source.id, ...file.path.split("/"));
    process.stdout.write(`[${source.id}] ${file.path} ... `);

    try {
      const result = await collectFile({ ...file, destination });
      results.push({
        sourceId: source.id,
        file: file.path,
        status: result.status,
        bytes: file.size,
        checksum: file.checksum,
        destination,
      });
      process.stdout.write(`${result.status} (${file.size.toLocaleString("en-US")} bytes)\n`);
    } catch (error) {
      failed = true;
      const message = error instanceof Error ? error.message : String(error);
      results.push({ sourceId: source.id, file: file.path, status: "failed", error: message, destination });
      process.stdout.write(`failed: ${message}\n`);
    }
  }
}

await mkdir(path.dirname(manifestPath), { recursive: true });
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      projectUse: "academic-research-only",
      collectedAt: new Date().toISOString(),
      rawRoot,
      sources: dataSources.map(({ files, ...source }) => ({
        ...source,
        files: files.map(({ url, ...file }) => file),
      })),
      results,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(`manifest: ${manifestPath}`);
if (failed) {
  process.exitCode = 1;
}
