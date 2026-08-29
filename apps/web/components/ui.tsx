import { forwardRef } from "react";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TableHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
type ButtonSize = "sm" | "md" | "lg";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-[var(--primary-hover)] disabled:hover:bg-primary",
  secondary:
    "border-border bg-card text-card-foreground hover:border-primary hover:bg-secondary disabled:hover:bg-card",
  ghost:
    "border-transparent bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground disabled:hover:bg-transparent",
  danger:
    "border-danger bg-danger text-white shadow-sm hover:brightness-95 disabled:hover:brightness-100",
  success:
    "border-success bg-success text-white shadow-sm hover:brightness-95 disabled:hover:brightness-100",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-sm",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-55",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "h-12 w-full min-w-0 rounded-xl border border-border bg-card px-4 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "min-h-28 w-full min-w-0 rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "h-12 w-full min-w-0 rounded-xl border border-border bg-card px-4 text-sm text-foreground transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

type CardProps = HTMLAttributes<HTMLElement> & {
  readonly children: ReactNode;
};

export function Card({ children, className, ...props }: CardProps) {
  return (
    <section
      className={cn("rounded-2xl border border-border bg-card shadow-panel", className)}
      {...props}
    >
      {children}
    </section>
  );
}

type BadgeVariant = "default" | "success" | "warning" | "danger" | "muted" | "accent" | "info";

const badgeVariants: Record<BadgeVariant, string> = {
  default: "border-primary bg-secondary text-secondary-foreground",
  success: "border-success bg-card text-success",
  warning: "border-warning bg-card text-warning-strong",
  danger: "border-danger bg-card text-danger",
  muted: "border-border bg-muted text-muted-foreground",
  accent: "border-accent bg-card text-accent-strong",
  info: "border-info bg-card text-info-strong",
};

type BadgeProps = {
  readonly children: ReactNode;
  readonly variant?: BadgeVariant;
  readonly className?: string;
};

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold",
        badgeVariants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

type ResponsiveDataScrollerProps = HTMLAttributes<HTMLDivElement> & {
  readonly children: ReactNode;
  readonly bare?: boolean;
};

export function ResponsiveDataScroller({
  children,
  className,
  bare = false,
  ...props
}: ResponsiveDataScrollerProps) {
  return (
    <div
      className={cn(
        "w-full max-w-full min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]",
        bare ? "rounded-none border-0 bg-transparent" : "rounded-xl border border-border bg-card",
        className,
      )}
      data-responsive-data-scroller="true"
      {...props}
    >
      {children}
    </div>
  );
}

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <ResponsiveDataScroller>
      <table
        className={cn(
          "w-full min-w-[760px] border-separate border-spacing-0 text-left text-[13px] leading-5",
          className,
        )}
        data-responsive-table="true"
        {...props}
      />
    </ResponsiveDataScroller>
  );
}

type FormFieldProps = {
  readonly label: string;
  readonly children: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly className?: string;
};

export function FormField({ label, children, hint, error, className }: FormFieldProps) {
  return (
    <label className={cn("grid gap-2.5 text-sm font-semibold text-card-foreground", className)}>
      <span>{label}</span>
      {children}
      {hint ? (
        <span className="text-xs font-normal leading-5 text-muted-foreground">{hint}</span>
      ) : null}
      {error ? <span className="text-xs font-normal leading-5 text-danger">{error}</span> : null}
    </label>
  );
}

type SwitchRowProps = {
  readonly label: string;
  readonly description?: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
  readonly className?: string;
};

export function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled,
  className,
}: SwitchRowProps) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm transition hover:border-primary hover:bg-secondary",
        disabled && "cursor-not-allowed opacity-60",
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-border text-primary"
      />
      <span className="grid gap-1">
        <span className="font-semibold text-foreground">{label}</span>
        {description ? (
          <span className="text-xs leading-5 text-muted-foreground">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

type PageHeaderProps = {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
};

export function PageHeader({ eyebrow, title, description, action, className }: PageHeaderProps) {
  return (
    <header
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-3 text-xs font-bold tracking-[0.12em] text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="text-[30px] font-bold leading-tight tracking-[-0.025em] text-foreground sm:text-[36px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-[15px]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="min-w-0 sm:shrink-0">{action}</div> : null}
    </header>
  );
}

type EmptyStateProps = {
  readonly title: string;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("grid place-items-center gap-3 px-6 py-10 text-center", className)}>
      <div>
        <p className="font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
