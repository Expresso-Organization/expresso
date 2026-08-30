import { cp, mkdir } from "node:fs/promises";

// 배포된 dist만으로 원본 체크섬과 버전별 입력을 읽을 수 있게 합니다.
for (const [version, files] of [["0001", ["migration.ts", "schema.json", "seeds.json"]], ["0002", ["migration.ts"]], ["0003", ["migration.ts"]], ["0004", ["migration.ts"]]]) {
  const source = new URL(`./mongodb-migrations/${version}/`, import.meta.url);
  const target = new URL(`../dist/mongodb-migrations/${version}/`, import.meta.url);
  await mkdir(target, { recursive: true });
  for (const file of files) await cp(new URL(file, source), new URL(file, target));
}
