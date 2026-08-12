import { MarkdownBody } from "./Markdown";
import styles from "./StackMarkdown.module.css";
import { logoOf, rehypeStackChips, stackSlugOf } from "./stacks";

/**
 * 스택 이름이 칩으로 서는 본문.
 *
 * `MarkdownBody`와 따로 두는 이유는 **무게** 때문이다. 로고 60장의 path만
 * 85KB인데, 이걸 `MarkdownBody` 안에 붙여 두면 그 컴포넌트를 쓰는 모든 화면이
 * — 칩을 켜지 않은 화면까지 — 그 무게를 같이 받는다. 05 커리어 기록 패널은
 * 클라이언트 컴포넌트라 실제로 브라우저까지 내려갔다.
 *
 * 지금 이걸 쓰는 06b는 서버 컴포넌트다. 그래서 로고는 서버에서만 살고
 * 브라우저로는 그려진 결과만 간다.
 */
export function StackMarkdown({
  children,
  className,
}: {
  children: string;
  className?: string | undefined;
}) {
  return (
    <MarkdownBody
      className={className}
      rehypePlugins={[rehypeStackChips]}
      // 칩은 rehypeStackChips가 심어 둔 span이다. 나머지 span은 그대로 둔다.
      span={({ node, children: text, ...rest }) => {
        const slug = stackSlugOf(node?.properties);
        if (slug === null) return <span {...rest}>{text}</span>;
        return <StackChip slug={slug}>{text}</StackChip>;
      }}
    >
      {children}
    </MarkdownBody>
  );
}

/**
 * 스택 하나.
 *
 * 글자는 **원문 그대로** 둔다 — 공고가 `Golang`이라 적었으면 칩에도 `Golang`이
 * 서고, 로고만 Go의 것이 붙는다. 이름을 우리가 고른 표기로 바꾸면 원문을
 * 보러 온 사람에게 없는 글자를 보여주는 셈이다.
 *
 * 로고를 모르는 이름(`slug`가 null)도 칩으로 선다. 분석이 뽑아 둔 기술 중에는
 * 우리 표에 없는 것이 있는데, 그걸 맨 글자로 두면 한 줄 안에서 두 종류의
 * 물건처럼 보인다 — 로고가 없는 것은 우리 사정이지 그 기술의 사정이 아니다.
 */
export function StackChip({ slug, children }: { slug: string | null; children: React.ReactNode }) {
  const logo = slug === null ? undefined : logoOf(slug);
  return (
    <span className={logo ? styles.chip : `${styles.chip} ${styles.bare}`}>
      {logo ? (
        <svg
          className={styles.mark}
          viewBox={`0 0 ${logo.box} ${logo.box}`}
          aria-hidden="true"
          focusable="false"
        >
          <path d={logo.path} fill={logo.hex} />
        </svg>
      ) : null}
      {children}
    </span>
  );
}
