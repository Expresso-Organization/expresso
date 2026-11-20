import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * 사용자가 준 주소를 서버가 부르기 전에 우리 안쪽(사설망 · 루프백 · 링크로컬 · 클라우드 메타데이터)으로 들어가지 못하게 막는다.
 *
 * 공고 주소 읽기(`jobs/ingest/url-import.ts`)와 같은 대역을 막는다. 작업물 재료(사이트 찍기 · 레포 읽기)가 함께 쓴다.
 */
const BLOCKED_V4 = [
  /^10\./, /^127\./, /^0\./, /^169\.254\./, /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

export class BlockedUrlError extends Error {}

export function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const value = address.toLowerCase();
    return value === "::1" || value === "::"
      || value.startsWith("fc") || value.startsWith("fd")
      || value.startsWith("fe80") || value.startsWith("::ffff:");
  }
  return BLOCKED_V4.some((pattern) => pattern.test(address));
}

/** 이름을 풀어 공개 주소인지 본다. 사설 주소로 풀리는 이름은 막는다. */
export async function assertPublicHost(hostname: string, resolve: typeof lookup = lookup): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new BlockedUrlError("private address");
    return;
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) throw new BlockedUrlError("private host");
  let records: { address: string }[];
  try {
    records = await resolve(host, { all: true });
  } catch {
    throw new BlockedUrlError("host does not resolve");
  }
  if (records.length === 0) throw new BlockedUrlError("host does not resolve");
  if (records.some((record) => isPrivateAddress(record.address))) throw new BlockedUrlError("private address");
}

/** http(s) 주소이고 공개 호스트인지 본다. 통과하면 해석한 URL을 돌려준다. */
export async function assertPublicHttpUrl(value: string, resolve: typeof lookup = lookup): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BlockedUrlError("invalid url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new BlockedUrlError("unsupported scheme");
  if (url.username || url.password) throw new BlockedUrlError("credentials in url");
  await assertPublicHost(url.hostname, resolve);
  return url;
}
