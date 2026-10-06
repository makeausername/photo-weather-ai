import { PublicShell } from "../components/public-shell";

export default function PublicRouteLoading() {
  return (
    <PublicShell contentClassName="min-h-[60vh]">
      <p
        role="status"
        aria-busy="true"
        className="mx-auto max-w-4xl py-4 text-sm text-muted-foreground"
      >
        正在打开页面…
      </p>
    </PublicShell>
  );
}
