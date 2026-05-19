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
    <PublicShell>
      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.7fr)] lg:items-start">
        <div className="min-w-0">
          <Badge variant="muted">模块准备中</Badge>
          <h1 className="mt-5 text-3xl font-bold tracking-normal text-foreground sm:text-4xl">
            {title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground">{description}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/#analysis"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:brightness-95"
            >
              先使用拍摄分析
            </Link>
            <Link
              href="/"
              className="inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:border-primary hover:bg-secondary"
            >
              返回首页
            </Link>
          </div>
        </div>

        <Card className="p-5 shadow-soft">
          <h2 className="text-lg font-bold text-card-foreground">后续将提供</h2>
          <div className="mt-4 grid gap-3">
            {highlights.map((item) => (
              <div key={item} className="rounded-lg border border-border bg-muted p-3">
                <p className="text-sm leading-6 text-muted-foreground">{item}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </PublicShell>
  );
}
