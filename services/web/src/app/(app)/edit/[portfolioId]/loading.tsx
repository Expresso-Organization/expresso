import { LogoMark } from "@/components/brand/Logo";
import { Skel, SkelRegion, skelKeys } from "@/components/shell/Skeleton";

import styles from "./page.module.css";

/**
 * 04 다듬기가 포트폴리오를 기다리는 동안.
 *
 * 에디터는 앱 셸을 쓰지 않는다 — 56px 아이콘 레일 · 56px 툴바 · 그 아래
 * 섹션(244) · 캔버스 · 편집 패널(320)로 된 자기 틀이다(§4.3). 다른 화면의
 * 뼈대를 여기 세우면 셸 자체가 바뀌어 보이므로 이 틀을 그대로 세운다.
 */
export default function Loading() {
  return (
    <SkelRegion label="포트폴리오를 불러오는 중" className={styles.frame}>
      <nav className={styles.rail} aria-label="주요 이동">
        <span className={styles.railLogo}>
          <LogoMark size={22} />
        </span>
        {skelKeys(4).map((item) => (
          <Skel key={item} w={36} h={36} radius={10} />
        ))}
        <div className={styles.railFoot}>
          <Skel w={26} circle />
        </div>
      </nav>

      <div className={styles.main}>
        <div className={styles.toolbar}>
          <Skel w={15} h={15} radius={4} />
          <Skel w={168} h={14} />
          <Skel w={112} h={22} radius={999} />
          <div className={styles.toolbarRight}>
            <Skel w={72} h={28} radius={8} />
            <Skel w={92} h={30} radius={9} />
          </div>
        </div>

        <div className={styles.stage}>
          <aside className={styles.sections} aria-label="섹션">
            <div className={styles.sectionsHead}>
              <span className={styles.sectionsLabel}>섹션</span>
            </div>
            <div className={styles.sectionList}>
              {skelKeys(7).map((section) => (
                <Skel key={section} h={30} radius={7} style={{ marginBottom: 2 }} />
              ))}
            </div>
          </aside>

          <div className={styles.canvas}>
            <div className={styles.browser}>
              <div className={styles.browserChrome}>
                <Skel w={9} circle />
                <Skel w={9} circle />
                <Skel w={9} circle />
                <Skel w={188} h={12} radius={999} />
              </div>
              <div className={styles.page}>
                <Skel h={34} style={{ marginTop: 26 }} />
                <Skel w="72%" h={22} />
                <Skel h={168} radius={10} />
                <Skel w="88%" h={14} />
                <Skel w="64%" h={14} />
              </div>
            </div>
          </div>

          <aside className={styles.panel} aria-label="편집 패널">
            <div style={{ padding: "16px 18px" }}>
              <Skel w={104} h={12} style={{ marginBottom: 16 }} />
              {skelKeys(6).map((row) => (
                <Skel key={row} h={30} radius={8} style={{ marginBottom: 10 }} />
              ))}
            </div>
          </aside>
        </div>
      </div>
    </SkelRegion>
  );
}
