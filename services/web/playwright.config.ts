import { defineConfig, devices } from "@playwright/test";

const webPort = 31_00;
const apiPort = 41_00;
const baseURL = `http://127.0.0.1:${webPort}`;
const apiURL = `http://127.0.0.1:${apiPort}`;
const devEmail = `career-editor-e2e-${process.pid}@example.com`;
const redisURL = process.env.TEST_REDIS_URL ?? "redis://127.0.0.1:56379";
const queuePrefix = `career-editor-e2e-${process.pid}`;
const mongoURL = process.env.TEST_MONGODB_ADMIN_URL ?? "mongodb://admin:expresso-admin@127.0.0.1:57017/?authSource=admin&replicaSet=rs0";
const databaseName = `expresso_career_editor_e2e_${process.pid}`;
process.env.CAREER_E2E_DATABASE = databaseName;
process.env.CAREER_E2E_MONGODB_URL = mongoURL;
const mongoEnvironment = `MONGODB_URL='${mongoURL}' MONGODB_MIGRATE_URL='${mongoURL}' MONGODB_DATABASE=${databaseName}`;

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
      command: `${mongoEnvironment} pnpm --dir ../.. db:migrate && PORT=${apiPort} REDIS_URL=${redisURL} QUEUE_PREFIX=${queuePrefix} ${mongoEnvironment} CAREER_EDITOR_V2_ENABLED=true CAREER_AI_DETERMINISTIC_TEST=true CAREER_SOCKET_ALLOWED_ORIGIN=${baseURL} pnpm --filter @expresso/backend dev`,
      url: `${apiURL}/health/live`, timeout: 60_000, reuseExistingServer: !process.env.CI,
    },
    {
      command: `PORT=4101 REDIS_URL=${redisURL} QUEUE_PREFIX=${queuePrefix} ${mongoEnvironment} CAREER_EDITOR_V2_ENABLED=false CAREER_AI_DETERMINISTIC_TEST=false pnpm --filter @expresso/backend dev`,
      url: "http://127.0.0.1:4101/health/live", timeout: 60_000, reuseExistingServer: !process.env.CI,
    },
    {
      command: `REDIS_URL=${redisURL} QUEUE_PREFIX=${queuePrefix} ${mongoEnvironment} CAREER_EDITOR_V2_ENABLED=true CAREER_AI_DETERMINISTIC_TEST=true pnpm --filter @expresso/backend dev:worker`,
      timeout: 60_000, reuseExistingServer: !process.env.CI,
    },
    {
      command: `NEXT_DIST_DIR=.next-e2e-v2 NEXT_PUBLIC_API_BASE_URL=${apiURL} CAREER_EDITOR_V2_ENABLED=true DEV_LOGIN=1 DEV_LOGIN_EMAIL=${devEmail} DEV_LOGIN_PASSWORD=career-editor-e2e-password DEV_LOGIN_NAME=Career-E2E pnpm --filter @expresso/web exec next dev --port ${webPort}`,
      url: baseURL, timeout: 60_000, reuseExistingServer: !process.env.CI,
    },
    {
      command: `NEXT_DIST_DIR=.next-e2e-legacy NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4101 CAREER_EDITOR_V2_ENABLED=false DEV_LOGIN=1 DEV_LOGIN_EMAIL=${devEmail} DEV_LOGIN_PASSWORD=career-editor-e2e-password DEV_LOGIN_NAME=Career-E2E pnpm --filter @expresso/web exec next dev --port 3101`,
      url: "http://127.0.0.1:3101", timeout: 60_000, reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
