import type { ReactNode } from "react";
import { PublicHeader } from "./public-header";
import { cn } from "./ui";

type PublicShellProps = {
  readonly children: ReactNode;
  readonly className?: string;
  readonly contentClassName?: string;
};

export function PublicShell({ children, className, contentClassName }: PublicShellProps) {
  return (
    <main className={cn("min-h-screen bg-background text-foreground", className)}>
      <PublicHeader />
      <div
        className={cn(
          "mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10 xl:px-[72px]",
          contentClassName,
        )}
      >
        {children}
      </div>
    </main>
  );
}
