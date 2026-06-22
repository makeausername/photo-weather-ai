import type { Metadata } from "next";
import { PublicAuthLayout } from "../../components/public-auth";
import { PublicShell } from "../../components/public-shell";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "创建账户 - 逐光天气",
};

export default function RegisterPage() {
  return (
    <PublicShell contentClassName="pb-10 sm:pb-12">
      <PublicAuthLayout size="wide">
        <RegisterForm />
      </PublicAuthLayout>
    </PublicShell>
  );
}
