import type { ReactNode } from "react";
import { Card, cn } from "./ui";

export type AuthTrustItem = {
  readonly title: string;
  readonly description: string;
};

export type AuthWorkflowItem = {
  readonly label: string;
  readonly value: string;
};

type PublicAuthLayoutProps = {
  readonly productPanel: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
};

export function PublicAuthLayout({ productPanel, children, className }: PublicAuthLayoutProps) {
  return (
    <section
      data-auth-layout="commercial-two-column responsive-auth-grid"
      className={cn(
        "mx-auto grid w-full max-w-[1180px] gap-5 lg:min-h-[560px] lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.75fr)] lg:items-stretch xl:gap-6",
        className,
      )}
    >
      <div className="order-2 min-w-0 lg:order-1">{productPanel}</div>
      <div className="order-1 flex min-w-0 lg:order-2 lg:items-center">{children}</div>
    </section>
  );
}

type AuthProductPanelProps = {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly trustItems: readonly AuthTrustItem[];
  readonly workflowItems: readonly AuthWorkflowItem[];
};

export function AuthProductPanel({
  eyebrow,
  title,
  description,
  trustItems,
  workflowItems,
}: AuthProductPanelProps) {
  return (
    <section
      data-auth-product-panel="trust-and-workflow"
      className="flex h-full min-h-full flex-col overflow-hidden rounded-lg border border-border bg-card shadow-soft"
    >
      <div className="grid gap-6 p-5 sm:p-6 lg:p-7">
        <div className="flex items-start gap-4">
          <img
            src="/brand-mark.svg"
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg border border-border bg-background p-1.5 shadow-sm"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-sm font-bold text-primary">{eyebrow}</p>
            <h1 className="mt-2 text-[30px] font-bold leading-tight text-card-foreground sm:text-[36px] lg:text-[40px]">
              {title}
            </h1>
          </div>
        </div>

        <p className="max-w-2xl text-[15px] leading-7 text-muted-foreground sm:text-base sm:leading-8">
          {description}
        </p>

        <AuthTrustList items={trustItems} />
      </div>

      <div className="mt-auto border-t border-border bg-muted/35 p-5 sm:p-6 lg:p-7">
        <p className="text-sm font-bold text-card-foreground">账户工作流</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {workflowItems.map((item) => (
            <div key={item.label} className="rounded-lg border border-border bg-card/80 px-3 py-3">
              <dt className="text-xs font-semibold text-muted-foreground">{item.label}</dt>
              <dd className="mt-1 text-sm font-bold leading-6 text-card-foreground">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function AuthTrustList({ items }: { readonly items: readonly AuthTrustItem[] }) {
  return (
    <ul className="grid gap-3" aria-label="账户能力">
      {items.map((item) => (
        <li
          key={item.title}
          className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-lg border border-border bg-background/55 p-3"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/35 bg-secondary text-sm font-bold text-primary"
          >
            ✓
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
    <Card data-auth-card="refined-form" className="w-full p-5 shadow-soft sm:p-6 lg:p-7">
      <div className="mb-5 border-b border-border pb-5">
        <p className="text-sm font-bold text-primary">{eyebrow}</p>
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
      className={cn(
        "rounded-lg border px-3 py-2.5 text-sm leading-6",
        tone === "success" && "border-success bg-card text-success",
        tone === "error" && "border-danger bg-card text-danger",
        tone === "info" && "border-info bg-card text-info",
      )}
    >
      {message}
    </p>
  );
}
