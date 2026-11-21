import { notFound, redirect } from "next/navigation";

/** 옛 단계 화면의 주소(공고 분석 · 재료 · AI 대화). 그 단계는 대화의 카드가 맡으므로 제작을 잇는 주소로 보낸다. 저장해 둔 링크를 위해 남긴다. */
const OLD_STEPS = new Set(["analyze", "materials", "counter"]);

export default async function OldBrewStepPage({ params }: { params: Promise<{ brewId: string; step: string }> }) {
  const { brewId, step } = await params;
  if (!OLD_STEPS.has(step)) notFound();
  redirect(`/brew/${brewId}`);
}
