import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

/**
 * 지면 컴포넌트를 테스트에서 실제로 그리려면 두 가지가 필요합니다.
 *
 * JSX 변환 — tsconfig는 `preserve`입니다(Next가 자기 변환기로 처리하니까).
 * 테스트는 Next 밖에서 도니 여기서 정해 줘야 `.tsx`가 파싱됩니다.
 * Vite 8은 esbuild가 아니라 **oxc**를 씁니다.
 *
 * `@` 별칭 — 컴포넌트가 `@/lib/api/client` 같은 경로를 쓰고, 이건 tsconfig의
 * paths에만 적혀 있어 번들러에게 따로 알려야 합니다.
 */
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, "e2e/**"] },
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
