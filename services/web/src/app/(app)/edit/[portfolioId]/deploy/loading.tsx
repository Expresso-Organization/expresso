import { AppBody, DocumentHeader } from "@/components/shell/AppShell";
import { Skel, SkelRegion, skelKeys } from "@/components/shell/Skeleton";

import styles from "./page.module.css";

/**
 * 04c 배포가 포트폴리오와 배포 이력을 기다리는 동안.
 *
 * 제목과 안내문은 응답과 무관하므로 그대로 적는다. 빵부스러기의 첫 조각은
 * 포트폴리오 이름이라 비운다 — 어느 것을 배포하는지는 응답이 정한다.
 * 아래 네 구획은 `DeployPanel`이 그리는 구획 수와 같다.
 */
export default function Loading() {
  return (
    <>
      <DocumentHeader crumbs={[null, "배포"]} />
      <AppBody>
        <SkelRegion label="배포 화면을 불러오는 중" className={styles.body}>
          <div className={styles.inner}>
            <h1 className={styles.title}>배포</h1>
            <p className={styles.intro}>
              주소를 발급하고 버전 단위로 공개합니다. 배포하면 이전 버전은 남고, 언제든
              되돌릴 수 있습니다.
            </p>

            {skelKeys(4).map((section) => (
              <div key={section} className={styles.section}>
                <Skel w={78} h={9} style={{ marginBottom: 12 }} />
                <div className={styles.card}>
                  <Skel w="46%" h={13} />
                  <Skel h={11} style={{ marginTop: 11 }} />
                  <Skel w="68%" h={11} style={{ marginTop: 7 }} />
                </div>
              </div>
            ))}
          </div>
        </SkelRegion>
      </AppBody>
    </>
  );
}
