"use client";

import type { ReactNode } from "react";
import { usePublicFrame } from "./public-frame";
import { PublicHeader } from "./public-header";
import { SiteFooter } from "./site-footer";
import { cn } from "./ui";

type PublicShellProps = {
  readonly children: ReactNode;
  readonly className?: string;
  readonly contentClassName?: string;
};

export function PublicShell({ children, className, contentClassName }: PublicShellProps) {
  const framed = usePublicFrame();
  return (
    <div className={cn(!framed && "min-h-screen bg-background text-foreground", className)}>
      {!framed && <PublicHeader />}
      <div
        className={cn(
          "mx-auto w-full max-w-[1440px] min-w-0 px-[clamp(16px,4vw,48px)] py-6 sm:py-8 lg:py-9",
          contentClassName,
        )}
      >
        {children}
      </div>
      {!framed && <SiteFooter />}
    </div>
  );
}
