import type { JobSourceProvider } from "@expresso/contracts";

import { htmlToText, type JobSourceAdapter, type RawPosting } from "./adapter.js";
import { USER_AGENT } from "./adapter.js";

/**
 * 고용24(워크넷) 채용정보 — 공공데이터포털.
 *
 * 무료이고 상업적 이용이 열려 있는 **정식 경로**다. 대신 IT·스타트업 공고가
 * 얇아서 이 제품의 주 타깃을 이걸로만 채울 수는 없다. 넓이를 얹는 자리다.
 *
 * 인증키가 필요하다(`WORK24_API_KEY`). 키가 없으면 이 어댑터는 아예 만들어지지
 * 않고, `job_source`에 워크넷 출처가 있으면 수집이 그 줄에 "adapter not
 * configured"를 적는다 — 조용히 0건을 모으고 성공했다고 말하지 않는다.
 *
 *   https://www.data.go.kr/data/3038225/openapi.do
 *
 * 응답이 XML이다. 우리에게 필요한 칸만 뽑는다 — 파서를 들이면 그것도 우리가
 * 지켜야 할 코드가 된다.
 */

const ENDPOINT = "https://apis.data.go.kr/1051000/recruitment/list";
const TIMEOUT_MS = 20_000;

function tag(xml: string, name: string): string | null {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml);
  const value = match?.[1]?.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
  return value ? value : null;
}

export class Work24Adapter implements JobSourceAdapter {
  readonly provider: JobSourceProvider = "work24";
  readonly #apiKey: string;

  constructor(apiKey: string) {
    this.#apiKey = apiKey;
  }

  /** `token`은 직종 코드다. 무엇을 모을지 출처마다 다르게 둔다. */
  async fetch(token: string): Promise<RawPosting[]> {
    const query = new URLSearchParams({
      serviceKey: this.#apiKey,
      numOfRows: "100",
      pageNo: "1",
      ncsCdLst: token,
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let xml: string;
    try {
      const response = await fetch(`${ENDPOINT}?${query}`, {
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      xml = await response.text();
    } finally {
      clearTimeout(timer);
    }

    const items = xml.split(/<item>/).slice(1).map((chunk) => chunk.split("</item>")[0] ?? "");
    return items.flatMap((item): RawPosting[] => {
      const externalId = tag(item, "recrutPblntSn");
      const title = tag(item, "recrutPbancTtl");
      const company = tag(item, "instNm");
      // 목록 API는 본문을 짧게 준다. 최소 길이는 수집 서비스가 본다.
      const body = htmlToText([
        tag(item, "recrutPbancTtl"), tag(item, "hireTypeNmLst"),
        tag(item, "recrutSeNm"), tag(item, "ncsCdNmLst"),
        tag(item, "acbgCondNmLst"), tag(item, "workRgnNmLst"),
        tag(item, "prefCondCn"), tag(item, "scrnprcdrMthdExpln"),
        tag(item, "aplyQlfcCn"),
      ].filter(Boolean).join("\n\n"));
      if (!externalId || !title || !company) return [];

      const end = tag(item, "pbancEndYmd");
      const expires = end && /^\d{8}$/.test(end)
        ? new Date(`${end.slice(0, 4)}-${end.slice(4, 6)}-${end.slice(6, 8)}T23:59:59+09:00`)
        : null;

      return [{
        externalId,
        title: title.slice(0, 300),
        companyName: company.slice(0, 200),
        descriptionRaw: body,
        sourceUrl: tag(item, "srcUrl"),
        location: tag(item, "workRgnNmLst")?.slice(0, 120) ?? null,
        employmentType: tag(item, "hireTypeNmLst")?.slice(0, 60) ?? null,
        experienceLabel: tag(item, "recrutSeNm")?.slice(0, 60) ?? null,
        team: null,
        expiresAt: expires && !Number.isNaN(expires.getTime()) ? expires : null,
      }];
    });
  }
}
