import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, it } from "vitest";

/**
 * 운영 배포는 `.next`가 아닌 폴더에 웹을 짓는다. 그 빌드의 타입 검사가 방금 만든 경로 타입을
 * 읽으려면 그 폴더의 타입을 읽는 tsconfig가 있어야 한다(next.config.ts의 `buildTsconfig`).
 * 없거나 어긋나면 지난 빌드의 타입으로 검사한다 — 2026-11-19 #242 배포가 그렇게 실패했다.
 */
const web = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, web), "utf8");
const include = (name: string) => (JSON.parse(read(name)) as { include: string[] }).include;

function deployDistDir() {
  const found = /NEXT_DIST_DIR=(\S+)/.exec(read("../../scripts/operations/deploy.sh"));
  if (!found) throw new Error("deploy.sh에서 NEXT_DIST_DIR을 찾지 못했습니다");
  return found[1]!;
}

it("배포가 웹을 짓는 폴더의 타입을 읽는 tsconfig가 있다", () => {
  const name = `tsconfig.${deployDistDir().replace(/^\./, "")}.json`;
  expect(existsSync(fileURLToPath(new URL(name, web))), `services/web/${name}`).toBe(true);
});

it("그 tsconfig의 include는 tsconfig.json과 타입 폴더만 다르다", () => {
  const dir = deployDistDir();
  const build = include(`tsconfig.${dir.replace(/^\./, "")}.json`);
  expect(build).toContain(`${dir}/types/**/*.ts`);
  expect(build.map(glob => glob.replace(`${dir}/types/`, ".next/types/"))).toEqual(include("tsconfig.json"));
});

it("타입 검사 결과를 증분 캐시에서 꺼내 쓰지 않는다", () => {
  // 켜면 Next가 결과를 `<distDir>/cache/.tsbuildinfo`에 남기고 배포가 그 캐시를 다음 빌드로 옮긴다.
  // tsc 7.0.2는 경로 타입(link.d.ts)이 바뀌어도 바뀌지 않은 파일을 다시 검사하지 않는다 — 화면을 지우고
  // 그 화면으로 가는 링크를 남긴 변경이 캐시가 있는 빌드를 통과했다. 캐시 없는 전체 검사는 1.5초다.
  const options = (name: string) => (JSON.parse(read(name)) as { compilerOptions?: { incremental?: boolean; composite?: boolean } }).compilerOptions ?? {};
  for (const name of ["tsconfig.json", `tsconfig.${deployDistDir().replace(/^\./, "")}.json`]) {
    expect(options(name).incremental ?? false, name).toBe(false);
    expect(options(name).composite ?? false, name).toBe(false);
  }
});
