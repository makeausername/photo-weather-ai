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
        className={cn("w-full px-[clamp(24px,4vw,72px)] py-6 sm:py-8 lg:py-9", contentClassName)}
      >
        {children}
      </div>
    </main>
  );
}
