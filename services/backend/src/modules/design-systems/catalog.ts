import { createHash } from "node:crypto";

import {
  DesignSystemCatalogItemSchema,
  DesignSystemRevisionSchema,
} from "@expresso/contracts";

import { builtinDesignSystems } from "./builtins.js";
import { compileDesignDocuments } from "./compiler.js";
import { referoDesignSystems } from "./refero-catalog.js";
import { stylePresetDesignSystems } from "./style-presets.js";

const definitions = [
  {
    entry: builtinDesignSystems.clarity,
    designSystemId: "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1001",
    revisionId: "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1002",
    legacyTemplateId: "c42de58e-a0d3-4118-ab68-1a057324f7f1",
    recommended: true,
    surface: "light",
    typographyCharacter: "산세리프",
    contentFocus: "text",
    moods: ["명료한", "절제된"],
    roles: ["일반", "기획", "운영"],
  },
  {
    entry: builtinDesignSystems.signal,
    designSystemId: "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1101",
    revisionId: "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1102",
    legacyTemplateId: "e1f697a4-ab3a-436a-913e-d214a65be422",
    recommended: false,
    surface: "dark",
    typographyCharacter: "기술 문서형",
    contentFocus: "metrics",
    moods: ["기술적", "정밀한"],
    roles: ["개발", "데이터", "인프라"],
  },
  {
    entry: builtinDesignSystems.editorial,
    designSystemId: "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1201",
    revisionId: "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1202",
    legacyTemplateId: "a3702f97-24e0-44ad-aff9-af895601dea1",
    recommended: false,
    surface: "light",
    typographyCharacter: "세리프",
    contentFocus: "image",
    moods: ["에디토리얼", "차분한"],
    roles: ["디자인", "연구", "집필"],
  },
  {
    entry: referoDesignSystems.apple,
    designSystemId: "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1301",
    revisionId: "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1303",
    legacyTemplateId: null,
    recommended: false,
    surface: "light",
    typographyCharacter: "큰 산세리프",
    contentFocus: "image",
    moods: ["넓은 여백", "절제된", "제품 중심"],
    roles: ["디자인", "제품", "브랜드"],
  },
  {
    entry: referoDesignSystems.mercury,
    designSystemId: "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1401",
    revisionId: "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1402",
    legacyTemplateId: null,
    recommended: false,
    surface: "dark",
    typographyCharacter: "중간 굵기 산세리프",
    contentFocus: "image",
    moods: ["프리미엄", "조용한", "어두운"],
    roles: ["리더십", "전략", "핀테크"],
  },
  {
    entry: referoDesignSystems.linear,
    designSystemId: "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1501",
    revisionId: "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1502",
    legacyTemplateId: null,
    recommended: false,
    surface: "dark",
    typographyCharacter: "정밀한 산세리프",
    contentFocus: "metrics",
    moods: ["기술적", "정밀한", "장식 없는"],
    roles: ["개발", "제품", "운영"],
  },
  {
    entry: referoDesignSystems.elevenLabs,
    designSystemId: "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1601",
    revisionId: "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1602",
    legacyTemplateId: null,
    recommended: false,
    surface: "light",
    typographyCharacter: "가는 산세리프",
    contentFocus: "text",
    moods: ["에디토리얼", "따뜻한", "기술적"],
    roles: ["AI", "연구", "창작"],
  },
  {
    entry: referoDesignSystems.stripe,
    designSystemId: "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1701",
    revisionId: "5d8f5f2d-6d2a-4f24-9d1a-2b8f9e7c1702",
    legacyTemplateId: null,
    recommended: false,
    surface: "light",
    typographyCharacter: "가는 산세리프",
    contentFocus: "metrics",
    moods: ["기술적", "정돈된", "인디고"],
    roles: ["개발", "데이터", "비즈니스"],
  },
] as const;

/**
 * 참고 디자인이 어느 회사 사이트에서 왔는지. 참고 잠금의 출처 가운데 이 표에
 * 걸리는 호스트가 그 디자인의 출처 회사다. Refero 같은 중개 자리는 표에 없으니
 * 걸러진다. 마크 그림은 웹이 가진다 — 여기서 정하는 것은 이름뿐이다.
 */
const COMPANY_HOSTS: Record<string, string> = {
  "apple.com": "apple",
  "mercury.com": "mercury",
  "linear.app": "linear",
  "elevenlabs.io": "elevenlabs",
  "stripe.com": "stripe",
};

/** 출처 URL 들에서 아는 회사를 찾는다. 없으면 null. */
function companyMark(sources: ReadonlyArray<{ url: string | null }>): string | null {
  for (const { url } of sources) {
    const host = url === null ? null : URL.parse(url)?.hostname.replace(/^www\./, "");
    if (host && COMPANY_HOSTS[host]) return COMPANY_HOSTS[host];
  }
  return null;
}

/** 30종 스타일 프리셋을 카탈로그 정의와 같은 모양으로 편다. */
const presetDefinitions = stylePresetDesignSystems.map((preset) => ({
  entry: { code: preset.code, spec: preset.spec, referenceLock: preset.referenceLock },
  designSystemId: preset.designSystemId,
  revisionId: preset.revisionId,
  legacyTemplateId: preset.legacyTemplateId,
  recommended: false,
  surface: preset.surface,
  typographyCharacter: preset.typographyCharacter,
  contentFocus: preset.contentFocus,
  moods: [] as string[],
  roles: [] as string[],
}));

/** 문서 컴파일은 결정적이므로 한 번만 한다. 요청마다 서른여덟 벌을 다시 짓지 않는다. */
let cached: ReturnType<typeof buildCatalog> | null = null;

export function catalogEntries() {
  cached ??= buildCatalog();
  return cached;
}

function buildCatalog() {
  return [...definitions, ...presetDefinitions].map((definition) => {
    const { entry } = definition;
    const compiled = compileDesignDocuments(entry.spec, entry.referenceLock);
    const revision = DesignSystemRevisionSchema.parse({
      designSystemId: definition.designSystemId,
      revisionId: definition.revisionId,
      code: entry.code,
      spec: entry.spec,
      referenceLock: entry.referenceLock,
      designMarkdown: compiled.markdown,
      designHtml: compiled.html,
      markdownSha256: compiled.markdownSha256,
      htmlSha256: createHash("sha256").update(compiled.html).digest("hex"),
      contentHash: compiled.contentHash,
      legacyTemplateId: definition.legacyTemplateId,
    });
    const item = DesignSystemCatalogItemSchema.parse({
      designSystemId: definition.designSystemId,
      revisionId: definition.revisionId,
      code: entry.code,
      name: entry.spec.identity.name,
      description: entry.spec.identity.description,
      origin: entry.spec.origin,
      traits: entry.spec.identity.traits,
      signatureMove: entry.referenceLock.signatureMove,
      fitReasons: entry.referenceLock.fitReasons,
      recommended: definition.recommended,
      surface: definition.surface,
      density: entry.spec.composition.density,
      typographyCharacter: definition.typographyCharacter,
      contentFocus: definition.contentFocus,
      moods: definition.moods,
      roles: definition.roles,
      preview: {
        canvas: entry.spec.colors.canvas.value,
        text: entry.spec.colors.text.value,
        accent: entry.spec.colors.accent.value,
        displayFamily: entry.spec.typography.display.family,
        displayFallback: entry.spec.typography.display.fallback,
        mark: companyMark(entry.referenceLock.sources),
      },
      markdownSha256: compiled.markdownSha256,
      legacyTemplateId: definition.legacyTemplateId,
    });
    return { item, revision };
  });
}
