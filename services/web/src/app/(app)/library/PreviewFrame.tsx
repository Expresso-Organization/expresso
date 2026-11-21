"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 지면 미리보기 틀. 다 그려진 뒤에 나타난다(`data-loaded`) — 반쯤 그려진 지면이 튀어나오지 않는다.
 *
 * 하이드레이션 전에 다 불러온 틀은 `load`를 다시 보내지 않으므로, 마운트할 때 문서 상태를 한 번 본다.
 * 미리보기는 같은 출처(`/edit/:id/preview`)라 문서를 읽을 수 있다.
 */
export function PreviewFrame({ src, title, className }: { src: string; title: string; className?: string | undefined }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (doc?.readyState === "complete" && doc.URL !== "about:blank") setLoaded(true);
  }, []);
  return (
    <iframe
      ref={frame}
      src={src}
      title={title}
      loading="lazy"
      tabIndex={-1}
      // 축소본이라 지면 안을 넘겨 보는 자리가 아니다. 틀 자체가 스크롤을 갖지 않게 한다.
      scrolling="no"
      className={className}
      data-loaded={loaded || undefined}
      onLoad={() => setLoaded(true)}
    />
  );
}
