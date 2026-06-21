import type { Metadata } from "next";
import { AuthProductPanel, PublicAuthLayout } from "../../components/public-auth";
import { PublicShell } from "../../components/public-shell";
import { loginAuthTrustItems, loginAuthWorkflowItems } from "./auth-content";
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
      <PublicAuthLayout
        productPanel={
          <AuthProductPanel
            eyebrow="逐光天气账户"
            title="登录逐光天气"
            description="面向风光摄影出行判断的账户系统，帮助你保存查询记录、管理权益和维护账户安全。"
            trustItems={loginAuthTrustItems}
            workflowItems={loginAuthWorkflowItems}
          />
        }
      >
        <div className="w-full">
          <LoginForm initialIdentifier={initialIdentifier} registered={registered} />
        </div>
      </PublicAuthLayout>
    </PublicShell>
  );
}
