import type { ReactNode } from "react";
import { Card, cn } from "./ui";

type PublicAuthLayoutProps = {
  readonly children: ReactNode;
  readonly className?: string;
  readonly size?: "default" | "wide";
};

export function PublicAuthLayout({
  children,
  className,
  size = "default",
}: PublicAuthLayoutProps) {
  const maxWidthClassName = size === "wide" ? "max-w-[580px]" : "max-w-[500px]";

  return (
    <section
      data-auth-layout="centered-public-auth"
      className={cn(
        "mx-auto grid w-full min-w-0 justify-items-center gap-5 pt-2 sm:pt-4 lg:pt-6",
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
    <Card data-auth-card="centered-form-card" className="w-full p-5 shadow-sm sm:p-6">
      <div className="mb-5 border-b border-border pb-4">
        <p className="text-xs font-bold text-primary">{eyebrow}</p>
        <h1 className="mt-1.5 text-xl font-bold leading-tight text-card-foreground sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
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
        "rounded-lg border px-3 py-2.5 text-sm font-medium leading-6",
        tone === "success" && "border-success bg-card text-success",
        tone === "error" && "border-danger bg-card text-danger",
        tone === "info" && "border-info bg-card text-info",
      )}
    >
      {message}
    </p>
  );
}
