/**
 * 지면 스크립트.
 *
 * 모델은 HTML · CSS 옆에 `script`를 따로 쓴다. 첫 화면의 추상 그래픽을 canvas · WebGL · three.js로 그리려는 것이다
 * (2026-11-20 사용자: "이건 표현력 문제를 야기해. 이 제약을 풀자").
 *
 * **JS는 태그처럼 허용 목록으로 거를 수 없다.** 그래서 안전은 이 파일이 아니라 틀과 정책이 진다.
 * - 틀: 스크립트를 돌리는 iframe은 `allow-scripts`만 받고 `allow-same-origin`은 받지 않는다. 문서는 익명 출처에서 돌아
 *   앱의 쿠키 · 저장소 · 부모 문서에 닿지 못한다.
 * - 정책: 아래 `pageScriptPolicy`가 문서 머리에 실린다. 이 문서가 실은 스크립트(해시)와 고정한 라이브러리 한 판만 실행하고,
 *   바깥으로 요청 · 그림 · 양식을 보내지 못한다. 지면 재료에 섞인 공고문의 지시를 모델이 옮겨 적어도 방문자에게 닿지 않는다.
 *
 * 남는 위험: 틀이 자기 자신을 다른 주소로 옮기는 것(`location = …`)과 무한 반복으로 탭을 멈추는 것은 정책으로 막지 못한다.
 */

/** 지면이 `import * as THREE from "three"`로 부를 수 있는 판. 호스트 전체가 아니라 이 주소 하나만 정책에 연다. */
export const PAGE_SCRIPT_LIBRARY = { name: "three", url: "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js" } as const;

/**
 * 한 지면에 모듈이 여럿일 때의 경계. 고른 첫 화면의 스크립트와 그 뒤를 이어 쓴 지면의 스크립트는 따로 쓰였다 — 한 모듈로 이으면
 * 둘 다 `import * as THREE from "three"`를 적었을 때 같은 이름을 두 번 선언해 둘 다 멈춘다. 저장은 한 칸에 이 줄로 잇고,
 * 문서는 이 줄에서 갈라 모듈마다 `<script type="module">`을 하나씩 단다.
 */
export const PAGE_SCRIPT_BREAK = "\n/* expresso:next-module */\n";

/** 모듈 스크립트들을 한 칸에 잇는다. 빈 것은 뺀다. 하나도 없으면 undefined — 칸을 두지 않는다. */
export function joinPageScripts(...scripts: (string | null | undefined)[]): string | undefined {
  const parts = scripts.flatMap((script) => (script?.trim() ? [script.trim()] : []));
  return parts.length ? parts.join(PAGE_SCRIPT_BREAK) : undefined;
}

/**
 * 스크립트 원문을 `<script>` 안에 실어도 되는 모양으로 만든다.
 *
 * 원문에 `</script`가 있으면 그 자리에서 요소가 닫히고 뒤의 글자가 소독을 지나지 않은 마크업으로 읽힌다. `<!--`도 파서를
 * 다른 상태로 보낸다. 둘 다 JS에서 뜻이 같은 `<\/script` · `<\!--`로 바꾼다. 해시는 바꾼 결과로 잰다 — 문서에 실리는 글자다.
 */
export function pageScriptText(script: string): string {
  return script.replaceAll(/<\/(script)/gi, "<\\/$1").replaceAll("<!--", "<\\!--").trim();
}

const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

/**
 * SHA-256을 base64로. CSP의 `'sha256-…'`에 쓴다.
 *
 * 동기 함수여야 한다 — `pageDocument`가 클라이언트 부품의 렌더 중에도 돌고, 브라우저의 `crypto.subtle`은 비동기다.
 */
export function sha256Base64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const length = bytes.length;
  const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(length / 0x20000000));
  view.setUint32(padded.length - 4, (length << 3) >>> 0);
  const hash = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const w = new Uint32Array(64);
  const rotr = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const a = w[i - 15]!, b = w[i - 2]!;
      w[i] = (w[i - 16]! + (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[i - 7]! + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10))) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i += 1) {
      const t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) >>> 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    const next = [a, b, c, d, e, f, g, h];
    for (let i = 0; i < 8; i += 1) hash[i] = (hash[i]! + next[i]!) >>> 0;
  }
  const out = new Uint8Array(32);
  hash.forEach((word, i) => new DataView(out.buffer).setUint32(i * 4, word));
  let binary = "";
  for (const byte of out) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** 정책을 다시 열지 않고 찾아 고칠 수 있게 붙이는 표시. `withSiteTracker`가 추적 스크립트 해시와 출처를 여기에 더한다. */
export const PAGE_SCRIPT_POLICY_MARK = "data-page-script-policy";

/**
 * 스크립트를 실은 지면 문서의 정책.
 *
 * `origin`은 지면의 그림(`/media/…`)을 내보내는 앱 출처다. 익명 출처의 문서에서는 `'self'`가 우리 그림을 가리키지 못해 따로 받는다.
 * 비어 있으면 그림 출처를 열지 않는다(배포 스냅샷 — 보여 줄 때 웹이 더한다). `scripts`는 이 문서에 실린 인라인 스크립트 원문 전부다.
 */
export function pageScriptPolicy(input: { scripts: string[]; origin: string; styleHosts: readonly string[] }): string {
  const hosts = input.styleHosts.map((host) => `https://${host}`).join(" ");
  return [
    "default-src 'none'",
    `script-src ${input.scripts.map((script) => `'sha256-${sha256Base64(script)}'`).join(" ")} ${PAGE_SCRIPT_LIBRARY.url}`,
    `style-src 'unsafe-inline' ${hosts}`,
    `font-src ${hosts}`,
    `img-src ${input.origin ? `${input.origin} ` : ""}data: blob:`,
    "connect-src 'none'",
    "media-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join("; ");
}
