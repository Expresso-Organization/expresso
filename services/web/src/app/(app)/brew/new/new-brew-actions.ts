"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { brews, jobs } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

/**
 * 제작을 시작한다.
 *
 * 순서가 있다 — **공고 → 분석 → 제작**. 분석이 끝나야 제작을 만들 수 있는 것은
 * 재료 순위가 공고 요건을 기준으로 매겨지기 때문이다(`POST /brews`가
 * `rankMaterials`를 부르고, 분석이 `done`이 아니면 409로 막는다). 요건을 모르는
 * 채로 만든 제작은 순위를 매길 기준이 없다.
 *
 * 그래서 붙여넣기와 제작 시작 사이에 **기다리는 자리**가 하나 필요하다 —
 * `/brew/new/[jobAnalysisId]`가 그 자리다.
 */

export type NewBrewState = { error: string | null };

const LENGTH_PRESETS = new Set(["single", "double", "triple"]);

function lengthPreset(formData: FormData): "single" | "double" | "triple" {
  const value = String(formData.get("lengthPreset") ?? "single");
  return LENGTH_PRESETS.has(value) ? (value as "single" | "double" | "triple") : "single";
}

/** 공고를 직접 붙여넣는다. 공고와 분석이 함께 생긴다. */
export async function pasteAndAnalyzeAction(
  _state: NewBrewState,
  formData: FormData,
): Promise<NewBrewState> {
  const session = await requireSession();
  const companyName = String(formData.get("companyName") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const descriptionRaw = String(formData.get("descriptionRaw") ?? "").trim();
  const sourceUrl = String(formData.get("sourceUrl") ?? "").trim();

  if (!companyName || !title) return { error: "회사와 공고 제목을 적어 주세요." };
  if (descriptionRaw.length < 200) {
    return {
      error: `공고 원문이 ${descriptionRaw.length}자입니다. 요건을 뽑으려면 200자 이상이 필요합니다.`,
    };
  }

  let jobAnalysisId: string;
  try {
    jobAnalysisId = (await jobs.submit(
      session.accessToken,
      {
        companyName,
        title,
        descriptionRaw,
        ...(sourceUrl ? { sourceUrl } : {}),
      },
      randomUUID(),
    )).data.jobAnalysisId;
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: "공고를 들이지 못했습니다. 잠시 뒤 다시 눌러 주세요." };
    }
    throw error;
  }

  redirect(`/brew/new/${jobAnalysisId}?length=${lengthPreset(formData)}` as Route);
}

/** 모아 둔 공고에서 고른다. 공고는 이미 있고 내 분석만 새로 생긴다. */
export async function analyzePostingAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const jobPostingId = String(formData.get("jobPostingId") ?? "");

  const analyzed = (await jobs.analyzePosting(session.accessToken, jobPostingId)).data;
  redirect(`/brew/new/${analyzed.jobAnalysisId}?length=${lengthPreset(formData)}` as Route);
}

/** 공고와 기록을 요구하지 않고 사용자의 설명으로 제작을 연다. */
export async function createFreeBrewAction(
  _state: NewBrewState,
  formData: FormData,
): Promise<NewBrewState> {
  const session = await requireSession();
  const title = String(formData.get("title") ?? "").trim();
  const brief = String(formData.get("brief") ?? "").trim();

  if (!title) return { error: "포트폴리오 제목을 적어 주세요." };
  if (!brief) return { error: "담고 싶은 내용이나 방향을 적어 주세요." };

  try {
    const created = await brews.createFree(session.accessToken, {
      title,
      brief,
      lengthPreset: lengthPreset(formData),
    });
    redirect(`/brew/${created.data.brewId}/outline`);
  } catch (error) {
    if (error instanceof ApiError) {
      return { error: "자유 제작을 시작하지 못했습니다. 잠시 뒤 다시 눌러 주세요." };
    }
    throw error;
  }
}

/**
 * 분석이 끝난 뒤 제작을 만든다.
 *
 * 여기서 재료 순위가 한 번 매겨진다 — 그래서 이 버튼은 사람이 누른다. 화면을
 * 여는 것만으로 순위를 매기면 새로고침마다 제작이 하나씩 생긴다.
 */
export async function startBrewAction(
  _state: NewBrewState,
  formData: FormData,
): Promise<NewBrewState> {
  const session = await requireSession();
  const jobAnalysisId = String(formData.get("jobAnalysisId") ?? "");

  let brewId: string;
  try {
    brewId = (await brews.create(session.accessToken, {
      jobAnalysisId,
      lengthPreset: lengthPreset(formData),
    })).data.brewId;
  } catch (error) {
    if (error instanceof ApiError) return { error: startFailure(error) };
    throw error;
  }

  redirect(`/brew/${brewId}/analyze`);
}

/** 기다리는 동안 다시 읽어 온다. */
export async function refreshAnalysisAction(formData: FormData): Promise<void> {
  await requireSession();
  revalidatePath(`/brew/new/${String(formData.get("jobAnalysisId") ?? "")}`);
}

/** §13 — 에러는 다음 행동으로 끝난다. */
function startFailure(error: ApiError): string {
  if (error.status === 402 || error.status === 403) {
    return "이번 달 추출 횟수를 다 썼습니다. 다음 달에 다시 시작하거나 요금제를 올려 주세요.";
  }
  if (error.status === 409) {
    return "아직 시작할 수 없습니다. 분석이 끝났는지, 정리된 기록이 한 건이라도 있는지 확인해 주세요.";
  }
  return "제작을 시작하지 못했습니다. 잠시 뒤 다시 눌러 주세요.";
}

/**
 * 주소로 공고를 읽어 온다. **저장하지 않는다.**
 *
 * 읽은 것을 화면에 채워 주고, 사용자가 보고 고친 뒤 제출한다. 페이지에서 뽑은
 * 글은 틀릴 수 있고 `job_posting.description_raw`는 한 번 넣으면 고칠 수 없다.
 */
export type UrlReadState = {
  error: string | null;
  read: {
    companyName: string;
    title: string;
    descriptionRaw: string;
    sourceUrl: string;
    extractedFrom: "json-ld" | "page-body";
  } | null;
};

export async function readUrlAction(
  _state: UrlReadState,
  formData: FormData,
): Promise<UrlReadState> {
  const session = await requireSession();
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return { error: "공고 주소를 넣어 주세요.", read: null };

  try {
    const found = (await jobs.readUrl(session.accessToken, url)).data;
    return {
      error: null,
      read: {
        companyName: found.companyName ?? "",
        title: found.title ?? "",
        descriptionRaw: found.descriptionRaw,
        sourceUrl: found.sourceUrl,
        extractedFrom: found.extractedFrom,
      },
    };
  } catch (error) {
    if (error instanceof ApiError) return { error: readFailure(error), read: null };
    throw error;
  }
}

/** §13 — 막힌 이유마다 다음 행동이 다르다. */
function readFailure(error: ApiError): string {
  if (error.status === 422) {
    return "이 주소에서는 공고 글을 읽지 못했습니다. 봇을 막는 사이트일 수 있습니다 — 아래에 직접 붙여넣어 주세요.";
  }
  if (error.status === 502) {
    return "그 페이지에 닿지 못했습니다. 주소를 확인하거나 아래에 붙여넣어 주세요.";
  }
  return "주소를 읽지 못했습니다. 아래에 붙여넣어 주세요.";
}
