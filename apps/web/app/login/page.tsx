import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card } from "../../components/ui";
import { PublicShell } from "../../components/public-shell";

export const metadata: Metadata = {
  title: "用户登录 - 逐光天气",
};

export default function LoginPage() {
  return (
    <PublicShell contentClassName="pb-14">
      <section className="grid gap-8 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-7">
          <Badge variant="muted">功能准备中</Badge>
          <h1 className="mt-5 max-w-[760px] text-[30px] font-bold leading-[1.16] text-foreground sm:text-[36px] lg:text-[40px]">
            用户登录
          </h1>
          <p className="mt-4 max-w-[760px] text-[15px] leading-7 text-muted-foreground sm:text-base sm:leading-8">
            公开用户登录将在后续接入，用于查询历史、收藏机位、套餐权益和报告管理。当前阶段仍可直接使用首页的本地模拟分析流程。
          </p>
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

        <Card className="lg:col-span-5">
          <div className="border-b border-border p-5 sm:p-6">
            <p className="text-sm font-semibold text-primary">当前可用功能</p>
            <h2 className="mt-2 text-xl font-bold text-card-foreground">无需账号即可体验</h2>
          </div>
          <div className="grid gap-3 p-5 sm:p-6">
            {["选择地点与机位", "切换预报范围", "查看本地模拟拍摄判断"].map((item) => (
              <div key={item} className="rounded-lg border border-border bg-muted px-4 py-3">
                <p className="text-sm font-semibold text-card-foreground">{item}</p>
              </div>
            ))}
            <p className="text-xs leading-5 text-muted-foreground">
              公开账号、历史记录和权益管理将在后续阶段上线；本页面不包含真实登录逻辑。
            </p>
          </div>
        </Card>
      </section>
    </PublicShell>
  );
}
