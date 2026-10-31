import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";

// 다른 개발 서버가 기본 포트를 쓰고 있으면 CAREER_E2E_WEB_PORT · CAREER_E2E_API_PORT로 옮깁니다.
const webPort = Number(process.env.CAREER_E2E_WEB_PORT ?? 31_00);
const apiPort = Number(process.env.CAREER_E2E_API_PORT ?? 41_00);
const springPort = Number(process.env.CAREER_E2E_SPRING_PORT ?? 81_00);
process.env.CAREER_E2E_API_PORT = String(apiPort);
const baseURL = `http://127.0.0.1:${webPort}`;
const apiURL = `http://127.0.0.1:${apiPort}`;
const springURL = `http://127.0.0.1:${springPort}`;
const devEmail = `career-editor-e2e-${process.pid}@example.com`;
const redisURL = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379";
const queuePrefix = `career-editor-e2e-${process.pid}`;
const mongoURL = process.env.TEST_MONGODB_ADMIN_URL ?? "mongodb://admin:expresso-admin@127.0.0.1:57017/?authSource=admin&replicaSet=rs0";
// 설정 파일은 워커 프로세스에서 다시 평가된다. 러너가 정해 물려준 DB 이름을 이어 써야 테스트가 서버와 같은 DB를 본다.
const inheritedDatabase = process.env.CAREER_E2E_DATABASE;
const databaseName = inheritedDatabase && /^expresso_career_editor_e2e_[0-9]+$/.test(inheritedDatabase) ? inheritedDatabase : `expresso_career_editor_e2e_${process.pid}`;
process.env.CAREER_E2E_DATABASE = databaseName;
process.env.CAREER_E2E_MONGODB_URL = mongoURL;
// 워커에서 설정을 다시 읽어도 같은 테스트 키를 이어 씁니다. 제품 키는 재사용하지 않습니다.
function testSecret(role: string) {
  const name = `CAREER_E2E_${role}_SECRET`;
  return process.env[name] ??= randomBytes(32).toString("hex");
}
const ownerEnvironment = {
  CAREER_WRITER_MOVE_SECRET: testSecret("MOVE"),
  CAREER_PRODUCT_SERVICE_SECRET: testSecret("PRODUCT"),
  CAREER_INTEGRATION_AI_SECRET: testSecret("AI"),
  CAREER_INTEGRATION_INTERVIEW_SECRET: testSecret("INTERVIEW"),
  CAREER_PROPERTY_MUTATION_SECRET: testSecret("PROPERTY_MUTATION"),
  CAREER_SCHEMA_PREVIEW_SECRET: testSecret("SCHEMA_PREVIEW"),
};
const serviceEnvironment = {
  ...ownerEnvironment,
  MONGODB_URL: mongoURL, MONGODB_MIGRATE_URL: mongoURL, MONGODB_DATABASE: databaseName,
  REDIS_URL: redisURL, QUEUE_PREFIX: queuePrefix,
  CAREER_SPRING_BASE_URL: springURL,
  CAREER_AI_DETERMINISTIC_TEST: "true", AI_PROVIDER: "off",
  CAREER_SOCKET_ALLOWED_ORIGIN: baseURL,
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  globalTeardown: "./e2e/global-teardown.mjs",
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { ...devices["Desktop Chrome"], baseURL, trace: "retain-on-failure", screenshot: "only-on-failure", video: "retain-on-failure" },
  webServer: [
    {
      // Migration은 한 번만 수행하고, Gradle 종료 뒤 Java를 같은 프로세스 그룹에서 관리합니다.
      command: "pnpm --dir ../.. db:migrate && cd ../backend-spring && bash ./gradlew --no-daemon bootJar && exec java -jar build/libs/backend-spring-0.0.1-SNAPSHOT.jar --spring.profiles.active=operations",
      env: {
        ...serviceEnvironment, SPRING_PORT: String(springPort), SPRING_BIND_ADDRESS: "127.0.0.1",
        MONGODB_REPLICA_SET: "rs0", CAREER_WRITER_ENABLED: "true",
        CAREER_INTEGRATION_ENABLED: "true", CAREER_PROPERTY_MUTATION_ENABLED: "true",
      },
      url: `${springURL}/health/ready`, timeout: 240_000, reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @expresso/backend dev",
      env: { ...serviceEnvironment, PORT: String(apiPort) },
      url: `${apiURL}/health/live`, timeout: 60_000, reuseExistingServer: false,
    },
    {
      command: "pnpm --filter @expresso/backend dev:worker",
      env: { ...serviceEnvironment, SCHEDULED_JOBS_ENABLED: "false" },
      timeout: 60_000, reuseExistingServer: false,
    },
    {
      command: `pnpm --filter @expresso/web exec next dev --port ${webPort}`,
      env: {
        NEXT_DIST_DIR: ".next-e2e-v2", NEXT_PUBLIC_API_BASE_URL: apiURL,
        DEV_LOGIN: "1", DEV_LOGIN_EMAIL: devEmail, DEV_LOGIN_PASSWORD: testSecret("LOGIN"), DEV_LOGIN_NAME: "Career-E2E",
      },
      url: baseURL, timeout: 60_000, reuseExistingServer: false,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
