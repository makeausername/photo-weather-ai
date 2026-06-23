"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Badge, Button, cn } from "./ui";

export type CollapsibleSectionProps = {
  readonly title: string;
  readonly description?: ReactNode;
  readonly count?: number;
  readonly countLabel?: string;
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly defaultOpen?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly lazyRender?: boolean;
  readonly className?: string;
  readonly bodyClassName?: string;
};

export function CollapsibleSection({
  title,
  description,
  count,
  countLabel,
  actions,
  children,
  defaultOpen = false,
  open,
  onOpenChange,
  lazyRender = true,
  className,
  bodyClassName,
}: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const expanded = open ?? internalOpen;
  const panelId = useId();
  const normalizedCountLabel =
    countLabel ?? (typeof count === "number" ? `${count} 笔` : undefined);

  function toggle() {
    const nextOpen = !expanded;
    setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  }

  return (
    <section
      className={cn("grid min-w-0 gap-3", className)}
      data-collapsible-section={title}
      data-collapsible-open={expanded ? "true" : "false"}
    >
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-card-foreground">{title}</h2>
            {normalizedCountLabel ? <Badge variant="muted">{normalizedCountLabel}</Badge> : null}
          </div>
          {description ? (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={toggle}
          >
            {expanded ? "收起" : "展开"}
          </Button>
        </div>
      </div>
      {expanded || !lazyRender ? (
        <div id={panelId} className={cn("grid min-w-0 gap-3", bodyClassName)}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
