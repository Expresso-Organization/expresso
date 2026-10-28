import type { ReactNode } from "react";

import { AppChrome } from "@/components/shell/AppChrome";

export default function Layout({ children }: { children: ReactNode }) {
  return <AppChrome>{children}</AppChrome>;
}
