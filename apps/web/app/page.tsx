import { HomepageWorkbench } from "../components/homepage-workbench";
import { PublicShell } from "../components/public-shell";
import { Badge } from "../components/ui";

export default function HomePage() {
  return (
    <PublicShell contentClassName="grid gap-8 pb-16 lg:gap-10">
      <header className="border-b border-border pb-7">
        <div className="max-w-4xl">
          <Badge variant="default">风光摄影天气</Badge>
          <h1 className="mt-4 text-[34px] font-bold leading-tight tracking-[-0.03em] text-foreground sm:text-[42px]">
            拍摄条件
          </h1>
          <p className="mt-4 max-w-3xl text-[15px] leading-7 text-muted-foreground sm:text-base">
            选择地点和预报范围，查看云层、光线、风、能见度与降水风险。
          </p>
        </div>
      </header>

      <HomepageWorkbench />
    </PublicShell>
  );
}
