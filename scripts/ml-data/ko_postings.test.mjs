import assert from "node:assert/strict";
import { test } from "node:test";

import { isKoreanMajor, toRow } from "./ko_postings.mjs";

test("본문의 한글 글자가 라틴 글자보다 많으면 한국어 공고다", () => {
  assert.equal(isKoreanMajor("백엔드 개발자를 찾습니다. Java, Spring"), true);
  assert.equal(isKoreanMajor("We are hiring a backend engineer (백엔드)"), false);
  assert.equal(isKoreanMajor(""), false);
});

test("공고 행은 평가에 쓰는 칸만 남긴다", () => {
  assert.deepEqual(toRow({ _id: "a", title: "백엔드", sourceBoard: "당근", jobFamily: "백엔드", descriptionRaw: "본문", requirements: { technologies: [] } }), {
    jobId: "a",
    title: "백엔드",
    sourceBoard: "당근",
    jobFamily: "백엔드",
    descriptionRaw: "본문",
  });
});
