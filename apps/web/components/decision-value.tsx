import { cn } from "./ui";

/** Dates are context; keep the complete value available without giving every word equal weight. */
export function splitDecisionValue(value: string) {
  const match = value.match(
    /^(\d{4}年\d{1,2}月\d{1,2}日(?:\s+星期[一二三四五六日天])?)\s*·\s*(.+)$/,
  );
  return match?.[1] && match[2] ? { context: match[1], value: match[2] } : { context: null, value };
}

export function DecisionValue({
  value,
  className,
}: {
  readonly value: string;
  readonly className?: string;
}) {
  const display = splitDecisionValue(value);
  const concise = display.value.length <= 14;
  return (
    <p
      className={cn(
        "decision-value min-w-0 break-words font-semibold [overflow-wrap:anywhere]",
        className,
      )}
    >
      {display.context ? (
        <span className="mb-1 block text-xs font-normal tracking-normal text-muted-foreground">
          {display.context}
          <span className="sr-only"> · </span>
        </span>
      ) : null}
      <span
        className={cn(
          "block",
          concise ? "text-[28px] leading-tight sm:text-[30px]" : "text-lg leading-7",
        )}
      >
        {display.value}
      </span>
    </p>
  );
}
