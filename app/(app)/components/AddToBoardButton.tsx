"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addToBoard } from "@/app/(app)/actions";

export default function AddToBoardButton({
  companyId,
  jobTitle,
  className = "btn primary sm",
  label = "加入待投递",
}: {
  companyId?: string | null;
  jobTitle: string;
  className?: string;
  label?: string;
}) {
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "dup" | "err">("idle");
  const router = useRouter();

  async function onClick() {
    if (status === "pending" || status === "done") return;
    setStatus("pending");
    try {
      const r = await addToBoard({ companyId, jobTitle });
      if (r?.ok) {
        setStatus("done");
        router.refresh(); // 让当前页与看板数据刷新
      } else if (r?.msg === "已在看板中") {
        setStatus("dup");
      } else {
        setStatus("err");
      }
    } catch {
      setStatus("err");
    }
  }

  if (status === "done")
    return (
      <span className="btn sm" style={{ color: "var(--sage)", borderColor: "var(--sage)" }}>
        ✓ 已加入 · <a href="/board" style={{ color: "var(--sage)", fontWeight: 600 }}>去看板 →</a>
      </span>
    );
  if (status === "dup")
    return (
      <span className="btn sm" style={{ color: "var(--muted)" }}>
        已在看板中
      </span>
    );
  if (status === "err")
    return (
      <button className="btn sm" style={{ color: "var(--rose)", borderColor: "var(--rose)" }} onClick={onClick}>
        加入失败，重试
      </button>
    );

  return (
    <button className={className} onClick={onClick} disabled={status === "pending"}>
      {status === "pending" ? "加入中…" : label}
    </button>
  );
}
