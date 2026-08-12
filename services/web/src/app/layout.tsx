import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

// §3.5 Phosphor Icons 2.1 — regular / fill / bold 세 굵기만 쓴다.
import "@phosphor-icons/web/regular";
import "@phosphor-icons/web/fill";
import "@phosphor-icons/web/bold";

import "@/styles/global.css";

export const metadata: Metadata = {
  title: "Expresso",
  description:
    "커리어 기록을 모아 채용 공고에 맞춘 포트폴리오를 만들고 링크 하나로 배포합니다.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* §12 폰트 로딩 — Pretendard는 dynamic-subset, 나머지는 필요한 굵기만 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
