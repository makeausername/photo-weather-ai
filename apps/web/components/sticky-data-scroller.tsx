"use client";

import React, { useEffect, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { ResponsiveDataScroller } from "./ui";

type HeaderPosition = {
  left: number;
  top: number;
  width: number;
  tableWidth: number;
  columns: number[];
};

/** Page scrolling and horizontal table scrolling have different scroll parents.
 * Mirror only the header at the viewport edge; the original remains the accessible table header.
 */
export function StickyDataScroller({ children }: { readonly children: ReactElement }) {
  const root = useRef<HTMLDivElement>(null);
  const floating = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<HeaderPosition | null>(null);
  useEffect(() => {
    const wrapper = root.current;
    const scroller = wrapper?.querySelector<HTMLElement>("[data-responsive-data-scroller]");
    const table = scroller?.querySelector("table");
    const head = table?.querySelector("thead");
    if (!wrapper || !scroller || !table || !head) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!table.getClientRects().length) {
        setPosition(null);
        return;
      }
      const tabs = wrapper
        .closest("[data-result-view-tabs]")
        ?.querySelector("[data-result-view-tab-list]")?.parentElement;
      const top = tabs ? Math.max(0, tabs.getBoundingClientRect().bottom) : 76;
      const rect = table.getBoundingClientRect();
      const header = head.getBoundingClientRect();
      const bounds = scroller.getBoundingClientRect();
      const visible = header.top < top && rect.bottom > top + header.height;
      setPosition(
        visible
          ? {
              left: Math.max(bounds.left, rect.left),
              top,
              width:
                Math.min(bounds.left + scroller.clientWidth, rect.right) -
                Math.max(bounds.left, rect.left),
              tableWidth: rect.width,
              columns: Array.from(head.querySelectorAll("th")).map(
                (cell) => cell.getBoundingClientRect().width,
              ),
            }
          : null,
      );
      if (floating.current) floating.current.scrollLeft = scroller.scrollLeft;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(table);
    observer.observe(scroller);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    scroller.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      scroller.removeEventListener("scroll", schedule);
    };
  }, [children]);
  useEffect(() => {
    const scroller = root.current?.querySelector<HTMLElement>("[data-responsive-data-scroller]");
    if (floating.current && scroller) floating.current.scrollLeft = scroller.scrollLeft;
  }, [position]);
  const header = React.Children.toArray(children.props.children).find(
    (child) => React.isValidElement(child) && child.type === "thead",
  );
  return (
    <div ref={root} className="min-w-0" data-sticky-data-table="true">
      <ResponsiveDataScroller bare data-cloud-sea-professional-table-scroll="true">
        {children}
      </ResponsiveDataScroller>
      {position &&
        createPortal(
          <div
            ref={floating}
            aria-hidden="true"
            data-floating-table-header="true"
            className="pointer-events-none fixed z-20 overflow-hidden border-b border-border bg-muted shadow-sm"
            style={{ left: position.left, top: position.top, width: position.width }}
          >
            <table
              className={children.props.className}
              style={{
                width: position.tableWidth,
                minWidth: position.tableWidth,
                maxWidth: "none",
                tableLayout: "fixed",
                margin: 0,
              }}
            >
              <colgroup>
                {position.columns.map((width, index) => (
                  <col key={index} style={{ width, display: width === 0 ? "none" : undefined }} />
                ))}
              </colgroup>
              {header}
            </table>
          </div>,
          document.body,
        )}
    </div>
  );
}
