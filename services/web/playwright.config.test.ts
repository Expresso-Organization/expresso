import { afterEach, expect, it, vi } from "vitest";

const originalEnvironment = { ...process.env };
afterEach(() => { process.env = { ...originalEnvironment }; vi.resetModules(); });

it("starts the Spring owner before API/Worker with one isolated database and matching credentials", async () => {
  process.env.TEST_MONGODB_ADMIN_URL = "mongodb://e2e-mongo:57037/?replicaSet=rs0&directConnection=true";
  process.env.TEST_REDIS_URL = "redis://e2e-redis:6379/0";
  process.env.CAREER_E2E_DATABASE = "expresso_career_editor_e2e_123456";
  process.env.CAREER_E2E_SPRING_PORT = "8329";
  const { default: config } = await import("./playwright.config");
  const servers = Array.isArray(config.webServer) ? config.webServer : [config.webServer!];
  const spring = servers[0]!;
  expect(spring.url).toBe("http://127.0.0.1:8329/health/ready");
  expect(spring.command).toContain("db:migrate");
  expect(spring.command).toContain("bootJar");
  expect(spring.command).toContain("exec java -jar");
  expect(spring.command).toContain("--spring.profiles.active=operations");
  expect(servers).toHaveLength(4);
  const roles = ["CAREER_WRITER_MOVE_SECRET", "CAREER_PRODUCT_SERVICE_SECRET", "CAREER_INTEGRATION_AI_SECRET", "CAREER_INTEGRATION_INTERVIEW_SECRET", "CAREER_PROPERTY_MUTATION_SECRET", "CAREER_SCHEMA_PREVIEW_SECRET"];
  for (const server of servers.slice(0, 3)) {
    expect(server.reuseExistingServer).toBe(false);
    expect(server.env?.MONGODB_DATABASE).toBe(process.env.CAREER_E2E_DATABASE);
    expect(server.env?.MONGODB_URL).toBe(process.env.TEST_MONGODB_ADMIN_URL);
    expect(server.env?.REDIS_URL).toBe(process.env.TEST_REDIS_URL);
    for (const role of roles) {
      const secret = server.env?.[role];
      expect(Boolean(secret && secret.length >= 32)).toBe(true);
      expect(Boolean(secret === spring.env?.[role])).toBe(true);
      expect(Boolean(secret && server.command.includes(secret))).toBe(false);
    }
  }
  expect(new Set(roles.map(role => spring.env?.[role])).size).toBe(roles.length);
  expect(servers[1]!.env?.CAREER_SPRING_BASE_URL).toBe("http://127.0.0.1:8329");
  expect(spring.env?.CAREER_WRITER_ENABLED).toBe("true");
  expect(spring.env?.CAREER_INTEGRATION_ENABLED).toBe("true");
  expect(spring.env?.CAREER_PROPERTY_MUTATION_ENABLED).toBe("true");
  vi.resetModules();
  const workerConfig = (await import("./playwright.config")).default;
  const workerServers = workerConfig.webServer as typeof servers;
  expect(Boolean(workerServers[0]!.env?.CAREER_PRODUCT_SERVICE_SECRET === spring.env?.CAREER_PRODUCT_SERVICE_SECRET)).toBe(true);
  expect(workerServers[0]!.env?.MONGODB_DATABASE).toBe(spring.env?.MONGODB_DATABASE);
});
