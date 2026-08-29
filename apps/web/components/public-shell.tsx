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
    <div className={cn("min-h-screen bg-background text-foreground", className)}>
      <PublicHeader />
      <div
        className={cn(
          "mx-auto w-full max-w-[1600px] min-w-0 px-[clamp(16px,4vw,64px)] py-7 sm:py-10 lg:py-12",
          contentClassName,
        )}
      >
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}
