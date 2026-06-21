import type { Metadata } from "next";
import { AuthProductPanel, PublicAuthLayout } from "../../components/public-auth";
import { PublicShell } from "../../components/public-shell";
import { registerAuthTrustItems, registerAuthWorkflowItems } from "./auth-content";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "创建账户 - 逐光天气",
};

export default function RegisterPage() {
  return (
    <PublicShell contentClassName="pb-10 sm:pb-12">
      <PublicAuthLayout
        productPanel={
          <AuthProductPanel
            eyebrow="创建逐光天气账户"
            title="完成验证，开始管理你的摄影出行记录"
            description="用邮箱或手机号创建账户，后续可保存查询历史、查看订单权益，并维护安全验证方式。"
            trustItems={registerAuthTrustItems}
            workflowItems={registerAuthWorkflowItems}
          />
        }
      >
        <div className="w-full">
          <RegisterForm />
        </div>
      </PublicAuthLayout>
    </PublicShell>
  );
}
