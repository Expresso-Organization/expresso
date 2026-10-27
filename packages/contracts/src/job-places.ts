/**
 * 국내 근무지 장소와 대략의 중심 좌표.
 *
 * "판교"를 찾으면 판교 공고를 먼저, 그 아래에 판교에서 가까운 공고를 보여
 * 주려고 있다. 지역(`서울` · `경기`) 하나로 거르면 판교와 평택이 같은 취급을
 * 받고, 판교에서 10km 남짓인 서울 강남은 지역이 달라 아예 빠진다.
 *
 * 좌표는 구청 · 시청이나 그 동네 중심의 **대략값**이다. 공고 원문은 "판교
 * 오피스"처럼 주소가 아닌 경우가 많아 지오코딩해도 정확해지지 않고, 외부
 * API를 부르면 검색 한 번에 기다릴 자리가 하나 더 는다. 수 km 오차는 "가까운
 * 순"을 바꾸지 않는다.
 *
 * 백엔드(공고 원문에서 장소 읽기 · 거리 정렬)와 웹(검색어가 국내 장소인지
 * 판단)이 함께 쓴다. 지역 이름 사전은 `services/backend/.../ingest/classify.ts`의
 * `REGION_RULES`와 맞춰 둔다 — 그쪽 테스트가 이 표와 어긋나면 깨진다.
 */
export interface KoreanPlace {
  /** 화면과 검색 조건에 쓰는 이름. "판교" · "강남". */
  name: string;
  /** 이 장소가 속한 지역. `location_region` 값과 같다. */
  region: "서울" | "경기";
  lat: number;
  lng: number;
  /**
   * 구 · 시보다 좁은 동네인가. 원문에 "성남시 분당구"처럼 둘 다 적혀 있으면
   * 좁은 쪽(분당)으로 읽어야 거리가 맞는다.
   */
  neighborhood?: true;
  /** 원문에 영문으로 적힌 경우. 소문자. */
  aliases?: readonly string[];
}

export const KOREAN_PLACES: readonly KoreanPlace[] = [
  // ── 서울 동네 ──
  { name: "여의도", region: "서울", lat: 37.5219, lng: 126.9245, neighborhood: true },
  { name: "가산", region: "서울", lat: 37.4786, lng: 126.8826, neighborhood: true },
  { name: "잠실", region: "서울", lat: 37.5133, lng: 127.1001, neighborhood: true },
  { name: "역삼", region: "서울", lat: 37.5006, lng: 127.0365, neighborhood: true },
  { name: "선릉", region: "서울", lat: 37.5045, lng: 127.049, neighborhood: true },
  { name: "홍대", region: "서울", lat: 37.5563, lng: 126.9236, neighborhood: true },
  { name: "을지로", region: "서울", lat: 37.566, lng: 126.991, neighborhood: true },
  { name: "성수", region: "서울", lat: 37.5446, lng: 127.0559, neighborhood: true },
  // ── 서울 25개 자치구 ──
  { name: "강남", region: "서울", lat: 37.5172, lng: 127.0473, aliases: ["gangnam"] },
  { name: "강동", region: "서울", lat: 37.5301, lng: 127.1238 },
  { name: "강북", region: "서울", lat: 37.6396, lng: 127.0257 },
  { name: "강서", region: "서울", lat: 37.5509, lng: 126.8495 },
  { name: "관악", region: "서울", lat: 37.4784, lng: 126.9516 },
  { name: "광진", region: "서울", lat: 37.5385, lng: 127.0823 },
  { name: "구로", region: "서울", lat: 37.4955, lng: 126.8875 },
  { name: "금천", region: "서울", lat: 37.4569, lng: 126.8955 },
  { name: "노원", region: "서울", lat: 37.6542, lng: 127.0568 },
  { name: "도봉", region: "서울", lat: 37.6688, lng: 127.0471 },
  { name: "동대문", region: "서울", lat: 37.5744, lng: 127.04 },
  { name: "동작", region: "서울", lat: 37.5124, lng: 126.9393 },
  { name: "마포", region: "서울", lat: 37.5663, lng: 126.9019 },
  { name: "서대문", region: "서울", lat: 37.5791, lng: 126.9368 },
  { name: "서초", region: "서울", lat: 37.4837, lng: 127.0324 },
  { name: "성동", region: "서울", lat: 37.5634, lng: 127.0369 },
  { name: "성북", region: "서울", lat: 37.5894, lng: 127.0167 },
  { name: "송파", region: "서울", lat: 37.5145, lng: 127.1059 },
  { name: "양천", region: "서울", lat: 37.517, lng: 126.8665 },
  { name: "영등포", region: "서울", lat: 37.5264, lng: 126.8962 },
  { name: "용산", region: "서울", lat: 37.5326, lng: 126.9905 },
  { name: "은평", region: "서울", lat: 37.6027, lng: 126.9291 },
  { name: "종로", region: "서울", lat: 37.5735, lng: 126.979 },
  { name: "중구", region: "서울", lat: 37.5641, lng: 126.9979 },
  { name: "중랑", region: "서울", lat: 37.6066, lng: 127.0927 },
  // ── 경기 신도시 ──
  { name: "판교", region: "경기", lat: 37.3947, lng: 127.1112, neighborhood: true, aliases: ["pangyo"] },
  { name: "분당", region: "경기", lat: 37.3826, lng: 127.1189, neighborhood: true, aliases: ["bundang"] },
  { name: "동탄", region: "경기", lat: 37.2005, lng: 127.074, neighborhood: true },
  { name: "일산", region: "경기", lat: 37.6584, lng: 126.775, neighborhood: true, aliases: ["ilsan"] },
  // ── 경기 시 · 군(광주시는 뺐다 — 광주광역시와 이름이 겹친다) ──
  { name: "성남", region: "경기", lat: 37.42, lng: 127.1265, aliases: ["seongnam"] },
  { name: "수원", region: "경기", lat: 37.2636, lng: 127.0286, aliases: ["suwon"] },
  { name: "안양", region: "경기", lat: 37.3943, lng: 126.9568, aliases: ["anyang"] },
  { name: "안산", region: "경기", lat: 37.3219, lng: 126.8309, aliases: ["ansan"] },
  { name: "용인", region: "경기", lat: 37.2411, lng: 127.1776, aliases: ["yongin"] },
  { name: "부천", region: "경기", lat: 37.5034, lng: 126.766, aliases: ["bucheon"] },
  { name: "평택", region: "경기", lat: 36.9921, lng: 127.1129, aliases: ["pyeongtaek"] },
  { name: "동두천", region: "경기", lat: 37.9036, lng: 127.0606 },
  { name: "광명", region: "경기", lat: 37.4786, lng: 126.8646 },
  { name: "안성", region: "경기", lat: 37.008, lng: 127.2797 },
  { name: "김포", region: "경기", lat: 37.6153, lng: 126.7156, aliases: ["gimpo"] },
  { name: "군포", region: "경기", lat: 37.3617, lng: 126.9352 },
  { name: "이천", region: "경기", lat: 37.2723, lng: 127.435 },
  { name: "양주", region: "경기", lat: 37.7853, lng: 127.0458 },
  { name: "오산", region: "경기", lat: 37.1499, lng: 127.0774 },
  { name: "구리", region: "경기", lat: 37.5943, lng: 127.1296 },
  { name: "의왕", region: "경기", lat: 37.3448, lng: 126.9683 },
  { name: "하남", region: "경기", lat: 37.5393, lng: 127.2148 },
  { name: "여주", region: "경기", lat: 37.2984, lng: 127.637 },
  { name: "파주", region: "경기", lat: 37.76, lng: 126.78 },
  { name: "시흥", region: "경기", lat: 37.38, lng: 126.803 },
  { name: "화성", region: "경기", lat: 37.1995, lng: 126.8312, aliases: ["hwaseong"] },
  { name: "양평", region: "경기", lat: 37.4917, lng: 127.4875 },
  { name: "과천", region: "경기", lat: 37.4292, lng: 126.9876 },
  { name: "고양", region: "경기", lat: 37.6584, lng: 126.832, aliases: ["goyang"] },
  { name: "남양주", region: "경기", lat: 37.636, lng: 127.2165, aliases: ["namyangju"] },
  { name: "의정부", region: "경기", lat: 37.7381, lng: 127.0337, aliases: ["uijeongbu"] },
  { name: "포천", region: "경기", lat: 37.8949, lng: 127.2003 },
  { name: "연천", region: "경기", lat: 38.0966, lng: 127.0748 },
  { name: "가평", region: "경기", lat: 37.8315, lng: 127.5105 },
];

/**
 * 장소 검색의 반경(km). 이 안에 든 공고만 "근처"로 보여 준다.
 *
 * 20km면 판교에서 서울 강남 · 서초 · 송파와 수원 · 용인까지 든다 — 출퇴근을
 * 생각하고 고르는 거리다. 넓히면 "근처"가 경기 전체와 다를 바가 없어진다.
 */
export const NEARBY_RADIUS_KM = 20;

const PLACE_BY_NAME = new Map(KOREAN_PLACES.map((place) => [place.name, place]));

export function koreanPlace(name: string): KoreanPlace | undefined {
  return PLACE_BY_NAME.get(name.trim());
}

/**
 * 원문에서 장소를 찾는 순서. **좁은 동네 → 긴 이름 먼저.**
 *
 * "경기도 성남시 분당구"는 성남과 분당이 다 걸리는데 분당으로 읽어야 하고,
 * "남양주"는 "양주"를 품고 있어 긴 쪽부터 봐야 한다.
 */
export const KOREAN_PLACES_BY_SPECIFICITY: readonly KoreanPlace[] = [...KOREAN_PLACES].sort(
  (a, b) => Number(Boolean(b.neighborhood)) - Number(Boolean(a.neighborhood)) || b.name.length - a.name.length,
);

/** 글 안에 적힌 국내 장소 하나. 없으면 undefined. */
export function findKoreanPlace(text: string): KoreanPlace | undefined {
  const lowered = text.normalize("NFKC").toLocaleLowerCase("en-US");
  return KOREAN_PLACES_BY_SPECIFICITY.find(
    (place) => lowered.includes(place.name) || place.aliases?.some((alias) => lowered.includes(alias)),
  );
}

/**
 * 두 지점 사이 거리(km). 등장방형 근사다.
 *
 * 수도권 안(100km 남짓)에서는 대원거리와 1% 안쪽으로 같고, 같은 식을 Mongo
 * 집계에서도 그대로 쓸 수 있다(`$sqrt` · `$multiply`만 쓴다).
 */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dy = (a.lat - b.lat) * KM_PER_DEGREE_LAT;
  const dx = (a.lng - b.lng) * kmPerDegreeLng(b.lat);
  return Math.sqrt(dx * dx + dy * dy);
}

export const KM_PER_DEGREE_LAT = 110.574;

export function kmPerDegreeLng(lat: number): number {
  return 111.32 * Math.cos((lat * Math.PI) / 180);
}
