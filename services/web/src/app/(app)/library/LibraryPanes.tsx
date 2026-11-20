import type { CareerCategory } from "@expresso/contracts";
import type { Route } from "next";
import Link from "next/link";

import { Skel, SkelRegion, skelKeys } from "@/components/shell/Skeleton";
import { Icon } from "@/components/ui/Icon";
import { CareerViewShell } from "@/features/career-editor/views/CareerViewShell";
import { homeEngagement } from "@/lib/app-data";
import { career, portfolios } from "@/lib/api/endpoints";

import { PortfolioGrid } from "./PortfolioGrid";
import { portfoliosWithPage, siteInsights } from "../home/home-data";
import { gridItems } from "../home/home-model";
import { KIND_ICON, KIND_LABEL } from "./library-model";
import gridStyles from "./portfolio-grid.module.css";
import styles from "./library.module.css";

/** 목록 응답 한 장의 상한(계약 `ListPortfoliosQuerySchema`). */
const PAGE = 50;

/** 포트폴리오와 만들다 만 제작. */
export async function PortfoliosPane({ accessToken }: { accessToken: string }) {
  const [{ data: home }, { data: list }, sites] = await Promise.all([
    homeEngagement(accessToken),
    portfolios.list(accessToken, { limit: PAGE }),
    siteInsights(accessToken),
  ]);
  const items = gridItems(home.activeBrews, list, PAGE);
  const withPage = await portfoliosWithPage(
    accessToken,
    items.flatMap((item) => (item.kind === "portfolio" ? [item.portfolio.id] : [])),
  );
  return <PortfolioGrid items={items} withPage={withPage} sites={sites} />;
}

/**
 * 지면 칸이 응답을 기다리는 동안. 왼쪽 목록이 이미 센 수(`count`)만큼 같은 격자 · 같은 카드 틀로 세운다 —
 * 카드가 오면 그 자리에서 떠오르고 칸이 밀리지 않는다.
 */
export function PortfoliosPaneSkeleton({ count }: { count: number }) {
  return (
    <SkelRegion label="포트폴리오를 불러오는 중" className="ex-anim-appear">
      <div className={gridStyles.sectionHead}>
        <span className={gridStyles.sectionTitle}>내 포트폴리오</span>
      </div>
      <div className={gridStyles.portfolioGrid}>
        {skelKeys(count + 1).map((card) => (
          <div key={card} className={gridStyles.portfolioCard}>
            <div className={gridStyles.portfolioThumb} />
            <div className={gridStyles.portfolioBody}>
              <Skel w={`${68 - (card % 3) * 12}%`} h={13} />
              <Skel w="44%" h={11} />
            </div>
          </div>
        ))}
      </div>
    </SkelRegion>
  );
}

/** 포트폴리오와 만들다 만 제작을 합친 수. */
export async function portfolioCount(accessToken: string) {
  const [{ data: home }, { data: list }] = await Promise.all([
    homeEngagement(accessToken),
    portfolios.list(accessToken, { limit: PAGE }),
  ]);
  return gridItems(home.activeBrews, list, PAGE).length;
}

/** 분류 하나의 기록. 지금의 분류 화면(표 · 보드 · 타임라인)을 그대로 세운다. */
export async function RecordsPane({ accessToken, category }: { accessToken: string; category: CareerCategory }) {
  const [records, views] = await Promise.all([
    career.records(accessToken, { categoryId: category.id, sort: "updated_desc", limit: 100 }),
    career.viewConfigurations(accessToken, category.id),
  ]);
  return (
    <div className={styles.recordsPane}>
      <CareerViewShell
        key={category.id}
        category={category}
        initialViews={views.data}
        initialViewId={null}
        initialPage={{ data: [...records.data], page: records.page }}
      />
    </div>
  );
}

/** 준비 계획 · 파일. 목록을 주는 API가 아직 없어 자리만 선다. */
export function PendingPane({ kind }: { kind: "plans" | "files" }) {
  return (
    <div className={styles.pendingPane}>
      <span className={styles.pendingIcon}><Icon name={KIND_ICON[kind]} size={18} /></span>
      <h2 className={styles.pendingTitle}>{KIND_LABEL[kind]}</h2>
      {kind === "plans" ? (
        <Link href={"/agent" as Route} className={styles.pendingAction}>홈에서 계획 세우기</Link>
      ) : null}
    </div>
  );
}
