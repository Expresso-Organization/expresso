import { describe, expect, it } from "vitest";

import { htmlToText } from "./adapter.js";
import { extractJsonLd, JobUrlImporter, readableText } from "./url-import.js";

describe("공고 주소 읽기", () => {
  it("`@graph` 안에 묻힌 JobPosting도 찾는다", () => {
    const html = `
      <script type="application/ld+json">{"@type":"Organization","name":"딴것"}</script>
      <script type="application/ld+json">
        {"@context":"https://schema.org","@graph":[
          {"@type":"BreadcrumbList"},
          {"@type":["JobPosting"],"title":"백엔드 엔지니어",
           "hiringOrganization":{"@type":"Organization","name":"당근"},
           "employmentType":"정규직","validThrough":"2026-09-30"}
        ]}
      </script>`;
    const found = extractJsonLd(html);
    expect(found).toMatchObject({ title: "백엔드 엔지니어", employmentType: "정규직" });
  });

  it("깨진 JSON-LD 하나 때문에 나머지를 못 읽지 않는다", () => {
    const html = `
      <script type="application/ld+json">{ 이건 JSON이 아니다 }</script>
      <script type="application/ld+json">{"@type":"JobPosting","title":"살아남은 공고"}</script>`;
    expect(extractJsonLd(html)).toMatchObject({ title: "살아남은 공고" });
  });

  it("JobPosting이 없으면 없다고 한다 — 아무 구조화 데이터나 집지 않는다", () => {
    expect(extractJsonLd(`<script type="application/ld+json">{"@type":"Article"}</script>`))
      .toBeNull();
  });

  it("내비게이션과 푸터는 본문이 아니다", () => {
    // 실측: 원티드 공고를 통째로 펴니 "채용 · 이력서 · 교육·이벤트"가 맨 앞에 왔다.
    // 그 글에서 요건을 뽑으면 공고에 없는 것이 요건이 된다.
    const html = `
      <body>
        <nav><a>채용</a><a>이력서</a><a>교육·이벤트</a></nav>
        <header><a>로그인</a></header>
        <main><h1>포지션 상세</h1><p>${"실제 공고 본문입니다. ".repeat(30)}</p></main>
        <footer><a>회사소개</a><a>이용약관</a></footer>
        <script>console.log("스크립트도 본문이 아니다")</script>
      </body>`;
    const text = readableText(html);
    expect(text).toContain("포지션 상세");
    expect(text).toContain("실제 공고 본문입니다.");
    expect(text).not.toContain("이력서");
    expect(text).not.toContain("이용약관");
    expect(text).not.toContain("스크립트도");
  });

  it("본문 컨테이너가 없으면 페이지 전체에서 껍데기만 덜어 낸다", () => {
    const html = `<body><nav>메뉴</nav><div>${"본문만 있는 페이지. ".repeat(30)}</div></body>`;
    const text = readableText(html);
    expect(text).toContain("본문만 있는 페이지.");
    expect(text).not.toContain("메뉴");
  });

  it("목록 태그는 줄로 편다 — 요건이 한 줄에 붙으면 못 읽는다", () => {
    const text = htmlToText("<ul><li>Kotlin 3년</li><li>Kafka 운영</li></ul>");
    expect(text.split("\n").filter(Boolean)).toEqual(["• Kotlin 3년", "• Kafka 운영"]);
  });

  describe("우리 안쪽으로는 나가지 않는다", () => {
    const importer = new JobUrlImporter();
    const blocked = [
      "http://127.0.0.1:4000/health/ready",
      "http://localhost:5432/",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.0.0.1/",
      "http://192.168.0.1/",
      "http://[::1]/",
      "file:///etc/passwd",
      "ftp://example.com/jobs",
    ];
    for (const url of blocked) {
      it(url, async () => {
        await expect(importer.read(url)).rejects.toMatchObject({ statusCode: 422 });
      });
    }
  });
});
