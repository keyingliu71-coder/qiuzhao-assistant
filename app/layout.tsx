import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "秋招陪跑助手",
  description: "发现公司招聘 · 查看岗位 · 加入待投递 · 投递看板 · 面试准备与复盘",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
