import { WIZARD_STEPS } from "@/components/shell/WizardShell";

/**
 * 진행 중 제작(brew.status)이 멈춘 단계. 사이드바 · 라이브러리가 단계의 이름을 보이는 데 쓴다.
 *
 * 이어 가는 주소는 단계와 관계없이 `/brew/[brewId]`다 — 그 제작을 붙인 대화를 지금 단계의 카드와 함께 연다.
 * 홈 읽기 모델은 status를 느슨한 문자열로 주므로 모르는 값은 가장 이른 단계(재료 고르기)로 본다.
 */
const STATUS_SEGMENT: Record<string, (typeof WIZARD_STEPS)[number]["segment"]> = {
  draft: "materials",
  interviewing: "counter",
  // 레시피는 화면 단계가 아니다. 구성을 만드는 중이거나 끝난 제작은 디자인 선택에서 이어 간다.
  recipe: "design",
  // 추출 대기는 디자인 화면이 그린다(`design/Generating.tsx`).
  generating: "design",
};

export function resumeStep(status: string) {
  const segment = STATUS_SEGMENT[status] ?? "materials";
  const step = WIZARD_STEPS.find((candidate) => candidate.segment === segment);
  if (!step) throw new Error(`위저드에 없는 단계입니다: ${segment}`);
  return step;
}
