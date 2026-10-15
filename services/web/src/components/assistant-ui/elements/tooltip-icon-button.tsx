"use client";

// NOTE(agent-chat-framework): 이 파일은 원본에서 수정되었다.
// TooltipProvider 에 Radix 이름인 delayDuration 을 넘기고 있었다.
// shadcn base-nova 의 Tooltip 은 @base-ui/react 기반이라 prop 이름이
// delay 다. 같은 파일이 이미 Base UI 의 render 패턴을 쓰고 있으므로
// 마이그레이션이 덜 끝난 상태로 보인다.
// 원본: vendor/assistant-ui/elements/tooltip-icon-button.tsx

import { type ComponentPropsWithRef, forwardRef } from "react";
import { Slot } from "radix-ui";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TooltipIconButtonProps = ComponentPropsWithRef<typeof Button> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
};

export const TooltipIconButton = forwardRef<
  HTMLButtonElement,
  TooltipIconButtonProps
>(({ children, tooltip, side = "bottom", className, ...rest }, ref) => {
  return (
    <TooltipProvider delay={0}>
      <Tooltip>
        <TooltipTrigger render={<Button variant="ghost" size="icon" {...rest} className={cn(
                            "aui-button-icon size-6 p-1 active:scale-90",
                            className,
                          )} ref={ref} />}><Slot.Slottable>{children}</Slot.Slottable><span className="aui-sr-only sr-only">{tooltip}</span></TooltipTrigger>
        <TooltipContent side={side}>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

TooltipIconButton.displayName = "TooltipIconButton";
