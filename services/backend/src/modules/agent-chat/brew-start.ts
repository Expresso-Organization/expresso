import type { AgentBrewStartState, InterviewAnswerResult, InterviewQuestionBase, InterviewQuestionBasis, InterviewSession, JobAnalysisResult, DesignGraphic } from "@expresso/contracts";

/**
 * 대화에서 시작한 포트폴리오 제작.
 *
 * 대화의 도구 결과에는 ID만 있다. 분석의 진행과 결과, 만들어진 제작은 여기서 그때그때 읽은 값으로 낸다 —
 * 큐 작업(공고 분석)의 결과를 대화에 쓰지 않는다. 실행 중에는 마지막 메시지를 실행이 통째로 다시 쓰고,
 * 탭이 닫혀 있어도 분석은 워커에서 끝나기 때문이다.
 */

/** 에이전트 대화가 제작을 시작하는 데 쓰는 다른 모듈의 일. 각 모듈의 진입점이 내는 서비스를 그대로 받는다. */
export interface AgentBrewDeps {
  /** 사용자와 공고마다 분석 하나로 모은다. 다시 해 볼 수 있는 실패는 다시 큐에 넣는다(`JobMarketApi.analyzePosting`). */
  analyzePosting(userId: string, jobPostingId: string): Promise<{ jobAnalysisId: string }>;
  /** 분석의 상태와 요건별 대조(`JobAnalysisApi.getResult`). */
  getResult(userId: string, jobAnalysisId: string): Promise<JobAnalysisResult>;
  /** 끝난 분석으로 제작을 만든다. 부를 때마다 새 제작이 생기므로 한 번만 부른다(`MaterialsApi.createBrew`). */
  createBrew(userId: string, input: { jobAnalysisId: string; lengthPreset: "single" }): Promise<{ brewId: string }>;
  /** 제작이 어디까지 갔고 기록을 몇 건 골랐는가. 지웠거나(휴지통) 없는 제작이면 null이다(`MaterialsApi.getState`). */
  brewState(userId: string, brewId: string): Promise<{ status: BrewStatus; selected: number; generation: BrewGeneration | null } | null>;
  /** 제작에 담으려고 고른 기록. 작업물 재료를 붙일 기록을 에이전트가 여기서 고른다(`MaterialsApi.getMaterials`). */
  selectedRecords(userId: string, brewId: string): Promise<{ id: string; title: string }[]>;
  /**
   * 디자인 대화에서 고른 첫 화면으로 생성을 맡긴다. 줄에 있거나 도는 생성이 있으면 새로 맡기지 않고 그 생성이다.
   * 고른 첫 화면이 없거나 이미 만든 포트폴리오가 있으면 거절한다(`AgentChatError`).
   */
  startGeneration(userId: string, brewId: string): Promise<{ generationId: string }>;
  /** 질문 0개의 인터뷰 세션을 열고 제작을 AI 대화 단계로 옮긴다. 이미 세션이 있으면 그 세션이다(`InterviewApi.openConversation`). */
  openInterview(userId: string, brewId: string): Promise<unknown>;
  /** 고를 수 있는 근거와 저장한 질문(`InterviewApi.conversationState`). AI를 부르지 않는다. */
  interview(userId: string, brewId: string): Promise<{ bases: InterviewQuestionBase[]; session: InterviewSession | null }>;
  /** 한 질문의 답을 저장한다. 같은 근거의 질문이 있으면 그 답을 다시 쓴다(`InterviewApi.saveConversationAnswer`). */
  saveInterviewAnswer(userId: string, brewId: string, input: { basis: InterviewQuestionBasis; question: string; transcript: string }, idempotencyKey: string): Promise<InterviewAnswerResult>;
  /** 구성 잡을 맡긴다. 지금의 화면과 같은 키(`recipe:<brewId>`)라 이미 있으면 그 잡이다. */
  startRecipe(userId: string, brewId: string): Promise<unknown>;
  /** 디자인 대화에 견본의 짝으로 그리기를 보낸다. 그 답의 ID를 돌려준다(`DesignChatService.send`). */
  designDraw(userId: string, brewId: string, input: { styleId: string; layoutId: string; graphic?: DesignGraphic | undefined }): Promise<{ designMessageId: string }>;
  /** 디자인 대화에 견본 제안 · 고치기 차례를 맡긴다. 그 답의 ID를 돌려준다(`DesignChatService.propose` · `revise`). */
  designPropose(userId: string, brewId: string, input: { request: string; focus: "both" | "styles" | "layouts" }): Promise<{ designMessageId: string }>;
  designRevise(userId: string, brewId: string, input: { instruction: string; screen: string }): Promise<{ designMessageId: string }>;
  /** 디자인 대화의 지금 상태를 모델에 넘길 만큼 줄인 것. 아직 열지 않았거나 디자인 대화가 없는 서버면 null이다. */
  designState(userId: string, brewId: string): Promise<AgentBrewDesignState | null>;
}
/** 모델에 넘기는 디자인 대화. 이름만 싣는다 — 색 값 · 마크업은 싣지 않는다. */
export interface AgentBrewDesignState {
  /** 디자이너의 첫 말과 견본이 나왔는가. */
  ready: boolean;
  /** 디자인 대화가 답을 만드는 중(첫 말 · 그리기 · 고치기)이다. */
  busy: boolean;
  /** 가장 최근 견본의 스타일 · 레이아웃 이름. */
  styles: string[];
  layouts: string[];
  /** 그린 첫 화면의 이름. 오래된 것부터. */
  screens: string[];
  /** 고른 첫 화면의 이름. */
  selected: string | null;
}
/** 제작의 최근 생성. */
export interface BrewGeneration { id: string; status: "queued" | "running" | "done" | "failed" }
/** 생성이 줄에 있거나 도는 중인가. */
export const generating = (generation: BrewGeneration | null | undefined) => generation?.status === "queued" || generation?.status === "running";
/** 이 대화에서 만든 제작 가운데 아직 남아 있는 것. */
export interface LiveBrew { id: string; status: BrewStatus; selected: number; generation?: BrewGeneration | null }
/** 제작이 가 있는 단계. 재료 · AI 대화 단계는 대화의 카드가 맡고, 그 뒤는 아직 지금의 화면이 맡는다. */
export const brewStep = (status: BrewStatus) => (status === "draft" ? "materials" : status === "interviewing" ? "interview" : "design");
export type BrewStatus = "draft" | "interviewing" | "recipe" | "generating" | "done";
/** 제작을 이어 갈 화면. 아직 대화로 옮기지 않은 단계는 지금의 화면이 맡는다(`brew/new/resume-step.ts`와 같은 규칙). */
export const brewPath = (brewId: string, status: BrewStatus) => `/brew/${brewId}/${status === "draft" ? "materials" : status === "interviewing" ? "counter" : "design"}`;

/** 분석 결과를 카드와 모델이 읽는 상태로 옮긴다. 요건의 확인 수는 분석이 끝난 뒤에만 센다. */
export function brewStartState(result: JobAnalysisResult, brew: LiveBrew | null, announced: boolean): AgentBrewStartState {
  const { status, stage, failure } = result.analysis;
  const count = (coverage: JobAnalysisResult["requirements"][number]["coverage"]) => result.requirements.filter(item => item.coverage === coverage).length;
  return {
    status, stage, failure,
    requirements: status === "done" ? { total: result.requirements.length, covered: count("covered"), partial: count("partial"), missing: count("missing") } : null,
    brewId: brew?.id ?? null,
    step: brew ? brewStep(brew.status) : null,
    announced,
  };
}

/**
 * 같은 키의 일을 한 번에 하나씩 돌린다. 「담을 기록 고르기」를 두 번 누르면 두 요청이 모두 "아직 제작이 없다"를 읽고
 * 제작을 둘 만든다 — 대화마다 줄을 세워 뒤 요청이 앞 요청이 적은 제작 ID를 읽게 한다.
 * API 프로세스가 하나일 때의 보호다. 프로세스가 여럿이면 쓰기의 조건(읽은 값 그대로일 때만 적는다)이 마지막 선이고,
 * 진 쪽이 만든 제작은 쓰이지 않은 채 남는다.
 */
export class KeyedQueue {
  readonly #tails = new Map<string, Promise<unknown>>();
  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const result = (this.#tails.get(key) ?? Promise.resolve()).then(work, work);
    const tail = result.catch(() => undefined);
    this.#tails.set(key, tail);
    void tail.then(() => { if (this.#tails.get(key) === tail) this.#tails.delete(key); });
    return result;
  }
}
