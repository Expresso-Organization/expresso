import { notFound } from "next/navigation";

import { ApiError } from "@/lib/api/client";
import { blueprints, brews, designSystems } from "@/lib/api/endpoints";
import { requireSession } from "@/lib/require-session";

import { BrewFrame } from "../BrewFrame";
import { Workbench, type DesignFace, type RecordCard } from "./Workbench";

/**
 * 02 레시피 — 블루프린트 작업대.
 *
 * 사용자가 정하는 것은 **무엇을 어떤 순서로, 어떤 근거로, 어떤 모양으로**
 * 보여줄지다. 완성 문장과 픽셀은 03 생성이 쓴다
 * (`docs/architecture/portfolio-creation-flow-v2.md` §7).
 */
export default async function RecipePage({
  params,
}: {
  params: Promise<{ brewId: string }>;
}) {
  const session = await requireSession();
  const { brewId } = await params;

  let brew;
  try {
    brew = (await brews.get(session.accessToken, brewId)).data;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }

  // 블루프린트는 이 화면이 열릴 때 태어난다. 이미 있으면 그것을 돌려받는다.
  const [blueprint, materials] = await Promise.all([
    blueprints.open(session.accessToken, brewId).then(({ data }) => data),
    brews.materials(session.accessToken, brewId).then(({ data }) => data),
  ]);

  // 고른 디자인의 낯. 캔버스가 강조색과 제목 서체만 빌려 쓴다(§7.6).
  // 목록은 백엔드가 한 번 지어 두고 재사용하므로 이름 하나에 판 전체를
  // 내려받지 않는다.
  let design: DesignFace | null = null;
  if (blueprint.designSystemRevisionId) {
    const catalog = await designSystems.list(session.accessToken);
    const item = catalog.data.items.find(
      ({ revisionId }) => revisionId === blueprint.designSystemRevisionId,
    );
    if (item) {
      design = {
        name: item.name,
        accent: item.preview.accent,
        text: item.preview.text,
        displayFamily: item.preview.displayFamily,
        displayFallback: item.preview.displayFallback,
      };
    }
  }

  const records: RecordCard[] = materials.materials.map((material) => ({
    recordId: material.recordId,
    title: material.title,
    categoryName: material.categoryName,
    categoryIcon: material.categoryIcon,
    periodFrom: material.periodFrom,
    periodTo: material.periodTo,
    selected: material.selected,
    reason: material.reason,
  }));

  // 단계 줄의 상황 문구는 서버가 한 번 그리고 끝난다. 편집하며 바뀌는 수는
  // 작업대 상단이 직접 센다 — 여기에 두면 새로 고칠 때까지 어긋난 수가 남는다.
  const situation = design ? design.name : "디자인 없음";

  return (
    <BrewFrame
      brewId={brewId}
      step="recipe"
      portfolioTitle={blueprint.title || brew.freeTitle || brew.posting?.title || null}
      situation={situation}
      flow="portfolio-v2"
      tinted
    >
      <Workbench
        brewId={brewId}
        initialBlueprint={blueprint}
        records={records}
        design={design}
      />
    </BrewFrame>
  );
}
