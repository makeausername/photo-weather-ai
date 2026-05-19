import type { ReactNode } from "react";
import { AdminAuthGate } from "./components/admin-auth-gate";

type AdminLayoutProps = {
  readonly children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  return <AdminAuthGate>{children}</AdminAuthGate>;
}
