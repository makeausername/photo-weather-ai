import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card } from "../../components/ui";
import { PublicShell } from "../../components/public-shell";

export const metadata: Metadata = {
  title: "用户登录 - 逐光天气",
};

export default function LoginPage() {
  return (
    <PublicShell>
      <section className="mx-auto grid max-w-3xl gap-5">
        <div>
          <Badge variant="muted">功能准备中</Badge>
          <h1 className="mt-5 text-3xl font-bold tracking-normal text-foreground sm:text-4xl">
            用户登录
          </h1>
          <p className="mt-4 text-base leading-8 text-muted-foreground">
            用户登录功能将在后续接入，用于查询历史、收藏机位、套餐权益和报告管理。
          </p>
        </div>

        <Card className="p-5 shadow-soft">
          <h2 className="text-lg font-bold text-card-foreground">当前可用功能</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            现在可以直接在首页选择地点、预报范围和分析目标，查看本地样例数据生成的拍摄天气分析。公开账号、历史记录和权益管理将在后续阶段上线。
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/#analysis"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
            >
              开始分析
            </Link>
            <Link
              href="/"
              className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:border-primary hover:bg-secondary"
            >
              返回首页
            </Link>
          </div>
        </Card>
      </section>
    </PublicShell>
  );
}
