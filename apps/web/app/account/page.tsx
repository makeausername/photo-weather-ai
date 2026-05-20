import type { Metadata } from "next";
import { PublicShell } from "../../components/public-shell";
import { AccountCenterClient } from "./account-center-client";

export const metadata: Metadata = {
  title: "账户中心 - 逐光天气",
};

export default function AccountPage() {
  return (
    <PublicShell contentClassName="grid gap-6 pb-14">
      <header className="border-b border-border pb-5">
        <p className="text-sm font-semibold text-primary">账户</p>
        <h1 className="mt-3 text-[30px] font-bold leading-tight tracking-normal text-foreground sm:text-[36px]">
          账户中心
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
          用于查看查询历史、收藏机位、套餐权益和报告管理。完整用户系统将在后续接入。
        </p>
      </header>

      <AccountCenterClient />
    </PublicShell>
  );
}
