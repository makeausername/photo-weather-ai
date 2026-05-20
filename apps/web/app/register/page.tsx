import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card } from "../../components/ui";
import { PublicShell } from "../../components/public-shell";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "创建账户 - 逐光天气",
};

export default function RegisterPage() {
  return (
    <PublicShell contentClassName="pb-14">
      <section className="grid gap-8 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-7">
          <Badge variant="muted">账户</Badge>
          <h1 className="mt-5 max-w-[760px] text-[30px] font-bold leading-[1.16] text-foreground sm:text-[36px] lg:text-[40px]">
            创建逐光天气账户
          </h1>
          <p className="mt-4 max-w-[760px] text-[15px] leading-7 text-muted-foreground sm:text-base sm:leading-8">
            用于保存拍摄天气查询记录、收藏机位和后续报告管理。
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {["邮箱密码登录", "保存查询记录", "收藏常用机位", "管理后续报告"].map((item) => (
              <Card key={item} className="px-4 py-3">
                <p className="text-sm font-semibold text-card-foreground">{item}</p>
              </Card>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
            >
              已有账户，去登录
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
          <RegisterForm />
        </div>
      </section>
    </PublicShell>
  );
}
