import type { ReactNode } from "react";

import { AppChrome } from "@/components/shell/AppChrome";

/**
 * 앱 셸 화면 전체가 같이 쓰는 레이아웃.
 *
 * 셸을 화면 구간마다 따로 그리면, 홈 → 탐색처럼 구간을 옮길 때 Next가 레이아웃을
 * 새로 마운트해 사이드바가 스켈레톤부터 다시 선다. 여기 한 곳에 두면 이동 사이에
 * 레이아웃이 남고 본문만 바뀐다(Next 문서 layouts-and-pages: layouts preserve
 * state and do not rerender on navigation).
 *
 * 셸 없이 화면 전체를 쓰는 편집기는 `(editor)` 그룹에 있다.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppChrome>{children}</AppChrome>;
}
