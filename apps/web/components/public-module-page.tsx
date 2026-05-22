import Link from "next/link";
import { Badge, Card } from "./ui";
import { PublicShell } from "./public-shell";

type PublicModulePageProps = {
  readonly title: string;
  readonly description: string;
  readonly highlights: readonly string[];
};

export function PublicModulePage({ title, description, highlights }: PublicModulePageProps) {
  return (
    <PublicShell contentClassName="pb-14">
      <section className="grid gap-8 lg:grid-cols-12 lg:items-start">
        <div className="min-w-0 lg:col-span-7">
          <Badge variant="muted">即将开放</Badge>
          <h1 className="mt-5 max-w-[760px] text-[30px] font-bold leading-[1.16] tracking-normal text-foreground sm:text-[36px] lg:text-[40px]">
            {title}
          </h1>
          <p className="mt-4 max-w-[760px] text-[15px] leading-7 text-muted-foreground sm:text-base sm:leading-8">
            {description}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/#analysis"
              className="inline-flex h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-[var(--primary-hover)]"
            >
              先使用拍摄分析
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
            <p className="text-sm font-semibold text-primary">即将开放</p>
            <h2 className="mt-2 text-xl font-bold text-card-foreground">清晰的题材判断视图</h2>
          </div>
          <div className="grid gap-3 p-5 sm:p-6">
            {highlights.map((item, index) => (
              <div key={item} className="grid gap-2 rounded-lg border border-border bg-muted p-4">
                <span className="text-xs font-bold text-primary">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="text-sm leading-6 text-muted-foreground">{item}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </PublicShell>
  );
}
