import { describe, expect, it } from "vitest";

import { partialJson } from "./partial-json.js";
import { partialRecipeSections } from "./recipe-stream.js";

/**
 * 여기 쓰는 조각들은 **실제로 흐르는 모양 그대로**다 — `RecipeDraftSchema`가
 * 스키마에 적은 순서대로 나오고, 끊기는 자리는 언제나 값 한가운데다.
 *
 * 이 파싱이 조용히 틀어지면 화면은 150초 동안 아무것도 안 보여 준다. 실제로
 * 지면 쪽에서 한 번 그랬고, 그때 서버 로그에는 아무 흔적이 없었다.
 */
const DRAFT = '{"sections":[{"title":"조용히 틀리는 파이프라인을 막다",'
  + '"purpose":"검증을 설계에 넣은 사람이라는 것을 보인다","targetLength":420,'
  + '"goal":"데이터 품질 요건에 답한다","points":["사고 발견 3일"],"metrics":["12분"],'
  + '"tone":"담백하게","format":"narrative","exclude":["과장"],'
  + '"takeaway":"값이 아니라 신뢰를 검증했다","contentPattern":"case-study",'
  + '"interactionOpportunity":null,'
  + '"items":[{"pointText":"환율 컬럼이 3일간 null로 들어왔다","sources":[1]},'
  + '{"pointText":"발견은 재무팀이 먼저였다","sources":[1,2]}]}],'
  + '"unused":[{"source":7,"reason":"이번 공고와 거리가 있음"}]}';

describe("짜이는 레시피 읽기", () => {
  it("다 온 초안을 그대로 읽는다", () => {
    const [section] = partialRecipeSections(DRAFT);
    expect(section?.title).toBe("조용히 틀리는 파이프라인을 막다");
    expect(section?.takeaway).toBe("값이 아니라 신뢰를 검증했다");
    expect(section?.items).toEqual([
      "환율 컬럼이 3일간 null로 들어왔다",
      "발견은 재무팀이 먼저였다",
    ]);
  });

  it("어디서 끊겨도 그 앞까지는 읽는다", () => {
    // 한 글자씩 늘려 가며 읽는다 — 실제로 오는 조각이 이 모양이다.
    for (let at = 1; at <= DRAFT.length; at += 1) {
      expect(() => partialRecipeSections(DRAFT.slice(0, at))).not.toThrow();
    }
    // 마지막 항목의 문구 한가운데. 앞 항목은 이미 다 보여야 한다.
    const cut = DRAFT.indexOf("발견은 재무팀이") + "발견은 재무팀이".length;
    const [section] = partialRecipeSections(DRAFT.slice(0, cut));
    expect(section?.items).toEqual(["환율 컬럼이 3일간 null로 들어왔다", "발견은 재무팀이"]);
  });

  it("값 한가운데서 끊긴 글자는 거기까지 살린다", () => {
    // 이게 없으면 제목은 다 써진 뒤에야 한꺼번에 나타난다.
    const [section] = partialRecipeSections('{"sections":[{"title":"조용히 틀리는 파이');
    expect(section?.title).toBe("조용히 틀리는 파이");
    expect(section?.purpose).toBe("");
  });

  it("이름 한가운데서 끊기면 그 짝은 버린다", () => {
    // `{"title":"가","pur` — 닫아 봐야 `{"pur"}`이라 JSON이 아니다.
    const [section] = partialRecipeSections('{"sections":[{"title":"가","pur');
    expect(section?.title).toBe("가");
  });

  it("아직 아무것도 못 읽으면 빈 배열이다 — 지어내지 않는다", () => {
    expect(partialRecipeSections("")).toEqual([]);
    expect(partialRecipeSections('{"sec')).toEqual([]);
    expect(partialRecipeSections("그냥 글자")).toEqual([]);
  });
});

describe("끝나지 않은 JSON", () => {
  it("열린 것을 안쪽부터 닫는다", () => {
    expect(partialJson('{"a":[{"b":1},{"b":2')).toEqual({ a: [{ b: 1 }, {}] });
    expect(partialJson('{"a":[1,2,')).toEqual({ a: [1, 2] });
  });

  it("끝을 못 만난 숫자는 버린다 — `12`가 `1200`일 수 있다", () => {
    expect(partialJson('{"a":1,"b":12')).toEqual({ a: 1 });
    expect(partialJson('{"a":tru')).toEqual({});
  });

  it("반쪽짜리 이스케이프는 통째로 버린다", () => {
    expect(partialJson('{"a":"줄\\')).toEqual({ a: "줄" });
    expect(partialJson('{"a":"줄\\u00')).toEqual({ a: "줄" });
    expect(partialJson('{"a":"줄\\n다음')).toEqual({ a: "줄\n다음" });
  });
});
