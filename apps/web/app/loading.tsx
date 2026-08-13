import { PublicShell } from "../components/public-shell";

export default function PublicRouteLoading() {
  return (
    <PublicShell contentClassName="grid gap-6 pb-14">
      <div
        className="grid min-w-0 max-w-full gap-5"
        data-route-loading-skeleton="true"
        aria-busy="true"
        aria-label="页面加载中"
      >
        <div className="h-9 w-64 max-w-full animate-pulse rounded-lg bg-muted" />
        <div className="grid min-w-0 max-w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-36 animate-pulse rounded-lg border border-border bg-card" />
          <div className="h-36 animate-pulse rounded-lg border border-border bg-card" />
          <div className="h-36 animate-pulse rounded-lg border border-border bg-card" />
        </div>
        <div className="grid min-w-0 max-w-full gap-2 sm:grid-cols-2">
          <div className="h-20 animate-pulse rounded-lg bg-muted" />
          <div className="h-20 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    </PublicShell>
  );
}
