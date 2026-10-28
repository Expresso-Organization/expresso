import { RESERVED_SLUGS, SlugSchema } from "@expresso/contracts";

/**
 * 공개 포트폴리오의 주소.
 *
 * 주소는 `{slug}.{NEXT_PUBLIC_SITE_HOST}`이다. 운영은 `expresso.ai.kr`이다. 로컬은
 * `site.localhost:3000`처럼 둔다 — 브라우저가 `*.localhost`를 루프백으로 풀고, 워크트리
 * 웹이 쓰는 `<이름>.localhost`와 겹치지 않게 한 단계를 더 둔다.
 *
 * 빌드할 때 번들에 들어가는 값이라 화면과 프록시가 같은 값을 본다.
 */
export const PUBLIC_SITE_HOST = (process.env.NEXT_PUBLIC_SITE_HOST || "expresso.ai.kr").toLowerCase();

const LOCAL_HOST = /(^|\.)localhost(:\d+)?$/;

export function publicSiteHost(slug: string): string {
  return `${slug}.${PUBLIC_SITE_HOST}`;
}

export function publicSiteUrl(slug: string): string {
  return `${LOCAL_HOST.test(PUBLIC_SITE_HOST) ? "http" : "https"}://${publicSiteHost(slug)}`;
}

/**
 * 요청 호스트가 공개 사이트 주소인가.
 *
 * `site`는 공개 주소 아래의 호스트이고 `slug`는 그 이름이다. 이름이 주소 규칙에 맞지
 * 않거나 예약어면 `slug`가 null이다 — 그 호스트에는 아무 사이트도 없다. 공개 주소
 * 아래가 아니면 `site`가 false다.
 */
export function publicSiteFromHost(host: string | null): { site: false } | { site: true; slug: string | null } {
  const name = (host ?? "").toLowerCase();
  const suffix = `.${PUBLIC_SITE_HOST}`;
  if (!name.endsWith(suffix)) return { site: false };
  const label = name.slice(0, -suffix.length);
  const valid = SlugSchema.safeParse(label).success && !(RESERVED_SLUGS as readonly string[]).includes(label);
  return { site: true, slug: valid ? label : null };
}
