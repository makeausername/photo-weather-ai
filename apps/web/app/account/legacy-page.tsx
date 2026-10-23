import type { Metadata } from "next";
import { PublicShell } from "../../components/public-shell";
import { AccountCenterClient } from "./account-center-client";

export const metadata: Metadata = {
  title: "账户中心 - 逐光天气",
};

type AccountPageProps = {
  readonly searchParams?: {
    readonly orderNo?: string | string[];
    readonly out_trade_no?: string | string[];
    readonly payment_return?: string | string[];
  };
};

function firstSearchParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }
  return value ?? "";
}

export default function AccountPage({ searchParams }: AccountPageProps) {
  const orderNo =
    firstSearchParam(searchParams?.orderNo) || firstSearchParam(searchParams?.out_trade_no);

  return (
    <PublicShell contentClassName="grid gap-8 pb-16">
      <header className="border-b border-border pb-7">
        <p className="text-xs font-bold tracking-[0.12em] text-primary">账户</p>
        <h1 className="mt-3 text-[34px] font-bold leading-tight tracking-[-0.03em] text-foreground sm:text-[42px]">
          账户中心
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-[15px]">
          管理账户资料、登录安全、绑定方式和查询历史。
        </p>
      </header>

      <AccountCenterClient
        paymentReturn={firstSearchParam(searchParams?.payment_return)}
        paymentReturnOrderNo={orderNo}
      />
    </PublicShell>
  );
}
