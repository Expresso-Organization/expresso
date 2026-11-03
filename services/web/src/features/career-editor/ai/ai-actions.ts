/** 선택 영역 AI 편집 지시입니다. 옛 편집기와 BlockNote 편집기가 함께 씁니다. */
export const AI_ACTIONS = [
  { label: "더 구체적으로", icon: "target", prompt: "선택한 내용을 확인된 사실 범위에서 더 구체적으로 정리해 주세요." },
  { label: "문장 다듬기", icon: "sparkle", prompt: "선택한 문장을 의미를 유지하면서 자연스럽고 명확하게 다듬어 주세요." },
  { label: "짧게", icon: "arrows-in-line-horizontal", prompt: "선택한 내용을 핵심 정보가 남도록 짧게 정리해 주세요." },
  { label: "톤 정돈", icon: "sliders-horizontal", prompt: "선택한 문장을 차분하고 전문적인 커리어 기록 문체로 정돈해 주세요." },
  { label: "문법 확인", icon: "check-circle", prompt: "선택한 문장의 맞춤법과 문법을 확인하고 필요한 부분만 수정해 주세요." },
] as const;
