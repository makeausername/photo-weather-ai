import { notFound, redirect } from "next/navigation";
import { AdminPreviewClient } from "../preview-client";
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };
const sections = [
  "",
  "providers/weather",
  "providers/geo",
  "settings",
  "audit",
  "calibration",
] as const;
export default async function AdminPreviewPage({
  params,
}: {
  readonly params: Promise<{ section?: string[] }>;
}) {
  if (process.env.NODE_ENV !== "development" || process.env.LOCAL_ADMIN_PREVIEW !== "true")
    notFound();
  const section = (await params).section?.join("/") ?? "";
  if (["locations", "history", "history/settings"].includes(section)) redirect("/admin-preview");
  if (!sections.some((item) => item === section)) notFound();
  return <AdminPreviewClient section={section as (typeof sections)[number]} />;
}
