"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "../../../components/ui";

export type AdminActionFeedbackVariant = "saving" | "info" | "success" | "warning" | "error";

export type AdminActionFeedback = {
  readonly id: string | number;
  readonly variant: AdminActionFeedbackVariant;
  readonly message: ReactNode;
  readonly title?: ReactNode;
  readonly autoDismissMs?: number | false;
};

type AdminActionFeedbackInput = Omit<AdminActionFeedback, "id">;

export type { AdminActionFeedbackInput };

const feedbackClasses: Record<AdminActionFeedbackVariant, string> = {
  saving: "border-info bg-card text-info",
  info: "border-info bg-card text-info",
  success: "border-success bg-card text-success",
  warning: "border-warning bg-card text-warning",
  error: "border-danger bg-card text-danger",
};

const dotClasses: Record<AdminActionFeedbackVariant, string> = {
  saving: "bg-info",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-danger",
};

function autoDismissMsFor(feedback: AdminActionFeedback): number | false {
  if (feedback.autoDismissMs !== undefined) {
    return feedback.autoDismissMs;
  }

  if (feedback.variant === "success") {
    return 4000;
  }

  if (feedback.variant === "info") {
    return 4500;
  }

  return false;
}

export function AdminActionToast({
  feedback,
  onDismiss,
  className,
}: {
  readonly feedback?: AdminActionFeedback | null;
  readonly onDismiss?: () => void;
  readonly className?: string;
}) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeoutMs = autoDismissMsFor(feedback);
    if (timeoutMs === false || timeoutMs <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      onDismissRef.current?.();
    }, timeoutMs);

    return () => window.clearTimeout(timer);
  }, [feedback]);

  if (!feedback) {
    return null;
  }

  const isError = feedback.variant === "error";

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-3 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-20 sm:block sm:w-[min(420px,calc(100vw-2rem))] sm:px-0",
        className,
      )}
    >
      <div
        role={isError ? "alert" : "status"}
        aria-live={isError ? "assertive" : "polite"}
        className={cn(
          "pointer-events-auto flex max-w-full items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-soft",
          feedbackClasses[feedback.variant],
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "mt-2 h-2 w-2 shrink-0 rounded-full",
            dotClasses[feedback.variant],
            feedback.variant === "saving" && "animate-pulse",
          )}
        />
        <span className="min-w-0 flex-1 leading-6">
          {feedback.title ? (
            <span className="block font-bold text-card-foreground">{feedback.title}</span>
          ) : null}
          <span className="block break-words">{feedback.message}</span>
        </span>
        {onDismiss ? (
          <button
            type="button"
            aria-label="关闭提示"
            className="ml-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-current transition hover:border-border hover:bg-muted"
            onClick={onDismiss}
          >
            <span aria-hidden="true">x</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function AdminActionInlineMessage({
  feedback,
  className,
}: {
  readonly feedback?: Pick<AdminActionFeedback, "variant" | "message"> | null;
  readonly className?: string;
}) {
  if (!feedback) {
    return null;
  }

  const isError = feedback.variant === "error";

  return (
    <span
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={cn(
        "inline-flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm",
        feedbackClasses[feedback.variant],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          dotClasses[feedback.variant],
          feedback.variant === "saving" && "animate-pulse",
        )}
      />
      <span className="min-w-0 break-words">{feedback.message}</span>
    </span>
  );
}
