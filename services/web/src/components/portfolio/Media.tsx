import type { MediaFrame, PortfolioMedia } from "@expresso/contracts";
import { mediaAssetUrl, mediaSrcSet } from "@expresso/contracts";

import { API_BASE_URL } from "@/lib/api/client";

/**
 * 지면 위의 이미지.
 *
 * **액자를 우리가 그린다.** 제품 화면 캡처는 액자가 있어야 제품으로 보인다 —
 * 브라우저 창이나 폰 몸체 없이 스크린샷만 눕히면 그건 그냥 이미지 파일이다.
 * 액자를 우리가 그리면 사용자가 목업 도구를 따로 쓸 필요가 없고, 액자의 색도
 * 지면의 팔레트를 따라간다.
 *
 * 액자는 `currentColor`와 팔레트 토큰으로만 그린다. 여기서 회색을 하나 지어내면
 * 어두운 지면에서 그 회색만 혼자 떠오른다.
 */

/** 자리를 미리 잡는다. 그림이 늦게 떠도 글이 밀리지 않는다. */
function ratio(media: PortfolioMedia): { aspectRatio?: string } {
  if (!media.width || !media.height) return {};
  return { aspectRatio: `${media.width} / ${media.height}` };
}

/**
 * 이 그림이 실제로 얼마나 넓게 놓이는가.
 *
 * 브라우저는 `srcset`에서 고를 때 **배치 폭을 알아야** 한다. 우리가 그걸 정확히
 * 알 수는 없지만 — 지면을 모델이 짜므로 — 액자가 힌트를 준다. 폰 액자는 폭이
 * 고정이고(`max-w-xs`), 나머지는 좁은 화면에서 폭을 다 쓰고 넓은 화면에서는
 * 글 단만큼이다.
 */
const SIZES: Record<MediaFrame, string> = {
  phone: "320px",
  browser: "(max-width: 768px) 100vw, 1280px",
  none: "(max-width: 768px) 100vw, 1280px",
};

function Picture({ media, className }: { media: PortfolioMedia; className?: string }) {
  const srcSet = mediaSrcSet(API_BASE_URL, media);
  return (
    // 자산 서버가 폭별로 내보낸다. Next의 최적화 파이프라인은 태우지 않는다 —
    // 공개 지면은 이 컴포넌트를 서버 밖에서도 그린다.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={mediaAssetUrl(API_BASE_URL, media.assetId, media.variants.at(-1))}
      {...(srcSet ? { srcSet, sizes: SIZES[media.frame] } : {})}
      alt={media.alt}
      {...(media.width ? { width: media.width } : {})}
      {...(media.height ? { height: media.height } : {})}
      loading="lazy"
      decoding="async"
      className={`w-full h-auto ${className ?? ""}`}
      style={ratio(media)}
    />
  );
}

/** 브라우저 창. 신호등 셋과 주소 자리만 — 실제 크롬을 흉내 내지 않는다. */
function BrowserFrame({ media }: { media: PortfolioMedia }) {
  return (
    <div className="rounded-xl overflow-hidden border border-hairline bg-ink/5">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-hairline">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-ink/20" />
          <span className="size-2 rounded-full bg-ink/20" />
          <span className="size-2 rounded-full bg-ink/20" />
        </span>
        <span className="grow h-3 rounded-full bg-ink/5" />
      </div>
      <Picture media={media} className="block" />
    </div>
  );
}

/** 폰 몸체. 위쪽에 노치 자리 하나, 테두리는 도톰하게. */
function PhoneFrame({ media }: { media: PortfolioMedia }) {
  return (
    <div className="mx-auto max-w-xs rounded-3xl border-4 border-ink/80 overflow-hidden bg-ink/5">
      <div className="flex justify-center py-1.5">
        <span className="h-1 w-12 rounded-full bg-ink/20" />
      </div>
      <Picture media={media} className="block" />
    </div>
  );
}

export function MediaView({ media, className }: { media: PortfolioMedia; className: string }) {
  return (
    <figure className={className}>
      {media.frame === "browser" ? <BrowserFrame media={media} /> : null}
      {media.frame === "phone" ? <PhoneFrame media={media} /> : null}
      {media.frame === "none" ? <Picture media={media} /> : null}
      {media.caption ? (
        <figcaption className="text-step-1 font-body text-muted mt-2">{media.caption}</figcaption>
      ) : null}
    </figure>
  );
}
