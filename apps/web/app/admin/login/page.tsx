"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState } from "react";
import { clearAdminSession, loginAdmin } from "../admin-api";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("正在登录...");

    try {
      const session = await loginAdmin(email, password);
      if (!session.permissions.includes("admin.manage")) {
        clearAdminSession();
        setStatus("当前账号没有后台访问权限。");
        return;
      }

      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      router.replace(returnTo?.startsWith("/admin") ? returnTo : "/admin");
    } catch (error) {
      setStatus((error as Error).message);
    }
  }

  return (
    <main className="adminLoginShell">
      <form className="adminLoginForm" onSubmit={(event) => void handleSubmit(event)}>
        <div>
          <p className="eyebrow">后台登录</p>
          <h1>风光天气 AI</h1>
          <p>请使用部署初始化脚本创建的超级管理员账号登录。</p>
        </div>
        <label className="fieldLabel">
          邮箱
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="fieldLabel">
          密码
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <div className="adminActions">
          <button type="submit">登录</button>
        </div>
        {status ? <div className="adminInlineStatus">{status}</div> : null}
      </form>
    </main>
  );
}
