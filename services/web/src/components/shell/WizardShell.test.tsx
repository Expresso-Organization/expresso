import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { WizardSteps } from "./WizardShell";

describe("Career MVP 제작 단계", () => {
  it("Brew AI Interview 단계를 제품 위저드에 노출하지 않는다", () => {
    const html = renderToStaticMarkup(
      <WizardSteps brewId="brew-1" current="outline" situation="준비됨" />,
    );

    expect(html).not.toContain("AI 대화");
    expect(html).not.toContain("/counter");
    expect(html).toContain("레시피");
  });
});
