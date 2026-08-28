import { cp, mkdir } from "node:fs/promises";

// 배포된 dist만으로 원본 체크섬과 버전별 입력을 읽을 수 있게 합니다.
const source = new URL("./mongodb-migrations/0001/", import.meta.url);
const target = new URL("../dist/mongodb-migrations/0001/", import.meta.url);
await mkdir(target, { recursive: true });
for (const file of ["migration.ts", "schema.json", "seeds.json"]) {
  await cp(new URL(file, source), new URL(file, target));
}
