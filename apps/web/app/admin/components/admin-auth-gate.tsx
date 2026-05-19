"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { getCurrentAdmin, getStoredAdminTokens } from "../admin-api";

type AdminAuthGateProps = {
  readonly children: ReactNode;
};

export function AdminAuthGate({ children }: AdminAuthGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [checked, setChecked] = useState(pathname === "/admin/login");

  useEffect(() => {
    if (pathname === "/admin/login") {
      setChecked(true);
      return;
    }

    setChecked(false);
    const tokens = getStoredAdminTokens();
    if (!tokens) {
      router.replace(`/admin/login?returnTo=${encodeURIComponent(pathname)}`);
      return;
    }

    let cancelled = false;
    getCurrentAdmin()
      .then((session) => {
        if (cancelled) {
          return;
        }

        if (!session.permissions.includes("admin.manage")) {
          router.replace("/admin/login");
          return;
        }

        setChecked(true);
      })
      .catch(() => {
        if (!cancelled) {
          router.replace(`/admin/login?returnTo=${encodeURIComponent(pathname)}`);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!checked) {
    return <main className="adminAuthLoading">正在检查后台登录状态...</main>;
  }

  return children;
}
