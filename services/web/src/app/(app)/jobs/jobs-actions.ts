"use server";

import { SaveJobSearchSchema, type JobSearchCondition } from "@expresso/contracts";

import { ApiError } from "@/lib/api/client";
import { jobs } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

export type SaveSearchState = { saved: boolean; error: string | null };
export type ClearRecentState = { cleared: boolean; error: string | null };

/** 계약의 이름 칸 상한. 검색 문장이 더 길면 앞부분만 이름으로 쓴다. */
const NAME_LIMIT = 120;

/** 서버가 두는 저장 한도(`jobs/service.ts`의 409). 넘으면 이 수를 문구에 적는다. */
const SAVED_SEARCH_LIMIT = 10;

/** 서버가 남기는 최근 검색 수이자 목록 API의 상한(`jobs/board-routes.ts`). */
const RECENT_SEARCH_LIMIT = 20;

/**
 * 00b 「이 검색 저장」.
 *
 * 저장하는 것은 검색 문장과, 칩이 지금 보여 주는 조건이다 — 칩에서 끄거나
 * 바꾼 값이 저장에도 그대로 실린다. 알림(`notify`)은 끈 채로 저장한다.
 * 저장한 검색의 새 공고를 알림으로 만드는 곳이 아직 없어서, 켜 두면 오지
 * 않을 알림을 약속하게 된다.
 */
export async function saveSearchAction(
  query: string,
  conditions: JobSearchCondition[],
): Promise<SaveSearchState> {
  const session = await requireSession();
  const input = SaveJobSearchSchema.parse({
    name: query.trim().slice(0, NAME_LIMIT),
    originalQuery: query,
    conditions,
    notify: false,
  });

  try {
    await jobs.saveSearch(session.accessToken, input);
  } catch (error) {
    if (error instanceof ApiError) {
      return {
        saved: false,
        error: error.status === 409
          ? `저장한 검색이 ${SAVED_SEARCH_LIMIT}개라 더 저장할 수 없습니다.`
          : "검색을 저장하지 못했습니다.",
      };
    }
    throw error;
  }
  return { saved: true, error: null };
}

/**
 * 00b 「최근 검색 · 지우기」. 최근 검색을 전부 지운다.
 *
 * 지우는 API가 한 건씩이라 목록을 받아 하나씩 지운다. 화면은 넷만 받아 오지만
 * 지우기는 그 너머까지 비워야 하므로 여기서 다시 받는다. 서버는 최근 검색을
 * 사람마다 20건까지만 남기고(`jobs/service.ts` `interpretSearch`), 목록 API의
 * 상한도 20이라 한 번 받으면 전부다.
 *
 * 지운 뒤 화면의 두 묶음은 버튼이 들고 있는 상태로 비운다. 이 액션이 세션
 * 쿠키를 갱신하면 Next가 지금 화면을 다시 그리는데, 그때 보고 있는 검색어가
 * 해석되면서 최근 검색에 한 줄 다시 적힌다. 그 검색을 지금 보고 있으므로
 * 맞는 기록이고, 다음에 화면을 열 때 그 한 줄만 보인다.
 */
export async function clearRecentSearchesAction(): Promise<ClearRecentState> {
  const session = await requireSession();
  try {
    const recent = await jobs.recentSearches(session.accessToken, RECENT_SEARCH_LIMIT);
    // 서버가 사람마다 쓰기를 트랜잭션으로 묶으므로 한 건씩 차례로 지운다.
    for (const search of recent.data) {
      await jobs.deleteRecentSearch(session.accessToken, search.id);
    }
  } catch (error) {
    if (error instanceof ApiError) return { cleared: false, error: "최근 검색을 지우지 못했습니다." };
    throw error;
  }
  return { cleared: true, error: null };
}
