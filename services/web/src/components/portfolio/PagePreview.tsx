"use client";

import { pageDocument, type GeneratedPage } from "@expresso/contracts";

/**
 * 자유 생성 지면을 앱 안에서 보여 준다.
 *
 * **iframe이다.** 블록 지면은 우리 컴포넌트가 그려서 그냥 붙여도 됐지만, 이건
 * 모델이 쓴 CSS 한 덩어리다 — 그대로 붙이면 `body{…}`나 `h1{…}` 같은 선택자가
 * 앱 UI까지 잡아먹는다. 격리가 필요하고, iframe이 브라우저가 주는 가장 확실한
 * 격리다.
 *
 * `sandbox`는 소독기 뒤의 두 번째 방어선이다. 소독을 지난 마크업이라도
 * 우리 오리진에서 스크립트가 돌 길은 열어 두지 않는다 —
 * `allow-same-origin`을 주지 않으므로 이 문서는 우리 쿠키와 저장소에 닿지 못한다.
 *
 * 그리고 **배포되는 문서와 같은 `pageDocument()`를 쓴다.** 미리보기가 실제와
 * 달라지면 보고 고치는 의미가 없다.
 */
export function PagePreview({
  page,
  title,
  className,
}: {
  page: GeneratedPage;
  title: string;
  className?: string;
}) {
  return (
    <iframe
      className={className}
      // 제목은 스크린리더가 이 틀을 뭐라고 부를지다.
      title={`${title} 미리보기`}
      sandbox=""
      srcDoc={pageDocument({
        html: page.html,
        css: page.css,
        title,
        description: page.rationale,
        ...(page.styleSpec ? { grammar: page.styleSpec } : {}),
      })}
    />
  );
}
