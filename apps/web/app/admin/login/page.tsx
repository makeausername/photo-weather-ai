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
    setStatus("Signing in...");

    try {
      const session = await loginAdmin(email, password);
      if (!session.permissions.includes("admin.manage")) {
        clearAdminSession();
        setStatus("This account does not have admin console access.");
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
          <p className="eyebrow">Admin login</p>
          <h1>Photo Weather AI</h1>
          <p>
            Sign in with the first super admin account created by the deployment bootstrap script.
          </p>
        </div>
        <label className="fieldLabel">
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="fieldLabel">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <div className="adminActions">
          <button type="submit">Login</button>
        </div>
        {status ? <div className="adminInlineStatus">{status}</div> : null}
      </form>
    </main>
  );
}
