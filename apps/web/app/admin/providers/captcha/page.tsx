import { AdminProvidersClient } from "../../components/admin-providers-client";
import { AdminShell } from "../../components/admin-shell";

export default function AdminCaptchaProvidersPage() {
  return (
    <AdminShell
      title="人机验证"
      description="管理腾讯云验证码，用于登录、注册发送验证码和账号绑定前的人机校验。"
    >
      <AdminProvidersClient providerType="captcha" />
    </AdminShell>
  );
}
