import { API_PREFIX } from "./common.js";

/**
 * 회사 마크를 내려받는 우리 주소.
 *
 * 회사 서버를 그대로 링크하지 않는다 — 보는 사람의 IP가 그 회사로 간다. 한 번 받아 둔
 * 바이트를 이 주소로 내보낸다. 끝의 `v=`는 내용 지문 앞 16자라, 그림이 바뀌면 주소도
 * 바뀌어 캐시가 저절로 갈린다. 받아 둔 마크가 없으면 null이고 화면은 이니셜로 그린다.
 */
export function companyLogoUrl(companyId: string, checksum: string | null | undefined): string | null {
  return checksum ? `${API_PREFIX}/companies/${companyId}/logo?v=${checksum.slice(0, 16)}` : null;
}
