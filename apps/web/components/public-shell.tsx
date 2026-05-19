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
          "mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10",
          contentClassName,
        )}
      >
        {children}
      </div>
    </main>
  );
}
