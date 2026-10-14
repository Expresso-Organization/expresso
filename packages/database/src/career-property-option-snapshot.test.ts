import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { CareerPropertyDefinitionV2 } from "@expresso/contracts";
import * as api from "./index.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const scope = { userId: id(1), categoryId: id(2) };
const definition: CareerPropertyDefinitionV2 = { id: id(3), key: "tags", name: "tags", type: "multi_select", required: false, system: false, config: { legacyFreeformTags: true, options: [] }, order: 0, version: 1, deletedAt: null };
const option = (n: number, label: string) => ({ _id: id(10 + n), ...scope, propertyId: definition.id, optionId: id(100 + n), rawLabel: label, version: 1 as const, createdAt: new Date(0), metadata: { color: "blue" } });
function prepare(rows: unknown[]) {
  const fn = (api as any).prepareCareerPropertyOptionSnapshot;
  expect(fn).toBeTypeOf("function"); return fn(rows, scope, [definition]) as { privateOptionSnapshotJson: string; privateOptionSnapshotFingerprint: string };
}
function read(snapshot: unknown, required = false) {
  const fn = (api as any).readCareerPropertyOptionSnapshot;
  expect(fn).toBeTypeOf("function"); return fn({ ...scope, propertyId: definition.id, ...snapshot as object }, [definition], required) as Array<{ optionId: string; rawLabel: string }>;
}
describe("immutable actor option conversion policy snapshots", () => {
  it("stores canonical ordered exact semantic rows and hashes UTF8 bytes, leaving ledger metadata untouched", () => {
    const rows = [option(2, "react"), option(1, " React ")], before = structuredClone(rows);
    const snapshot = prepare(rows);
    expect(JSON.parse(snapshot.privateOptionSnapshotJson)).toEqual([1, 2].map((n) => ({ ...scope, propertyId: definition.id, optionId: id(100 + n), rawLabel: n === 1 ? " React " : "react", version: 1 })));
    expect(snapshot.privateOptionSnapshotJson).not.toContain("color");
    expect(snapshot.privateOptionSnapshotFingerprint).toBe(createHash("sha256").update(snapshot.privateOptionSnapshotJson).digest("hex"));
    expect(prepare(rows.reverse())).toEqual(snapshot); expect(rows.reverse()).toEqual(before);
    expect(read(snapshot).map(row => row.rawLabel)).toEqual([" React ", "react"]);
  });
  it("rejects foreign owners, unknown properties, wrong versions, and conflicting UUID/label bindings", () => {
    for (const rows of [[{ ...option(1, "A"), userId: id(9) }], [{ ...option(1, "A"), categoryId: id(9) }], [{ ...option(1, "A"), propertyId: id(9) }], [{ ...option(1, "A"), version: 2 }], [option(1, "A"), { ...option(2, "B"), optionId: id(101) }], [option(1, "A"), option(2, "A")]]) expect(() => prepare(rows)).toThrow("CAREER_PRIVATE_OPTIONS_SNAPSHOT_INVALID");
  });
  it("fails closed on tampering, noncanonical ordering/keys and legacy private-dependent jobs", () => {
    const snapshot = prepare([option(1, "A")]);
    expect(() => read({ ...snapshot, privateOptionSnapshotJson: snapshot.privateOptionSnapshotJson.replace('"A"', '"B"') })).toThrow("CAREER_PRIVATE_OPTIONS_SNAPSHOT_INVALID");
    const invalid = JSON.stringify([{ ...JSON.parse(snapshot.privateOptionSnapshotJson)[0], metadata: {} }]);
    expect(() => read({ privateOptionSnapshotJson: invalid, privateOptionSnapshotFingerprint: createHash("sha256").update(invalid).digest("hex") })).toThrow("CAREER_PRIVATE_OPTIONS_SNAPSHOT_INVALID");
    expect(() => read({}, true)).toThrow("CAREER_PRIVATE_OPTIONS_SNAPSHOT_REQUIRED");
    const plain = { ...definition, type: "number" as const, config: {} };
    expect((api as any).readCareerPropertyOptionSnapshot({ ...scope, propertyId: plain.id }, [plain])).toEqual([]);
  });
  it("projects frozen select option names without changing raw definitions", () => {
    const snapshot = prepare([option(1, " A ")]);
    const select = { ...definition, type: "select" as const };
    const fn = (api as any).overlayCareerPropertyOptionSnapshot; expect(fn).toBeTypeOf("function");
    expect(fn([select], read(snapshot), scope)[0].config.options).toEqual([{ id: id(101), label: " A ", name: " A " }]);
    expect(select.config.options).toEqual([]);
  });
});