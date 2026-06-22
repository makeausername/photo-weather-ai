import type { Metadata } from "next";
import { PublicAuthLayout } from "../../components/public-auth";
import { PublicShell } from "../../components/public-shell";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "用户登录 - 逐光天气",
};

type LoginPageProps = {
  readonly searchParams?: {
    readonly registered?: string;
    readonly identifier?: string;
    readonly email?: string;
  };
};

export default function LoginPage({ searchParams }: LoginPageProps) {
  const registered = searchParams?.registered === "1";
  const initialIdentifier = searchParams?.identifier ?? searchParams?.email ?? "";

  return (
    <PublicShell contentClassName="pb-10 sm:pb-12">
      <PublicAuthLayout>
        <LoginForm initialIdentifier={initialIdentifier} registered={registered} />
      </PublicAuthLayout>
    </PublicShell>
  );
}
