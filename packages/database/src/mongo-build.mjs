import { cp, mkdir } from "node:fs/promises";

// 배포된 dist만으로 원본 체크섬과 버전별 입력을 읽을 수 있게 합니다.
for (const [version, files] of [["0001", ["migration.ts", "schema.json", "seeds.json"]], ["0002", ["migration.ts"]], ["0003", ["migration.ts"]], ["0004", ["migration.ts"]], ["0005", ["migration.ts"]], ["0006", ["migration.ts"]], ["0007", ["migration.ts"]], ["0008", ["migration.ts"]], ["0009", ["migration.ts"]], ["0010", ["migration.ts"]], ["0014", ["migration.ts", "business-schema.json", "checksum-manifest.json"]], ["0015", ["migration.ts", "mutation-schema.json", "checksum-manifest.json"]], ["0016", ["migration.ts", "checksum-manifest.json"]], ["0017", ["migration.ts", "checksum-manifest.json", "canonical-preparation.ts", "career-canonical-values.ts", "career-product-values.ts", "career-property-options.ts", "career-schemas.ts", "career-business-timezones.json"]], ["0018", ["migration.ts", "mutation-base-schema.json", "checksum-manifest.json"]], ["0019", ["migration.ts", "checksum-manifest.json"]]]) {
  const source = new URL(`./mongodb-migrations/${version}/`, import.meta.url);
  const target = new URL(`../dist/mongodb-migrations/${version}/`, import.meta.url);
  await mkdir(target, { recursive: true });
  for (const file of files) await cp(new URL(file, source), new URL(file, target));
}
