import { expect, it } from "vitest";

import { hasCandidates, hasRelevantNews, lacksNumbers, matchedTerms, pickCandidates, userTerms, type ActivityInput, type JobInput, type RecordInput } from "./candidates.js";

const record = (id: string, categoryKey: string, title: string, bodyMd = "본문 1건", properties: Record<string, unknown> = {}, isEmpty = false): RecordInput =>
  ({ id, title, categoryKey, categoryName: categoryKey, bodyMd, properties, isEmpty });
const job = (id: string, title: string, technologies: string[] = [], createdAt = "2026-11-15T00:00:00.000Z", daysLeft: number | null = 20): JobInput =>
  ({ id, title, company: "회사", avatar: { name: "회사", initial: null, avatarBackground: null, avatarColor: null, logoUrl: null }, family: "프론트엔드", technologies, daysLeft, createdAt });
const activity = (id: string, title: string, daysLeft: number, firstSeenAt = "2026-11-15T00:00:00.000Z"): ActivityInput =>
  ({ id, kind: "contest", title, host: "주최", fields: ["웹/모바일/IT"], url: `https://example.test/${id}`, daysLeft, firstSeenAt });

const RECORDS = [
  record("s1", "skill_tool", "웹 성능 측정(Lighthouse · Web Vitals)"),
  record("s2", "skill_tool", "React · Next.js"),
  record("p1", "project", "개인 가계부 PWA", "결제 내역 1,200건을 오프라인에서 기록한다.", { stack: ["Vite", "IndexedDB"] }),
];
const base = { records: RECORDS, jobs: [], watched: [], activities: [], seenThrough: null, exclude: new Set<string>() };

it("스킬 기록의 제목과 다른 기록의 스택 속성에서 기술 용어를 뽑는다", () => {
  expect(userTerms(RECORDS)).toEqual(["웹 성능 측정", "Lighthouse", "Web Vitals", "React", "Next.js", "Vite", "IndexedDB"]);
});

it("영문 용어는 낱말 경계를 본다", () => {
  expect(matchedTerms("Google Cloud 엔지니어", ["Go"])).toEqual([]);
  expect(matchedTerms("Go 백엔드 개발자", ["Go"])).toEqual(["Go"]);
  expect(matchedTerms("프론트엔드(React/Next.js)", ["React", "Next.js"])).toEqual(["React", "Next.js"]);
});

it("새 공고는 내 기술과 겹치는 것만, 많이 겹치는 순으로 고른다", () => {
  const { jobs } = pickCandidates({ ...base, jobs: [job("a", "백엔드 개발자", ["Java"]), job("b", "프론트엔드 개발자", ["React"]), job("c", "웹 프론트엔드", ["React", "Next.js"])] });
  expect(jobs.map(({ id, matched }) => [id, matched])).toEqual([["c", ["React", "Next.js"]], ["b", ["React"]]]);
});

it("지난 실행 뒤에 수집된 것만 새 소식이다", () => {
  const seenThrough = new Date("2026-11-14T00:00:00.000Z");
  const picked = pickCandidates({
    ...base,
    seenThrough,
    jobs: [job("old", "React 개발자", ["React"], "2026-11-13T00:00:00.000Z"), job("new", "React 개발자", ["React"], "2026-11-15T00:00:00.000Z")],
    activities: [activity("old", "지난 공모전", 5, "2026-11-10T00:00:00.000Z"), activity("new", "새 공모전", 9)],
  });
  expect(picked.jobs.map(({ id }) => id)).toEqual(["new"]);
  expect(picked.activities.map(({ id }) => id)).toEqual(["new"]);
});

it("7일 안에 마감되는 관심 공고는 기술이 안 겹치고 오래됐어도 넣는다", () => {
  const seenThrough = new Date("2026-11-14T00:00:00.000Z");
  const watched = [job("w1", "소프트웨어 개발 전문가", [], "2026-10-13T00:00:00.000Z", 3), job("w2", "먼 마감", [], "2026-10-13T00:00:00.000Z", 30)];
  const { jobs } = pickCandidates({ ...base, seenThrough, watched });
  expect(jobs.map(({ id, watched: isWatched }) => [id, isWatched])).toEqual([["w1", true]]);
});

it("관심 없다고 한 대상과 이미 제안한 대상은 뺀다", () => {
  const picked = pickCandidates({
    ...base,
    jobs: [job("a", "React 개발자", ["React"])],
    activities: [activity("x", "공모전", 3)],
    records: [...RECORDS, record("e1", "project", "빈 프로젝트", "", {}, true)],
    exclude: new Set(["job:a", "activity:x", "record:e1"]),
  });
  expect(hasCandidates(picked)).toBe(false);
});

it("활동은 마감이 가까운 순으로 고른다", () => {
  const { activities } = pickCandidates({ ...base, activities: [activity("far", "먼 공모전", 30), activity("near", "가까운 공모전", 2)] });
  expect(activities.map(({ id }) => id)).toEqual(["near", "far"]);
});

it("비어 있거나 성과에 숫자가 없는 기록을 손볼 기록으로 고른다", () => {
  const records = [...RECORDS, record("e1", "project", "빈 프로젝트", "", {}, true), record("n1", "experience", "스터디 운영", "격주로 스터디를 열었다.")];
  expect(pickCandidates({ ...base, records }).weakRecords).toEqual([
    { id: "e1", title: "빈 프로젝트", categoryKey: "project", categoryName: "project", why: "empty" },
    { id: "n1", title: "스터디 운영", categoryKey: "experience", categoryName: "experience", why: "no_numbers" },
  ]);
  // 성과 속성에 숫자가 있으면 본문에 없어도 된다. 스킬 기록은 세지 않는다.
  expect(lacksNumbers(record("n2", "experience", "스터디", "격주 스터디.", { outcome: "30회 진행" }))).toBe(false);
  expect(lacksNumbers(record("s9", "skill_tool", "Vitest", "단위 테스트."))).toBe(false);
});

it("새 소식이 내 기술과 맞을 때만 관련 있는 새 소식이다", () => {
  const unrelated = pickCandidates({ ...base, activities: [activity("x", "AI 영상 공모전", 3)], watched: [job("w", "관심 공고", [], "2026-10-01T00:00:00.000Z", 2)] });
  expect(hasCandidates(unrelated)).toBe(true);
  expect(hasRelevantNews(unrelated)).toBe(false);
  expect(hasRelevantNews(pickCandidates({ ...base, jobs: [job("a", "React 개발자", ["React"])] }))).toBe(true);
});
