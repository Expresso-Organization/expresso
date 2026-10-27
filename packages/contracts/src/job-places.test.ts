import { describe, expect, it } from "vitest";

import { KOREAN_PLACES, NEARBY_RADIUS_KM, distanceKm, findKoreanPlace, koreanPlace } from "./job-places.js";

const place = (name: string) => {
  const found = koreanPlace(name);
  if (!found) throw new Error(`${name} 없음`);
  return found;
};

describe("국내 장소 사전", () => {
  it("원문에서 좁은 동네를 먼저 읽는다 — 성남시 분당구는 분당이다", () => {
    expect(findKoreanPlace("경기도 성남시 분당구 불정로 90 (정자동)")?.name).toBe("분당");
    expect(findKoreanPlace("판교 오피스")?.name).toBe("판교");
    expect(findKoreanPlace("경기도 안양시 만안구 안양로 443")?.name).toBe("안양");
  });

  it("긴 이름을 먼저 본다 — 남양주를 양주로 읽지 않는다", () => {
    expect(findKoreanPlace("경기도 남양주시 다산동")?.name).toBe("남양주");
  });

  it("영문 표기도 읽는다", () => {
    expect(findKoreanPlace("Pangyo, Seongnam-si")?.name).toBe("판교");
  });

  it("모르는 곳은 지어내지 않는다", () => {
    expect(findKoreanPlace("서울")).toBeUndefined();
    expect(findKoreanPlace("Remote")).toBeUndefined();
  });

  it("거리가 실제와 맞는 크기다 — 판교에서 강남은 반경 안, 평택은 밖", () => {
    const pangyo = place("판교");
    expect(distanceKm(place("분당"), pangyo)).toBeLessThan(3);
    expect(distanceKm(place("강남"), pangyo)).toBeGreaterThan(10);
    expect(distanceKm(place("강남"), pangyo)).toBeLessThan(NEARBY_RADIUS_KM);
    expect(distanceKm(place("평택"), pangyo)).toBeGreaterThan(NEARBY_RADIUS_KM);
  });

  it("이름이 겹치지 않는다", () => {
    expect(new Set(KOREAN_PLACES.map((one) => one.name)).size).toBe(KOREAN_PLACES.length);
  });
});
