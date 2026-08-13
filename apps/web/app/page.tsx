import { HomepageDiscoverySection } from "../components/homepage-discovery";
import { HomepageWorkbench } from "../components/homepage-workbench";
import { PublicShell } from "../components/public-shell";
import { Badge } from "../components/ui";

export default function HomePage() {
  return (
    <PublicShell contentClassName="grid gap-6 pb-14">
      <header className="border-b border-border pb-5">
        <div className="max-w-4xl">
          <Badge variant="default">风光摄影出行判断工具</Badge>
          <h1 className="mt-3 text-[32px] font-bold leading-tight tracking-normal text-foreground sm:text-[36px]">
            逐光天气
          </h1>
          <p className="mt-3 text-[15px] leading-7 text-muted-foreground sm:text-base">
            输入拍摄地点后，生成出行判断、最佳窗口、优先题材和主要风险。
          </p>
        </div>
      </header>

      <HomepageWorkbench />

      <HomepageDiscoverySection />
    </PublicShell>
  );
}
