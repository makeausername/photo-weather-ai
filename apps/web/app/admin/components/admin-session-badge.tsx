"use client";

import { useEffect, useState } from "react";
import { Button } from "../../../components/ui";
import { getCurrentAdmin, logoutAdmin } from "../admin-api";
import type { SafeAdminUser } from "../admin-api";

export function AdminSessionBadge() {
  const [user, setUser] = useState<SafeAdminUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    getCurrentAdmin()
      .then((session) => {
        if (!cancelled) {
          setUser(session.user);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white px-3 py-2 shadow-sm">
      <div className="grid leading-tight">
        <span className="text-xs text-muted">当前管理员</span>
        <span className="max-w-48 truncate text-sm font-semibold text-foreground">
          {user?.displayName || user?.email || "管理员"}
        </span>
      </div>
      <Button variant="secondary" size="sm" onClick={() => void logoutAdmin()}>
        退出登录
      </Button>
    </div>
  );
}
