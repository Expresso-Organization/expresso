import { defineConfig } from "vitest/config";

/**
 * 성능 예산은 혼자 돌 때만 뜻이 있다.
 *
 * 다른 파일 일흔 몇 개가 같은 데이터베이스를 두드리는 동안 잰 p95 는 그 경로의
 * 값이 아니라 그날 기계가 얼마나 바빴는지다. 그래서 기본 실행에서 빼고
 * `pnpm test:load` 로 따로 돌린다 — CI 도 그 순서다.
 */
const loadOnly = process.env.EXPRESSO_LOAD_TEST === "1";
const unitOnly = process.env.EXPRESSO_UNIT_TEST === "1";

export default defineConfig({
  test: loadOnly
    ? {
        include: ["test/load/**/*.test.ts", "src/**/performance.test.ts"],
        fileParallelism: false,
      }
    : {
        // CI의 root test와 명시적 test:infra가 같은 파일을 두 번 실행하지 않게 분리합니다.
        exclude: ["**/node_modules/**", "**/dist/**", "test/load/**", ...(unitOnly ? ["**/*integration.test.ts"] : [])],
        // 실제 schema fixture는 collection별 validator와 index를 매번 적용합니다.
        // 네 파일의 DDL이 겹치면 명시적 30초 hook도 초과하므로 준비 부하를 두 파일로 제한합니다.
        ...(process.env.TEST_MONGODB_URL ? { maxWorkers: 2, hookTimeout: 60_000 } : {}),
      },
});
