"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", ico: "🏠", txt: "首页驾驶舱" },
  { href: "/companies", ico: "🏢", txt: "公司招聘库" },
  { href: "/board", ico: "📊", txt: "投递看板" },
  { href: "/library", ico: "🗂", txt: "资料库·证据库" },
  { href: "/ai", ico: "🤖", txt: "AI 工作台" },
];

export default function SidebarNav() {
  const path = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="sidebar">
      <div className="logo">
        <span className="leaf">🌿</span> 秋招陪跑助手
      </div>
      {ITEMS.map((it) => {
        const active = path === it.href || path.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className={"menu-item" + (active ? " active" : "")}
          >
            <span className="mi-ico">{it.ico}</span>
            <span className="mi-txt">{it.txt}</span>
          </Link>
        );
      })}
      <div className="side-foot">
        秋招陪跑助手
        <br />
        数据实时同步自 offerio
        <button className="logout-btn" onClick={logout}>退出登录</button>
      </div>
    </aside>
  );
}