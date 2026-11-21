import { expect, it } from "vitest";

import { findDuplicates, homepageKey, registrableDomain, titleKeys, type DedupeRow } from "./dedupe.js";

const row = (id: string, title: string, deadlineOn: string, homepageUrl: string | null = null, kind: DedupeRow["kind"] = "contest"): DedupeRow => ({
  id, source: id.split(":")[0] as DedupeRow["source"], kind, title, deadlineOn, homepageUrl,
});

it("등록 도메인은 한국 2단계 접미사를 안다", () => {
  expect(registrableDomain("prompt2026.sto.or.kr")).toBe("sto.or.kr");
  expect(registrableDomain("www.mogefdatacontest.co.kr")).toBe("mogefdatacontest.co.kr");
  expect(registrableDomain("sprint.codeit.kr")).toBe("codeit.kr");
  expect(homepageKey("https://luma.com/vc6rmvaz")).toBe("luma.com/vc6rmvaz");
  expect(homepageKey("https://luma.com/")).toBeNull();
});

it("제목 열쇠는 연도 · 회차 · 괄호 · 모집 꼬리를 지운다", () => {
  expect(titleKeys("[2026 서울관광 프롬프톤] 참가자모집")).toContain("서울관광프롬프톤");
  expect(titleKeys("2026 서울관광 프롬프톤 (Seoul Tourism Prompt-thon)")).toContain("서울관광프롬프톤");
  expect(titleKeys("[한국사회보장정보원] 2026 사회보장 데이터를 활용한 AI 혁신 아이디어 경진대회")).toContain("사회보장데이터를활용한ai혁신아이디어경진대회");
});

it("측정한 겹침을 묶고 대표는 상세 항목이 많은 출처다", () => {
  const rows = [
    row("devevent:a", "2026 대구광역시 기후·환경·탄소중립 공공데이터 AI 활용대회", "2026-11-20", "https://www.dcnc.or.kr/bbs/board.php?bo_table=notice&wr_id=193"),
    row("wevity:111567", "2026 대구광역시 기후·환경·탄소중립 공공 데이터 AI 활용대회", "2026-11-20", "https://dcnc.or.kr/bbs/board.php?bo_table=notice&wr_id=193"),
    row("contestkorea:1", "2026 대구광역시 기후·환경·탄소중립 공공데이터 AI 활용대회", "2026-11-20"),
    row("linkareer:1", "2026 사회보장 데이터를 활용한 AI 혁신 아이디어 경진대회", "2026-11-20"),
    row("linkareer:2", "[한국사회보장정보원] 2026 사회보장 데이터를 활용한 AI 혁신 아이디어 경진대회", "2026-11-20"),
  ];
  const result = findDuplicates(rows);
  expect(result.get("wevity:111567")).toBeNull();
  expect(result.get("devevent:a")).toBe("wevity:111567");
  expect(result.get("contestkorea:1")).toBe("wevity:111567");
  expect(result.get("linkareer:1")).toBeNull();
  expect(result.get("linkareer:2")).toBe("linkareer:1");
});

it("마감일이 다르거나, 한 출처 안에서 도메인만 같으면 묶지 않는다. 부트캠프는 묶지 않는다", () => {
  const result = findDuplicates([
    row("linkareer:1", "2026 부산 지역어 알리기 한 장 만화 공모전", "2026-11-22", "https://urimal.or.kr/a"),
    row("linkareer:2", "2026 아름다운 우리말 달력 만들기 공모전", "2026-11-22", "https://urimal.or.kr/b"),
    row("wevity:3", "2026 아름다운 우리말 달력 만들기 공모전", "2026-11-30"),
    row("boottent:a", "백엔드 과정 4기", "2026-11-29", null, "bootcamp"),
    row("boottent:b", "백엔드 과정 4기", "2026-11-29", null, "bootcamp"),
  ]);
  expect([...result.values()].every((value) => value === null)).toBe(true);
});
