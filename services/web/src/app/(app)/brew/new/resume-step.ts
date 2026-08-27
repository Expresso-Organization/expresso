import { WIZARD_STEPS } from "@/components/shell/WizardShell";

/**
 * 진행 중 제작(brew.status)이 위저드 어느 단계로 이어지는지.
 *
 * 홈 읽기 모델은 status를 느슨한 문자열로 주고, 브루 루트(`/brew/[brewId]`)에는
 * 화면이 없다 — 그래서 여기서 단계를 정해 보낸다. 모르는 값은 재료 고르기로
 * 보낸다: 브루가 있다는 것은 재료 순위까지는 이미 매겨졌다는 뜻이라, 어느
 * 상태에서 들어가도 깨지지 않는 가장 이른 자리다.
 */
const STATUS_SEGMENT: Record<string, (typeof WIZARD_STEPS)[number]["segment"]> = {
  draft: "materials",
  interviewing: "counter",
  recipe: "outline",
  // 추출 대기는 디자인 화면이 그린다(`design/Generating.tsx`).
  generating: "design",
};

export function resumeStep(status: string) {
  const segment = STATUS_SEGMENT[status] ?? "materials";
  const step = WIZARD_STEPS.find((candidate) => candidate.segment === segment);
  if (!step) throw new Error(`위저드에 없는 단계입니다: ${segment}`);
  return step;
}
