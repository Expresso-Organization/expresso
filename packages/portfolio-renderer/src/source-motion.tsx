import React from "react";
import { jsx } from "./source-jsx.js";
// 저장 HTML에는 클라이언트 상태가 없습니다. 원본의 모션 노드를 읽을 수 있는 CSS 모션으로 연결합니다.
const cache = new Map<string, React.ComponentType<Record<string, unknown>>>();
export const motion = new Proxy(
  {},
  {
    get(_target, tag: string) {
      if (!cache.has(tag))
        cache.set(
          tag,
          ({
            children,
            className,
            initial: _initial,
            animate: _animate,
            exit: _exit,
            variants: _variants,
            transition: _transition,
            whileInView: _view,
            whileHover: _hover,
            whileTap: _tap,
            viewport: _viewport,
            layout: _layout,
            layoutId: _id,
            ...props
          }) =>
            jsx(tag, {
              ...props,
              className: `${className || ""} sp-source-motion`,
              children,
            }),
        );
      return cache.get(tag);
    },
  },
);
export const AnimatePresence = ({
  children,
}: {
  children: React.ReactNode;
}) => <>{children}</>;
