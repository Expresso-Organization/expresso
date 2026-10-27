import { notFound } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { brews, entitlements } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { BrewFrame } from "../BrewFrame";
import { brewTitle } from "../brew-title";
import { MaterialPicker } from "./MaterialPicker";

/**
 * 01b 재료 고르기.
 *
 * 재료는 제작을 시작할 때 이미 공고에 맞춰 순위가 매겨져 있다(`POST /brews`).
 * 이 화면이 하는 일은 그 순위를 보여주고 **어디까지 담을지**를 정하는 것이다.
 */
export default async function MaterialsPage({
  params,
}: {
  params: Promise<{ brewId: string }>;
}) {
  const { brewId } = await params;
  const session = await requireSession();

  let materials;
  let brew;
  try {
    // 머리말의 이름은 제작 상태에서 온다. 재료와 함께 읽는다.
    [materials, brew] = await Promise.all([
      brews.materials(session.accessToken, brewId).then((response) => response.data),
      brews.get(session.accessToken, brewId).then((response) => response.data),
    ]);
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  const [cowork, quota] = await Promise.all([
    entitlements.check(session.accessToken, "brew.cowork"),
    entitlements.check(session.accessToken, "portfolio.generate"),
  ]);

  return (
    <BrewFrame brewId={brewId} step="materials" portfolioTitle={brewTitle(brew)} situation="예상 3분">
      <MaterialPicker
        brewId={brewId}
        materials={materials}
        coworkAllowed={cowork.data.allowed}
        quota={quota.data.usage ?? null}
      />
    </BrewFrame>
  );
}
