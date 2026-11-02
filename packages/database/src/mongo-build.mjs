import { cp, mkdir, readdir } from "node:fs/promises";
// 배포된 dist에서도 고정된 원본 입력을 해시한다.
const base = new URL("./mongodb-migrations/", import.meta.url);
for (const version of await readdir(base)) {
  if (!/^\d{4}$/.test(version)) continue;
  const source = new URL(`${version}/`, base);
  const target = new URL(`../dist/mongodb-migrations/${version}/`, import.meta.url);
  await mkdir(target, { recursive: true });
  for (const file of await readdir(source)) if (/\.(ts|json)$/.test(file)) await cp(new URL(file, source), new URL(file, target));
}
