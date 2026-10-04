import { HomepageWorkbench } from "../components/homepage-workbench";
import { PublicShell } from "../components/public-shell";

export default function HomePage() {
  return (
    <PublicShell contentClassName="grid gap-6 pb-10">
      <HomepageWorkbench />
    </PublicShell>
  );
}
