import type { Metadata } from "next";
import { PublicAuthLayout } from "../../components/public-auth";
import { PublicShell } from "../../components/public-shell";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "创建账户 - 逐光天气",
};

type RegisterPageProps = {
  readonly searchParams?: {
    readonly returnTo?: string;
  };
};

export default function RegisterPage({ searchParams }: RegisterPageProps) {
  return (
    <PublicShell contentClassName="pb-10 sm:pb-12">
      <PublicAuthLayout size="wide">
        <RegisterForm returnTo={searchParams?.returnTo} />
      </PublicAuthLayout>
    </PublicShell>
  );
}
