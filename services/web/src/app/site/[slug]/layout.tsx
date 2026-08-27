import type { ReactNode } from "react";

/**
 * 공개 포트폴리오는 **늘 밝습니다.**
 *
 * 앱 화면은 OS 설정과 계정 선택을 따라 어두워지지만, 이 지면은 방문자가 볼
 * 포트폴리오를 그대로 보여주는 자리입니다. 앱이 어두워졌다고 함께 어두워지면
 * 주인이 보는 것과 방문자가 보는 것이 갈립니다.
 *
 * 포트폴리오 지면 자체의 다크 모드는 따로 하는 일입니다 — 그때는 앱 테마가
 * 아니라 포트폴리오가 고른 테마를 따라야 합니다.
 *
 * `display: contents`라 이 요소는 배치에 끼어들지 않고, 토큰만 아래로
 * 흘려보냅니다.
 */
export default function PublicSiteLayout({ children }: { children: ReactNode }) {
  return (
    <div data-theme="light" style={{ display: "contents" }}>
      {children}
    </div>
  );
}
