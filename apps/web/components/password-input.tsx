"use client";

import { useState } from "react";
import { Input, type InputProps, cn } from "./ui";

type PasswordInputProps = Omit<InputProps, "type">;

export function PasswordInput({ className, disabled, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible ? "隐藏密码" : "显示密码";

  return (
    <div className="relative">
      <Input
        {...props}
        disabled={disabled}
        type={visible ? "text" : "password"}
        className={cn("pr-16", className)}
      />
      <button
        type="button"
        aria-label={toggleLabel}
        aria-pressed={visible}
        disabled={disabled}
        className="absolute right-1.5 top-1/2 inline-flex h-7 -translate-y-1/2 items-center rounded-md border border-transparent px-2 text-xs font-semibold text-primary transition hover:bg-secondary hover:text-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? "隐藏" : "显示"}
      </button>
    </div>
  );
}
