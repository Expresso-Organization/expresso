import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

const distDir = process.env.NEXT_DIST_DIR;

/**
 * `.next`가 아닌 폴더에 짓는 운영 빌드가 타입 검사에 쓸 tsconfig.
 *
 * `tsconfig.json`은 링크 타입(`link.d.ts`)과 화면 검사(`validator.ts`)를 `.next/types`에서 읽는다.
 * 다른 폴더에 지으면 방금 만든 타입은 그 폴더에 생기고, 검사는 `.next`에 남은 지난 빌드의 타입을
 * 읽는다 — 새 화면으로 가는 링크가 "없는 경로"로 걸린다(2026-11-19 #242 배포 실패).
 * `tsconfig.json`에 `extends`가 있어 Next가 `include`를 고쳐 주지 않으므로, 폴더마다 그 폴더의
 * 타입을 읽는 tsconfig를 따로 둔다. 없으면 `tsconfig.json`으로 넘어가지 않고 여기서 멈춘다.
 *
 * 근거: node_modules/next/dist/docs/01-app/03-api-reference/05-config/02-typescript.md 「Custom tsconfig path」
 */
function buildTsconfig(dir: string): string {
  const name = `tsconfig.${dir.replace(/^\./, "")}.json`;
  if (!existsSync(fileURLToPath(new URL(name, import.meta.url)))) {
    throw new Error(
      `NEXT_DIST_DIR=${dir}에 지으려면 services/web/${name} 파일이 필요합니다. ` +
        `tsconfig.json은 .next/types를 읽으므로, 그대로 쓰면 지난 빌드의 경로 타입으로 검사합니다. ` +
        `tsconfig.next-build.json을 본떠 include의 타입 폴더를 ${dir}/types로 적으십시오.`,
    );
  }
  return name;
}

export default function config(phase: string): NextConfig {
  return {
    ...(distDir ? { distDir } : {}),
    // 개발 서버와 next start는 타입 검사를 하지 않는다. 운영 빌드(next build · next typegen)에서만 바꾼다.
    ...(distDir && phase === PHASE_PRODUCTION_BUILD ? { typescript: { tsconfigPath: buildTsconfig(distDir) } } : {}),
    reactStrictMode: true,
    allowedDevOrigins: ["127.0.0.1", "localhost"],
    // contracts는 워크스페이스 소스를 그대로 쓴다 — 빌드 산출물을 기다리지 않는다.
    transpilePackages: ["@expresso/contracts"],
    // 아직 만들지 않은 화면으로 링크를 걸면 빌드에서 잡힌다.
    typedRoutes: true,
    experimental: {
      serverActions: {
        // 커리어 본문 그림은 서버 액션으로 올린다. 기본 1MB에서 막히지 않게 미디어 상한(MEDIA_MAX_BYTES 8MB)보다 조금 크게 둔다.
        // 근거: node_modules/next/dist/docs/01-app/02-guides/server-actions.md 「Body size limit」
        bodySizeLimit: "9mb",
      },
    },
  };
}
