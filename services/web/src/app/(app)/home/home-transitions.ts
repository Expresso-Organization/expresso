/**
 * 제안 칸이 바뀌는 갱신(관심 없음 · 다시 받기 · 새 제안)의 전환 타입.
 *
 * 카드가 빠져 홈이 화면보다 짧아지면 브라우저가 스크롤을 위로 당겨 카드 밖의 홈 전체가 한 번에 내려간다.
 * 이 타입이 달린 갱신에서만 홈 전체(page.tsx의 `home` 경계)를 교차시켜 누르기 전 화면에서 새 화면으로 잇는다.
 * 서버 화면(page.tsx)도 읽으므로 "use client" 모듈에 두지 않는다.
 */
export const PROPOSAL_FEED_CHANGE = "proposal-feed-change";
