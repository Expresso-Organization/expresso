import type { BrewMaterials } from "@expresso/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./materials-actions", () => ({
  selectMaterialsAction: vi.fn(),
  setModeAction: vi.fn(),
}));

import { MaterialPicker } from "./MaterialPicker";

describe("Career MVP 재료 선택", () => {
  it("Interview 대신 레시피 화면으로 진행한다", () => {
    const materials = {
      materials: [],
      mode: "solo",
      selectionLimit: 10,
    } as unknown as BrewMaterials;

    const html = renderToStaticMarkup(
      <MaterialPicker brewId="brew-1" materials={materials} coworkAllowed={false} quota={null} />,
    );

    expect(html).toContain('/brew/brew-1/outline');
    expect(html).not.toContain('/brew/brew-1/counter');
    expect(html).not.toContain("AI와 대화 시작");
  });
});
