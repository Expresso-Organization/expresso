import { afterEach, expect, it, vi } from "vitest";
import { LogMailer } from "./log.js";

afterEach(() => vi.unstubAllEnvs());

it.each(["true", "1"])("omits authentication mail content from CI=%s logs", async (ci) => {
  vi.stubEnv("CI", ci);
  const lines: string[] = [];
  const result = await new LogMailer(line => lines.push(line)).send({
    to: "fixture@example.test", subject: "Verify", text: "private authentication link", html: "private HTML link", idempotencyKey: "private delivery key",
  });
  const logged = JSON.parse(lines[0]!);
  expect(logged.id).toBe(result.id);
  expect(logged.to).toBe("fixture@example.test");
  expect(Object.hasOwn(logged, "text")).toBe(false);
  expect(Object.hasOwn(logged, "html")).toBe(false);
  expect(Object.hasOwn(logged, "idempotencyKey")).toBe(false);
  for (const content of ["private authentication link", "private HTML link", "private delivery key"]) {
    expect(lines[0]!.includes(content)).toBe(false);
  }
});

it("keeps development authentication links available when CI is unset", async () => {
  vi.stubEnv("CI", undefined);
  const lines: string[] = [];
  await new LogMailer(line => lines.push(line)).send({ to: "fixture@example.test", subject: "Verify", text: "development link" });
  expect(JSON.parse(lines[0]!).text).toBe("development link");
});
