"use client";

import { useEffect, useState } from "react";
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
    <div className="adminSessionBadge">
      <span>{user?.displayName || user?.email || "Admin"}</span>
      <button type="button" onClick={() => void logoutAdmin()}>
        Logout
      </button>
    </div>
  );
}
