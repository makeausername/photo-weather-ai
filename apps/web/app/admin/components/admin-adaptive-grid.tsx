import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../../components/ui";

type AdaptiveGridVariant = "section" | "card" | "metric" | "form";
type AdaptiveGridBreakpoint = "sm" | "md" | "lg" | "xl";

type AdaptiveGridOptions = {
  readonly variant?: AdaptiveGridVariant;
  readonly breakpoint?: AdaptiveGridBreakpoint;
  readonly className?: string;
  readonly allowThreeMetricColumns?: boolean;
  readonly allowFourMetricColumns?: boolean;
  readonly gapClassName?: string;
};

const twoColumnGridClasses: Record<AdaptiveGridBreakpoint, string> = {
  sm: "sm:grid-cols-2",
  md: "md:grid-cols-2",
  lg: "lg:grid-cols-2",
  xl: "xl:grid-cols-2",
};

const twoColumnFullSpanClasses: Record<AdaptiveGridBreakpoint, string> = {
  sm: "sm:col-span-2",
  md: "md:col-span-2",
  lg: "lg:col-span-2",
  xl: "xl:col-span-2",
};

function normalizeCount(itemCount: number): number {
  return Number.isFinite(itemCount) ? Math.max(0, Math.floor(itemCount)) : 0;
}

export function getAdaptiveGridClassName(
  itemCount: number,
  {
    variant = "section",
    breakpoint = "md",
    className,
    allowThreeMetricColumns = false,
    allowFourMetricColumns = false,
    gapClassName = "gap-3",
  }: AdaptiveGridOptions = {},
): string {
  const count = normalizeCount(itemCount);
  const baseClassName = cn("grid min-w-0", gapClassName);

  if (count <= 1) {
    return cn(baseClassName, className);
  }

  if (variant === "metric") {
    if (count === 3 && allowThreeMetricColumns) {
      return cn(baseClassName, "sm:grid-cols-3", className);
    }

    if (count === 4 && allowFourMetricColumns) {
      return cn(baseClassName, "sm:grid-cols-2 xl:grid-cols-4", className);
    }

    if (count === 6 && allowThreeMetricColumns) {
      return cn(baseClassName, "sm:grid-cols-2 xl:grid-cols-3", className);
    }

    return cn(baseClassName, "sm:grid-cols-2", className);
  }

  if (variant === "form" && count >= 6 && count % 2 === 0) {
    return cn(baseClassName, "md:grid-cols-2 xl:grid-cols-3", className);
  }

  return cn(baseClassName, twoColumnGridClasses[breakpoint], className);
}

export function getAdaptiveGridItemClassName(
  itemCount: number,
  itemIndex: number,
  {
    variant = "section",
    breakpoint = "md",
    className,
    allowThreeMetricColumns = false,
  }: AdaptiveGridOptions = {},
): string {
  const count = normalizeCount(itemCount);
  const isOnlyItem = count <= 1;
  const isOddLastItem = count > 1 && count % 2 === 1 && itemIndex === count - 1;

  if (!isOnlyItem && !isOddLastItem) {
    return cn("min-w-0", className);
  }

  if (variant === "metric") {
    if (count === 3 && allowThreeMetricColumns) {
      return cn("min-w-0", className);
    }

    if (count >= 6 && allowThreeMetricColumns) {
      return cn("min-w-0 sm:col-span-2 xl:col-span-3", className);
    }

    return cn("min-w-0 sm:col-span-2", className);
  }

  if (variant === "form") {
    if (count >= 6) {
      return cn("min-w-0 md:col-span-2 xl:col-span-3", className);
    }

    return cn("min-w-0 md:col-span-2", className);
  }

  return cn("min-w-0", twoColumnFullSpanClasses[breakpoint], className);
}

type AdaptiveAdminGridProps = HTMLAttributes<HTMLDivElement> &
  AdaptiveGridOptions & {
    readonly itemCount: number;
    readonly children: ReactNode;
  };

export function AdaptiveAdminGrid({
  itemCount,
  variant = "section",
  breakpoint = "md",
  allowThreeMetricColumns,
  allowFourMetricColumns,
  gapClassName,
  className,
  children,
  ...props
}: AdaptiveAdminGridProps) {
  return (
    <div
      className={getAdaptiveGridClassName(itemCount, {
        variant,
        breakpoint,
        allowThreeMetricColumns,
        allowFourMetricColumns,
        gapClassName,
        className,
      })}
      data-adaptive-grid-count={itemCount}
      data-adaptive-grid-variant={variant}
      {...props}
    >
      {children}
    </div>
  );
}

export function AdaptiveAdminCardGrid(props: Omit<AdaptiveAdminGridProps, "variant">) {
  return <AdaptiveAdminGrid {...props} variant="card" />;
}

export function AdaptiveAdminSectionGrid(props: Omit<AdaptiveAdminGridProps, "variant">) {
  return <AdaptiveAdminGrid {...props} variant="section" />;
}
