"use client";

import type { KeyboardEvent, Ref } from "react";
import { Input, cn } from "./ui";

export type LocationSearchInputProps = {
  readonly value: string;
  readonly placeholder?: string;
  readonly onInputChange: (value: string) => void;
  readonly onSearch: () => void;
  readonly onUseCurrentLocation?: () => void;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly errorMessage?: string;
  readonly inputAriaLabel?: string;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly className?: string;
};

export function LocationSearchInput({
  value,
  placeholder,
  onInputChange,
  onSearch,
  onUseCurrentLocation,
  loading = false,
  disabled = false,
  errorMessage,
  inputAriaLabel = "目的地",
  inputRef,
  className,
}: LocationSearchInputProps) {
  const handleCurrentLocationClick = onUseCurrentLocation;
  const hasCurrentLocationButton = Boolean(handleCurrentLocationClick);

  return (
    <>
      <div
        data-location-search-input="true"
        data-current-location-input-wrapper={hasCurrentLocationButton ? "true" : undefined}
        className={cn("relative min-w-0 w-full", className)}
      >
        <Input
          ref={inputRef}
          aria-label={inputAriaLabel}
          value={value}
          onChange={(event) => onInputChange(event.target.value)}
          onKeyDown={(event) => handleInputKeyDown(event, onSearch)}
          placeholder={placeholder}
          disabled={disabled}
          className={cn("h-9 bg-card text-sm", hasCurrentLocationButton && "pr-12")}
        />
        {handleCurrentLocationClick ? (
          <CurrentLocationButton
            loading={loading}
            disabled={disabled || loading}
            onClick={handleCurrentLocationClick}
          />
        ) : null}
      </div>
      {errorMessage ? (
        <p role="alert" className="text-xs leading-5 text-danger">
          {errorMessage}
        </p>
      ) : null}
    </>
  );
}

export function CurrentLocationButton({
  loading = false,
  disabled = false,
  onClick,
}: {
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-current-location-button="true"
      data-current-location-loading={loading ? "true" : undefined}
      aria-label="使用当前位置"
      aria-busy={loading ? "true" : undefined}
      title="使用当前位置"
      className={cn(
        "absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-transparent text-primary transition hover:bg-secondary hover:text-[var(--primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent",
        loading && "bg-secondary text-primary",
      )}
      disabled={disabled}
      onClick={onClick}
    >
      {loading ? <CurrentLocationSpinner /> : <CurrentLocationIcon />}
    </button>
  );
}

function handleInputKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  onSearch: () => void,
): void {
  const nativeEvent = event.nativeEvent as { readonly isComposing?: boolean };
  if (event.key !== "Enter" || nativeEvent.isComposing) {
    return;
  }

  event.preventDefault();
  onSearch();
}

function CurrentLocationIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="3.25" />
      <path d="M12 2.75v3.5M12 17.75v3.5M2.75 12h3.5M17.75 12h3.5" />
      <circle cx="12" cy="12" r="8.25" />
    </svg>
  );
}

function CurrentLocationSpinner() {
  return (
    <span
      aria-hidden="true"
      data-current-location-spinner="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary"
    />
  );
}
