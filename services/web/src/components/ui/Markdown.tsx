import Markdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./Markdown.module.css";

/**
 * 마크다운을 그린다.
 *
 * 두 자리가 쓴다 — 06b 공고 원문(수집이 HTML을 옮겨 담은 것)과 05 커리어 기록의
 * 본문(`record.body_md`). 둘 다 **평문으로 그리고 있었다**: 제목과 항목이 같은
 * 굵기의 한 덩어리로 붙어 나왔다.
 *
 * `react-markdown`은 HTML 문자열이 아니라 **React 엘리먼트**를 만든다. 사용자와
 * 바깥에서 온 글을 그리는 자리라 이게 중요하다 — 본문에 `<script>`가 섞여 있어도
 * 마크업으로 살아나지 않는다.
 *
 * 제목은 `h3`부터 시작한다. 화면의 제목(`h1`)은 공고 이름이거나 기록 제목이고,
 * 본문 안에서 그것과 같은 단계를 쓰면 읽는 순서가 무너진다.
 *
 * 여기는 **글자를 그리는 것까지만** 한다. 스택 이름을 칩으로 세우는 일은
 * `StackMarkdown`이 `rehypePlugins`와 `span`으로 얹는다 — 로고 60장은 이 화면
 * 저 화면이 다 짊어질 무게가 아니다.
 */
export function MarkdownBody({
  children,
  className,
  rehypePlugins,
  span,
}: {
  children: string;
  className?: string | undefined;
  rehypePlugins?: Options["rehypePlugins"];
  span?: Components["span"];
}) {
  return (
    <div className={[styles.body, className].filter(Boolean).join(" ")}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={rehypePlugins ?? []}
        components={{
          ...(span ? { span } : {}),
          h1: ({ children: text }) => <h3 className={styles.heading}>{text}</h3>,
          h2: ({ children: text }) => <h3 className={styles.heading}>{text}</h3>,
          h3: ({ children: text }) => <h3 className={styles.heading}>{text}</h3>,
          h4: ({ children: text }) => <h4 className={styles.subheading}>{text}</h4>,
          h5: ({ children: text }) => <h4 className={styles.subheading}>{text}</h4>,
          h6: ({ children: text }) => <h4 className={styles.subheading}>{text}</h4>,
          p: ({ children: text }) => <p className={styles.paragraph}>{text}</p>,
          ul: ({ children: text }) => <ul className={styles.list}>{text}</ul>,
          ol: ({ children: text }) => <ol className={styles.orderedList}>{text}</ol>,
          li: ({ children: text }) => <li className={styles.item}>{text}</li>,
          hr: () => <hr className={styles.rule} />,
          // 바깥으로 나가는 링크다. 새 탭에서 열고 참조를 끊는다.
          a: ({ href, children: text }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={styles.link}
            >
              {text}
            </a>
          ),
          code: ({ children: text }) => <code className={styles.code}>{text}</code>,
          pre: ({ children: text }) => <pre className={styles.pre}>{text}</pre>,
          blockquote: ({ children: text }) => (
            <blockquote className={styles.quote}>{text}</blockquote>
          ),
          table: ({ children: text }) => (
            // 넓은 표는 지면을 밀지 않고 제 안에서 넘긴다.
            <div className={styles.tableWrap}>
              <table className={styles.table}>{text}</table>
            </div>
          ),
          th: ({ children: text }) => <th className={styles.tableHead}>{text}</th>,
          td: ({ children: text }) => <td className={styles.tableCell}>{text}</td>,
        }}
      >
        {children}
      </Markdown>
    </div>
  );
}
