import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { Skel, SkelRegion, skelKeys } from "@/components/shell/Skeleton";

import { AccountNav } from "../AccountNav";
import styles from "../page.module.css";

/**
 * 프로필이 세션을 기다리는 동안.
 *
 * 좌측 탭과 제목은 응답과 무관하다. 덮어 두면 어느 설정을 열었는지도 잠깐
 * 사라지므로 그대로 그린다.
 */
export default function Loading() {
  return (
    <>
      <DocumentHeader crumbs={["설정", "프로필"]} />
      <AppBody>
        <div className={styles.body}>
          <AccountNav active="profile" />
          <SkelRegion label="프로필을 불러오는 중" className={styles.main}>
            <h1 className={styles.title}>프로필</h1>

            <div className={styles.section}>
              {skelKeys(2).map((row) => (
                <div key={row} className={styles.dataRow}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Skel w={row === 0 ? 112 : 196} h={13} />
                    <Skel w={64} h={11} style={{ marginTop: 7 }} />
                  </div>
                </div>
              ))}
            </div>
          </SkelRegion>
        </div>
      </AppBody>
    </>
  );
}
