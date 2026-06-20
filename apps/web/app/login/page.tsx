import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "../../components/ui";
import { PublicShell } from "../../components/public-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "用户登录 - 逐光天气",
};

type LoginPageProps = {
  readonly searchParams?: {
    readonly registered?: string;
    readonly identifier?: string;
    readonly email?: string;
  };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const registered = searchParams?.registered === "1";
  const initialIdentifier = searchParams?.identifier ?? searchParams?.email ?? "";

  return (
    <PublicShell contentClassName="pb-14">
      <section className="grid gap-8 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-7">
          <Badge variant="muted">账户</Badge>
          <h1 className="mt-5 max-w-[760px] text-[30px] font-bold leading-[1.16] text-foreground sm:text-[36px] lg:text-[40px]">
            登录逐光天气
          </h1>
          <p className="mt-4 max-w-[760px] text-[15px] leading-7 text-muted-foreground sm:text-base sm:leading-8">
            使用邮箱或手机号登录账户中心，管理资料、安全信息和后台权限入口。
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {["邮箱登录", "手机号登录", "账户中心", "管理员入口"].map((item) => (
              <Badge key={item} variant="muted">
                {item}
              </Badge>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/#analysis"
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
            >
              开始分析
            </Link>
            <Link
              href="/"
              className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:border-primary hover:bg-secondary"
            >
              返回首页
            </Link>
          </div>
        </div>

        <div className="lg:col-span-5">
          <LoginForm initialIdentifier={initialIdentifier} registered={registered} />
        </div>
      </section>
    </PublicShell>
  );
}
