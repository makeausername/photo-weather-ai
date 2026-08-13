"use client";

import Link from "next/link";
import { useEffect } from "react";
import { PublicShell } from "../components/public-shell";
import { Button } from "../components/ui";

export default function PublicErrorPage({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PublicShell contentClassName="grid gap-6 pb-14">
      <main className="grid min-w-0 max-w-full place-items-center gap-4 py-16 text-center">
        <p className="text-xs font-bold text-danger">出错了</p>
        <h1 className="text-2xl font-bold tracking-normal text-foreground sm:text-[28px]">
          页面加载失败
        </h1>
        <p className="max-w-md text-sm leading-6 text-muted-foreground">
          天气或页面数据暂时没有加载成功，可以重试一次，或稍后再来。
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" variant="primary" onClick={reset}>
            重试
          </Button>
          <Link href="/">
            <Button type="button" variant="secondary">
              返回首页
            </Button>
          </Link>
        </div>
      </main>
    </PublicShell>
  );
}
