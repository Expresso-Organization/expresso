import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, posix, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

type MigrationManifest = { entries: string[] };

function directoryPath(directory: string | URL): string {
  return resolve(directory instanceof URL ? fileURLToPath(directory) : directory);
}

function parseManifest(bytes: Buffer): MigrationManifest {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("migration checksum manifest가 올바른 JSON이 아닙니다");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("migration checksum manifest shape가 올바르지 않습니다");
  }
  const entries = (value as { entries?: unknown }).entries;
  if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== "string")) {
    throw new Error("migration checksum manifest entries가 올바르지 않습니다");
  }
  if (!entries.includes("migration.ts")) throw new Error("migration checksum manifest에 migration.ts가 없습니다");
  if (new Set(entries).size !== entries.length) throw new Error("migration checksum manifest에 duplicate entry가 있습니다");
  if (entries.some((entry) => entry.includes("\\") || entry.startsWith("/") || entry.split("/").includes("..") || !entry.endsWith(".ts"))) {
    throw new Error("migration checksum manifest entry path가 올바르지 않습니다");
  }
  if (entries.some((entry, index) => index > 0 && entries[index - 1]! > entry)) {
    throw new Error("migration checksum manifest entry order가 deterministic하지 않습니다");
  }
  return { entries };
}

function runtimeLocalImports(source: string): string[] {
  const imports: string[] = [];
  const staticExpression = /(?:^|\n)\s*(import|export)\s+([^;]+)/g;
  for (const match of source.matchAll(staticExpression)) {
    const statement = `${match[1]} ${match[2] ?? ""}`;
    if (/^(?:import|export)\s+type\b/.test(statement)) continue;
    const specifier = /(?:from\s+)?["']((?:\.\.?\/)[^"']+)["']/.exec(statement)?.[1];
    if (specifier) imports.push(specifier.replace(/\.js$/, ".ts"));
  }
  const dynamicExpression = /\bimport\s*\(\s*["']((?:\.\.?\/)[^"']+)["']\s*\)/g;
  for (const match of source.matchAll(dynamicExpression)) {
    const specifier = match[1];
    if (specifier) imports.push(specifier.replace(/\.js$/, ".ts"));
  }
  return imports;
}

export async function checksumMigrationManifest(directory: string | URL): Promise<string> {
  const root = directoryPath(directory);
  let manifestBytes: Buffer;
  try {
    manifestBytes = await readFile(resolve(root, "manifest.json"));
  } catch {
    throw new Error("migration checksum manifest가 missing 상태입니다");
  }
  const manifest = parseManifest(manifestBytes);
  const sources = new Map<string, Buffer>();
  for (const entry of manifest.entries) {
    const path = resolve(root, entry);
    if (!path.startsWith(`${root}${sep}`)) throw new Error("migration checksum manifest entry가 version directory 밖을 가리킵니다");
    try {
      sources.set(entry, await readFile(path));
    } catch {
      throw new Error(`migration checksum source가 missing 상태입니다: ${entry}`);
    }
  }

  const declared = new Set(manifest.entries);
  for (const [entry, bytes] of sources) {
    const parent = dirname(entry).replaceAll("\\", "/");
    for (const dependency of runtimeLocalImports(bytes.toString("utf8"))) {
      const normalized = posix.normalize(posix.join(parent === "." ? "" : parent, dependency));
      if (!declared.has(normalized)) {
        throw new Error(`migration checksum undeclared dependency: ${entry} -> ${normalized}`);
      }
    }
  }

  const hash = createHash("sha256").update(manifestBytes);
  for (const entry of manifest.entries) {
    const bytes = sources.get(entry)!;
    hash.update(`${entry}\0${bytes.byteLength}\0`).update(bytes);
  }
  return hash.digest("hex");
}
