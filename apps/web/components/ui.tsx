import type {
  ButtonHTMLAttributes,
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
    "border-primary bg-primary text-primary-foreground hover:brightness-95 disabled:hover:brightness-100",
  secondary:
    "border-border bg-card text-card-foreground hover:border-primary hover:bg-secondary disabled:hover:bg-card",
  ghost:
    "border-transparent bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground disabled:hover:bg-transparent",
  danger: "border-danger bg-danger text-white hover:brightness-95 disabled:hover:brightness-100",
  success: "border-success bg-success text-white hover:brightness-95 disabled:hover:brightness-100",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-9 px-3 text-sm",
  lg: "h-11 px-4 text-sm",
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
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border font-semibold transition disabled:cursor-not-allowed disabled:opacity-55",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...props}
    />
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full min-w-0 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm transition placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground",
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
        "h-10 w-full min-w-0 rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

type CardProps = {
  readonly children: ReactNode;
  readonly className?: string;
};

export function Card({ children, className }: CardProps) {
  return (
    <section className={cn("rounded-lg border border-border bg-card shadow-sm", className)}>
      {children}
    </section>
  );
}

type BadgeVariant = "default" | "success" | "warning" | "danger" | "muted";

const badgeVariants: Record<BadgeVariant, string> = {
  default: "border-primary bg-secondary text-secondary-foreground",
  success: "border-success bg-card text-success",
  warning: "border-warning bg-card text-warning",
  danger: "border-danger bg-card text-danger",
  muted: "border-border bg-muted text-muted-foreground",
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

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-card">
      <table
        className={cn("w-full min-w-[760px] border-collapse text-left text-sm", className)}
        {...props}
      />
    </div>
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
    <label className={cn("grid gap-2 text-sm font-semibold text-card-foreground", className)}>
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
        "flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 text-sm shadow-sm transition hover:border-primary hover:bg-secondary",
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
          <p className="mb-2 text-xs font-bold tracking-normal text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl font-bold tracking-normal text-foreground sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
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

type ConfirmDialogProps = {
  readonly open: boolean;
  readonly title: string;
  readonly description: ReactNode;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly confirmVariant?: ButtonVariant;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  confirmVariant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="grid w-full max-w-md gap-5 rounded-2xl border border-border bg-card p-6 shadow-soft"
      >
        <div>
          <h2 className="text-lg font-bold text-foreground">{title}</h2>
          <div className="mt-2 text-sm leading-6 text-muted-foreground">{description}</div>
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
