import type { ReactNode } from "react";
import { Card, cn } from "./ui";

type PublicAuthLayoutProps = {
  readonly children: ReactNode;
  readonly className?: string;
  readonly size?: "default" | "wide";
};

export function PublicAuthLayout({ children, className, size = "default" }: PublicAuthLayoutProps) {
  const maxWidthClassName = size === "wide" ? "max-w-xl" : "max-w-lg";

  return (
    <section
      data-auth-layout="centered-public-auth"
      className={cn(
        "mx-auto grid w-full min-w-0 justify-items-center gap-6 py-5 sm:py-8 lg:py-10",
        maxWidthClassName,
        className,
      )}
    >
      <div className="w-full min-w-0">{children}</div>
    </section>
  );
}

type AuthCardProps = {
  readonly eyebrow: string;
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
};

export function AuthCard({ eyebrow, title, description, children }: AuthCardProps) {
  return (
    <Card
      data-auth-card="centered-form-card"
      className="w-full max-w-full min-w-0 p-6 sm:p-8"
    >
      <div className="mb-5 min-w-0 border-b border-border pb-4">
        <p className="text-xs font-bold tracking-[0.1em] text-primary">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold leading-tight tracking-[-0.02em] text-card-foreground sm:text-[28px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </Card>
  );
}

type AuthStatusMessageProps = {
  readonly message: string;
  readonly tone?: "success" | "error" | "info";
};

export function AuthStatusMessage({ message, tone = "info" }: AuthStatusMessageProps) {
  if (!message) {
    return null;
  }

  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={cn(
        "rounded-xl border px-4 py-3 text-sm font-medium leading-6 [overflow-wrap:anywhere]",
        tone === "success" && "border-success bg-card text-success",
        tone === "error" && "border-danger bg-card text-danger",
        tone === "info" && "border-info bg-card text-info-strong",
      )}
    >
      {message}
    </p>
  );
}
