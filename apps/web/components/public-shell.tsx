import type { ReactNode } from "react";
import { PublicHeader } from "./public-header";
import { SiteFooter } from "./site-footer";
import { cn } from "./ui";

type PublicShellProps = {
  readonly children: ReactNode;
  readonly className?: string;
  readonly contentClassName?: string;
};

export function PublicShell({ children, className, contentClassName }: PublicShellProps) {
  return (
    <div className={cn("min-h-screen overflow-x-hidden bg-background text-foreground", className)}>
      <PublicHeader />
      <div
        className={cn(
          "w-full min-w-0 px-[clamp(16px,4vw,72px)] py-6 sm:py-8 lg:py-9",
          contentClassName,
        )}
      >
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}
