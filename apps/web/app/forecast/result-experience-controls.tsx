"use client";

import * as Accordion from "@radix-ui/react-accordion";
import * as Tabs from "@radix-ui/react-tabs";
import type { ReactNode } from "react";
import { cn } from "../../components/ui";

export type ResultViewTab = {
  readonly value: string;
  readonly label: string;
  readonly eyebrow?: string;
  readonly content: ReactNode;
};

export function ResultViewTabs({
  label,
  items,
  defaultValue = items[0]?.value,
  className,
}: {
  readonly label: string;
  readonly items: readonly ResultViewTab[];
  readonly defaultValue?: string;
  readonly className?: string;
}) {
  if (!defaultValue || items.length === 0) {
    return null;
  }

  return (
    <Tabs.Root
      defaultValue={defaultValue}
      className={cn("grid min-w-0 max-w-full gap-4", className)}
      data-result-view-tabs="true"
    >
      <div className="sticky top-2 z-30 min-w-0 rounded-2xl border border-border bg-card/95 p-1.5 shadow-panel backdrop-blur">
        <Tabs.List
          aria-label={label}
          className="grid min-w-0 grid-cols-3 gap-1"
          data-result-view-tab-list="true"
        >
          {items.map((item) => (
            <Tabs.Trigger
              key={item.value}
              value={item.value}
              className="min-w-0 rounded-xl px-2 py-2.5 text-center text-xs font-semibold leading-5 text-muted-foreground outline-none transition hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-secondary data-[state=active]:text-secondary-foreground data-[state=active]:shadow-sm sm:px-4 sm:text-sm"
              data-result-view-tab={item.value}
            >
              {item.eyebrow ? (
                <span className="hidden text-[10px] font-bold tracking-[0.08em] opacity-70 min-[760px]:block">
                  {item.eyebrow}
                </span>
              ) : null}
              <span className="block truncate">{item.label}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
      </div>

      {items.map((item) => (
        <Tabs.Content
          key={item.value}
          value={item.value}
          forceMount
          className="min-w-0 max-w-full outline-none data-[state=inactive]:hidden focus-visible:ring-2 focus-visible:ring-ring"
          data-result-view-panel={item.value}
        >
          {item.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}

export type ResultDisclosureItem = {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly content: ReactNode;
};

export function ResultDisclosure({
  items,
  defaultValue = [],
  className,
}: {
  readonly items: readonly ResultDisclosureItem[];
  readonly defaultValue?: readonly string[];
  readonly className?: string;
}) {
  return (
    <Accordion.Root
      type="multiple"
      defaultValue={[...defaultValue]}
      className={cn("grid min-w-0 max-w-full gap-3", className)}
      data-result-disclosure="true"
    >
      {items.map((item) => (
        <Accordion.Item
          key={item.value}
          value={item.value}
          className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-panel"
          data-result-disclosure-item={item.value}
        >
          <Accordion.Header>
            <Accordion.Trigger className="group flex w-full min-w-0 items-center justify-between gap-4 px-4 py-4 text-left outline-none transition hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5">
              <span className="min-w-0">
                <span className="block text-sm font-bold text-card-foreground sm:text-base">
                  {item.label}
                </span>
                {item.description ? (
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    {item.description}
                  </span>
                ) : null}
              </span>
              <svg
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M3 6l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Content
            forceMount
            className="min-w-0 border-t border-border px-4 py-4 data-[state=closed]:hidden sm:px-5"
          >
            {item.content}
          </Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
