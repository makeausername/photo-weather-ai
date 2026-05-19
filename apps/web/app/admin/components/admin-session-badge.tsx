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
    <div className="flex flex-wrap items-center gap-1.5">
      <div className="max-w-44 truncate text-xs text-muted-foreground">
        <span className="mr-1">管理员</span>
        <span className="font-medium text-foreground">
          {user?.displayName || user?.email || "管理员"}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs font-medium"
        onClick={() => void logoutAdmin()}
      >
        退出
      </Button>
    </div>
  );
}
