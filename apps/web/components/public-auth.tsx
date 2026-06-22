import type { ReactNode } from "react";
import { Card, cn } from "./ui";

export type AuthTrustItem = {
  readonly title: string;
  readonly description: string;
};

type PublicAuthLayoutProps = {
  readonly productPanel: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
};

export function PublicAuthLayout({ productPanel, children, className }: PublicAuthLayoutProps) {
  return (
    <section
      data-auth-layout="balanced-public-auth homepage-rhythm responsive-auth-grid"
      className={cn(
        "mx-auto grid w-full max-w-[1180px] gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)] lg:items-start",
        className,
      )}
    >
      <div className="min-w-0">{productPanel}</div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

type AuthProductPanelProps = {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly trustItems: readonly AuthTrustItem[];
  readonly noteTitle?: string;
  readonly note?: string;
};

export function AuthProductPanel({
  eyebrow,
  title,
  description,
  trustItems,
  noteTitle,
  note,
}: AuthProductPanelProps) {
  return (
    <section
      data-auth-product-panel="practical-account-intro"
      className="grid content-start gap-5 rounded-lg border border-border bg-card p-5 shadow-sm sm:p-6 lg:p-7"
    >
      <div className="flex items-start gap-4">
        <img
          src="/brand-mark.svg"
          alt=""
          className="h-11 w-11 shrink-0 rounded-lg border border-border bg-background p-1.5 shadow-sm"
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-xs font-bold text-primary">{eyebrow}</p>
          <h1 className="mt-2 text-[28px] font-bold leading-tight text-card-foreground sm:text-[32px]">
            {title}
          </h1>
        </div>
      </div>

      <p className="max-w-2xl text-[15px] leading-7 text-muted-foreground">{description}</p>

      <AuthTrustList items={trustItems} />

      {note ? (
        <div className="rounded-lg border border-border bg-muted/35 px-4 py-3">
          {noteTitle ? (
            <p className="text-sm font-bold text-card-foreground">{noteTitle}</p>
          ) : null}
          <p className={cn("text-sm leading-6 text-muted-foreground", noteTitle && "mt-1")}>
            {note}
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function AuthTrustList({ items }: { readonly items: readonly AuthTrustItem[] }) {
  return (
    <ul className="grid gap-3" aria-label="账户说明">
      {items.map((item, index) => (
        <li
          key={item.title}
          className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 rounded-lg border border-border bg-background/70 p-3"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-xs font-bold text-primary"
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-card-foreground">{item.title}</span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              {item.description}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

type AuthCardProps = {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
};

export function AuthCard({ eyebrow, title, description, children }: AuthCardProps) {
  return (
    <Card data-auth-card="balanced-form-card" className="w-full p-5 shadow-sm sm:p-6">
      <div className="mb-5 border-b border-border pb-5">
        <p className="text-xs font-bold text-primary">{eyebrow}</p>
        <h2 className="mt-2 text-2xl font-bold leading-tight text-card-foreground">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
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
