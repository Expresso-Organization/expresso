import { describe, expect, it } from "vitest";
import { careerEditorV2Enabled } from "./feature-flag";

describe("career editor v2 web gate", () => {
  it("keeps the legacy surface for missing, false and malformed values", () => {
    expect(careerEditorV2Enabled(undefined)).toBe(false);
    expect(careerEditorV2Enabled("false")).toBe(false);
    expect(careerEditorV2Enabled("TRUE")).toBe(false);
  });
  it("opens the complete v2 surface only for explicit true", () => { expect(careerEditorV2Enabled("true")).toBe(true); });
});
