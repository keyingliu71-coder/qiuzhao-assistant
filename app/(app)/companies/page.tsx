import { prisma } from "@/lib/prisma";
import CompaniesClient from "./CompaniesClient";

export const dynamic = "force-dynamic";

type SP = { q?: string; nature?: string; batch?: string; open?: string; recent?: string };

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const nature = (sp.nature || "").trim();
  const batch = (sp.batch || "").trim();
  const openId = (sp.open || "").trim();
  const recentOnly = sp.recent === "1";

  // 招聘库默认不展示「个人投递」性质的公司（数据铁律：公共岗位 ≠ 个人投递）。
  // 仅当用户主动筛选 nature=个人投递 时才显示（配合「🧹 清理个人投递」按钮）。
  const where =
    nature !== "" ? { nature } : { nature: { not: "个人投递" } };

  // 全量一次拉取，搜索/筛选/分页交给客户端内存完成：
  //  - 修复 offset 翻页因 updateDate 相同导致的重复/跳漏
  //  - 搜索、翻页不再整页 GET（避免 Vercel 冷启动超时丢界面）
  const [batches, natures, companies, totalAll, demoUser] = await Promise.all([
    prisma.company.findMany({ distinct: ["batch"], select: { batch: true }, where: { batch: { not: null } } }),
    prisma.company.findMany({ distinct: ["nature"], select: { nature: true }, where: { nature: { not: null } } }),
    prisma.company.findMany({ where, orderBy: [{ updateDate: "desc" }, { name: "asc" }] }),
    prisma.company.count({ where }),
    prisma.user.findFirst(),
  ]);

  const favIds = new Set(
    demoUser
      ? (await prisma.favorite.findMany({ where: { userId: demoUser.id }, select: { companyId: true } })).map(
          (f) => f.companyId
        )
      : []
  );

  const openCompany = openId
    ? companies.find((c) => c.id === openId) ?? null
    : null;

  return (
    <CompaniesClient
      companies={companies.map((c) => ({
        id: c.id,
        name: c.name,
        nature: c.nature,
        industry: c.industry,
        batch: c.batch,
        target: c.target,
        location: c.location,
        positions: c.positions,
        updateDate: c.updateDate,
        deadline: c.deadline,
        applyLink: c.applyLink,
        hasWrittenTest: c.hasWrittenTest,
        favorited: favIds.has(c.id),
      }))}
      batches={batches.map((b) => b.batch as string).filter(Boolean)}
      natures={natures.map((n) => n.nature as string).filter(Boolean)}
      totalAll={totalAll}
      recentOnly={recentOnly}
      openCompany={
        openCompany
          ? {
              id: openCompany.id,
              name: openCompany.name,
              nature: openCompany.nature,
              industry: openCompany.industry,
              batch: openCompany.batch,
              target: openCompany.target,
              location: openCompany.location,
              positions: openCompany.positions,
              updateDate: openCompany.updateDate,
              deadline: openCompany.deadline,
              applyLink: openCompany.applyLink,
              hasWrittenTest: openCompany.hasWrittenTest,
              favorited: favIds.has(openCompany.id),
            }
          : null
      }
    />
  );
}