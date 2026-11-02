import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createSpringCareerCommandFacade, SpringCareerCommandError } from "./spring-command-facade.js";
const fixture = JSON.parse(readFileSync(new URL("../../../../../packages/contracts/openapi/fixtures/career-business-v1.json", import.meta.url), "utf8"));
describe("unregistered Spring command transport", () => {
  it("parses the authentication infrastructure 500 envelope without fallback", async () => {
    const errors = JSON.parse(readFileSync(new URL("../../../../../packages/contracts/openapi/fixtures/career-writer-errors-v1.json", import.meta.url), "utf8"));
    let calls = 0;
    const facade = createSpringCareerCommandFacade("http://writer.test", async () => {
      calls++; return new Response(JSON.stringify(errors.infrastructureFailure), { status: 500 });
    });
    await expect(facade.patch(`exps_${"A".repeat(43)}`, fixture.data.id, 6,
      { propertyValues: { set: [], unsetPropertyIds: [] } })).rejects.toMatchObject({
      status: 500, response: errors.infrastructureFailure,
    });
    expect(calls).toBe(1);
  });
  it("forwards opaque auth and CAS, and verifies response ETag", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const facade = createSpringCareerCommandFacade("http://writer.test", async (url, init) => {
      calls.push({ url, init }); return new Response(JSON.stringify(fixture), { status: 200, headers: { ETag: '"v7"' } });
    });
    const result = await facade.patch(`exps_${"A".repeat(43)}`, fixture.data.id, 6, { title: "changed" });
    expect(result).toEqual(fixture);
    expect(calls[0]!.url).toBe(`http://writer.test/v1/career/records/${fixture.data.id}`);
    expect(new Headers(calls[0]!.init.headers).get("If-Match")).toBe('"v6"');
    expect(new Headers(calls[0]!.init.headers).get("Authorization")).toBe(`Bearer exps_${"A".repeat(43)}`);
  });
  it("propagates Spring errors without any direct-write fallback", async () => {
    let calls = 0;
    const facade = createSpringCareerCommandFacade("http://writer.test", async () => {
      calls++; return new Response(JSON.stringify({ error: { code: "PRECONDITION_FAILED", message: "stale", requestId: "test-request-id" } }), { status: 412 });
    });
    await expect(facade.trash(`exps_${"A".repeat(43)}`, fixture.data.id, 6)).rejects.toMatchObject({ status: 412 });
    expect(calls).toBe(1);
  });
  it("rejects mismatched response versions and unavailable transports", async () => {
    const mismatch = createSpringCareerCommandFacade("http://writer.test", async () => new Response(JSON.stringify(fixture), { status: 200, headers: { ETag: '"v8"' } }));
    await expect(mismatch.restore(`exps_${"A".repeat(43)}`, fixture.data.id, 6)).rejects.toThrow(/ETag/);
    const unavailable = createSpringCareerCommandFacade("http://writer.test", async () => { throw new Error("unavailable"); });
    await expect(unavailable.trash(`exps_${"A".repeat(43)}`, fixture.data.id, 6)).rejects.toThrow("unavailable");
    expect(SpringCareerCommandError).toBeDefined();
  });
});
