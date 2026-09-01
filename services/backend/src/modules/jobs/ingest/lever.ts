import type { JobSourceProvider } from "@expresso/contracts";

import { fetchJson, htmlToMarkdown, type JobSourceAdapter, type RawPosting } from "./adapter.js";

/**
 * Lever 공개 채용 보드.
 *
 * Greenhouse와 같은 성격이다 — 고객사가 자기 채용 페이지를 붙이라고 열어 둔
 * 자리이고 인증이 없다.
 *
 *   GET https://api.lever.co/v0/postings/{token}?mode=json
 *
 * 본문이 **세 조각으로 나뉘어** 온다. `description`이 머리말이고, 요건과
 * 자격은 `lists`에 제목(`text`)과 내용(`content`)이 따로 담기며, 맺음말이
 * `additional`이다. 실측(채널코퍼레이션 공고 하나)에서 `lists`가 7개였고
 * 거기에 자격 요건이 전부 들어 있었다 — `description`만 쓰면 회사 소개만
 * 남고 뽑을 요건이 사라진다.
 *
 * 회사 이름 칸이 없다. 그래서 출처에 적어 둔 이름을 쓴다.
 */

interface LeverList {
  text?: string;
  content?: string;
}

interface LeverPosting {
  id?: string;
  text?: string;
  description?: string;
  additional?: string;
  lists?: LeverList[];
  hostedUrl?: string;
  categories?: {
    commitment?: string;
    department?: string;
    location?: string;
    team?: string;
  };
}

/** 나뉘어 온 조각을 원래 문서 순서대로 다시 붙인다. */
function body(posting: LeverPosting): string {
  const parts: string[] = [];
  if (posting.description) parts.push(posting.description);
  for (const list of posting.lists ?? []) {
    // 제목은 `<h3>`으로 세운다. 평문으로 이으면 "자격 요건"과 그 아래 항목이
    // 같은 굵기가 되어 어디부터가 요건인지 알 수 없다.
    if (list.text) parts.push(`<h3>${list.text}</h3>`);
    if (list.content) parts.push(list.content);
  }
  if (posting.additional) parts.push(posting.additional);
  return htmlToMarkdown(parts.join("\n"));
}

export class LeverAdapter implements JobSourceAdapter {
  readonly provider: JobSourceProvider = "lever";

  async fetch(token: string, displayName: string): Promise<RawPosting[]> {
    const payload = await fetchJson(
      `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`,
    );
    const postings = Array.isArray(payload) ? payload as LeverPosting[] : [];

    return postings.flatMap((posting): RawPosting[] => {
      const id = posting.id?.trim();
      const title = posting.text?.trim();
      if (!id || !title) return [];

      const categories = posting.categories ?? {};
      return [{
        externalId: id,
        title: title.slice(0, 300),
        companyName: displayName.slice(0, 200),
        descriptionRaw: body(posting),
        sourceUrl: posting.hostedUrl?.trim() ?? null,
        location: categories.location?.trim().slice(0, 120) ?? null,
        // 고용형태가 현지어로 온다(실측에 `正社員`). 그대로 둔다 —
        // 우리가 옮기면 원문에 없는 말이 화면에 선다.
        employmentType: categories.commitment?.trim().slice(0, 60) ?? null,
        // Lever는 경력 칸이 없다. 짐작해서 채우지 않는다.
        experienceLabel: null,
        team: (categories.team ?? categories.department)?.trim().slice(0, 120) ?? null,
        // 마감일 칸도 없다.
        expiresAt: null,
      }];
    });
  }
}
