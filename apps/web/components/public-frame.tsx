"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PublicHeader } from "./public-header";
import { SiteFooter } from "./site-footer";

const PublicFrameContext = createContext(false);
export const usePublicFrame = () => useContext(PublicFrameContext);

/** Keep navigation and account state mounted across public route transitions. */
export function PublicFrame({ children }: { readonly children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return children;
  return (
    <PublicFrameContext.Provider value={true}>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <PublicHeader />
        <div className="min-w-0 flex-1">{children}</div>
        <SiteFooter />
      </div>
    </PublicFrameContext.Provider>
  );
}
