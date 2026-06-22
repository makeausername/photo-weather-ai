import type { Metadata } from "next";
import { AuthProductPanel, PublicAuthLayout } from "../../components/public-auth";
import { PublicShell } from "../../components/public-shell";
import { registerAuthIntroItems, registerAuthPanelNote } from "./auth-content";
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
            eyebrow="账户"
            title="创建账户，保存你的拍摄判断"
            description="用邮箱或手机号完成验证。以后可以在账户中心查看历史记录、订单和绑定方式。"
            trustItems={registerAuthIntroItems}
            noteTitle={registerAuthPanelNote.title}
            note={registerAuthPanelNote.description}
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
