import Link from "next/link";
import { PublicShell } from "../components/public-shell";
import { Button } from "../components/ui";

export default function PublicNotFound() {
  return (
    <PublicShell contentClassName="grid gap-6 pb-14">
      <main className="grid min-w-0 max-w-full place-items-center gap-4 py-16 text-center">
        <p className="text-xs font-bold text-primary">404</p>
        <h1 className="text-2xl font-bold tracking-normal text-foreground sm:text-[28px]">
          页面不存在
        </h1>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          你访问的页面可能已被移动或删除，回到首页继续选择拍摄地点。
        </p>
        <Link href="/">
          <Button variant="primary">返回首页</Button>
        </Link>
      </main>
    </PublicShell>
  );
}
