import { describe, expect, it } from "vitest";
import { appendWorkMaterials } from "./work-materials.js";

const image = { kind: "image" as const, src: "/v1/media/11111111-1111-4111-8111-111111111111", url: null, caption: "상품 상세 화면" };
const site = { kind: "site" as const, src: "/v1/media/22222222-2222-4222-8222-222222222222", url: "https://shop.example.com", caption: "운영 중인 [쇼핑몰]\n첫 화면" };
const repo = { kind: "repo" as const, src: null, url: "https://github.com/a/shop", caption: "Next.js 상품 상세 · 장바구니" };

describe("작업물을 기록 본문에 붙이기", () => {
  it("절이 없으면 본문 끝에 「작업물」 절을 새로 만든다 — 그림 · 사이트 · 레포를 줄로 편다", () => {
    const body = appendWorkMaterials("## 한 일\n상품 상세를 옮겼다.\n", [image, site, repo]);
    expect(body).toBe([
      "## 한 일", "상품 상세를 옮겼다.", "", "## 작업물", "",
      `![상품 상세 화면](${image.src})`, "",
      `![운영 중인 쇼핑몰 첫 화면](${site.src})`, "[사이트 열기](https://shop.example.com) — 운영 중인 쇼핑몰 첫 화면", "",
      "[저장소 a/shop](https://github.com/a/shop) — Next.js 상품 상세 · 장바구니", "",
    ].join("\n"));
  });

  it("절이 있으면 그 절 끝(다음 머리줄 앞)에 잇고, 앞선 줄과 뒤 절은 그대로 둔다", () => {
    const body = appendWorkMaterials("## 작업물\n\n![옛 그림](/v1/media/x)\n\n## 배운 점\n경계를 먼저 정한다.", [image]);
    expect(body).toBe(["## 작업물", "", "![옛 그림](/v1/media/x)", "", `![상품 상세 화면](${image.src})`, "", "## 배운 점", "경계를 먼저 정한다.", ""].join("\n"));
  });

  it("빈 본문에도 붙인다", () => {
    expect(appendWorkMaterials("", [repo])).toBe("## 작업물\n\n[저장소 a/shop](https://github.com/a/shop) — Next.js 상품 상세 · 장바구니\n");
  });
});
