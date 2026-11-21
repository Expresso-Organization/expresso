import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Results } from "./results";

vi.mock("./action", () => ({ runRecommendation: vi.fn() }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useActionState: () => [{ status: "ok", examined: 1, eligible: 1, source: "local", jobs: [{ jobId: "job", title: "공고", localScore: 42, decisionScore: null, evidence: [{ label: "배포 자동화", records: [{ recordId: "record", title: "프로젝트", quote: { text: "<script>실행 금지</script> 배포를 자동화했다." } }] }] }] }, vi.fn(), false],
}));

describe("요건별 근거 인용", () => {
  it("실제 기록 링크와 인용문을 표시하고 원문의 HTML은 실행하지 않는다", () => {
    const html = renderToStaticMarkup(<Results posting="job" decisions={false} />);
    expect(html).toContain('/career/records/record');
    expect(html).toContain("blockquote");
    expect(html).toContain("배포를 자동화했다.");
    expect(html).not.toContain("<script>실행 금지</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
