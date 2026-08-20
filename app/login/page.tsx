"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        router.push("/dashboard");
      } else {
        setError("账号或密码不正确");
        setLoading(false);
      }
    } catch {
      setError("登录失败，请重试");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
      }}
    >
      <div className="panel" style={{ width: 360, textAlign: "center" }}>
        <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>
          秋招陪跑助手
        </div>
        <div className="hint" style={{ marginBottom: 22 }}>
          发现公司招聘 · 投递管理 · 面试陪跑
        </div>
        <form onSubmit={doLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="账号"
            autoComplete="username"
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line2)", background: "var(--paper)" }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            autoComplete="current-password"
            style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid var(--line2)", background: "var(--paper)" }}
          />
          {error && <div className="hint" style={{ color: "var(--dang)", fontSize: 12 }}>{error}</div>}
          <button className="btn primary" type="submit" disabled={loading} style={{ width: "100%", padding: "10px" }}>
            {loading ? "登录中…" : "登录 →"}
          </button>
        </form>
      </div>
    </div>
  );
}