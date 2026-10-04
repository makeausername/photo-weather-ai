import type { ReactNode } from "react";
import { cn } from "./ui";

export function ForecastEntryHeader({
  title,
  description,
  centered = false,
}: {
  readonly title: string;
  readonly description: string;
  readonly centered?: boolean;
}) {
  return (
    <header className={cn("w-full", centered && "mx-auto max-w-[760px] sm:text-center")}>
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-foreground sm:text-[34px]">
        {title}
      </h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
    </header>
  );
}

export function ForecastEntryHelp({ children }: { readonly children: ReactNode }) {
  return (
    <details className="min-w-0 border-t border-border" data-forecast-entry-help="true">
      <summary className="cursor-pointer py-4 text-sm font-medium text-muted-foreground hover:text-foreground">
        如何判断拍摄条件？
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}
