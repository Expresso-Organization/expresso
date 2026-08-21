import { defineConfig } from "vitest/config";

/**
 * 성능 예산은 혼자 돌 때만 뜻이 있다.
 *
 * 다른 파일 일흔 몇 개가 같은 데이터베이스를 두드리는 동안 잰 p95 는 그 경로의
 * 값이 아니라 그날 기계가 얼마나 바빴는지다. 그래서 기본 실행에서 빼고
 * `pnpm test:load` 로 따로 돌린다 — CI 도 그 순서다.
 */
const loadOnly = process.env.EXPRESSO_LOAD_TEST === "1";

export default defineConfig({
  test: loadOnly
    ? { include: ["test/load/**/*.test.ts"] }
    : { exclude: ["**/node_modules/**", "**/dist/**", "test/load/**"] },
});
