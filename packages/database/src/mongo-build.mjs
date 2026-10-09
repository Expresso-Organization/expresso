import { cp, mkdir } from "node:fs/promises";

// 배포된 dist에서도 원본 체크섬과 마이그레이션 입력을 읽습니다.
const migrations = [
  ["0001", ["migration.ts", "schema.json", "seeds.json"]],
  ["0002", ["migration.ts"]],
  ["0003", ["migration.ts"]],
  ["0004", ["migration.ts"]],
  ["0005", ["migration.ts"]],
  ["0006", ["migration.ts"]],
  ["0007", ["migration.ts"]],
  ["0008", ["migration.ts"]],
  ["0009", ["migration.ts"]],
  ["0010", ["migration.ts"]],
  ["0011", ["migration.ts"]],
  ["0012", ["migration.ts"]],
  ["0013", ["migration.ts"]],
];

for (const [version, files] of migrations) {
  const source = new URL(
    `./mongodb-migrations/${version}/`,
    import.meta.url,
  );
  const target = new URL(
    `../dist/mongodb-migrations/${version}/`,
    import.meta.url,
  );

  await mkdir(target, { recursive: true });

  for (const file of files) {
    await cp(new URL(file, source), new URL(file, target));
  }
}