import { prisma } from "@/lib/prisma";
import CompaniesClient from "./CompaniesClient";

export const dynamic = "force-dynamic";

const PAGE = 20;

type SP = { q?: string; nature?: string; batch?: string; open?: string; page?: string };

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
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);

  const [batches, natures] = await Promise.all([
    prisma.company.findMany({ distinct: ["batch"], select: { batch: true }, where: { batch: { not: null } } }),
    prisma.company.findMany({ distinct: ["nature"], select: { nature: true }, where: { nature: { not: null } } }),
  ]);

  const where: any = {};
  if (nature) where.nature = nature;
  if (batch) where.batch = batch;
  if (q)
    where.OR = [
      { name: { contains: q } },
      { industry: { contains: q } },
      { location: { contains: q } },
      { batch: { contains: q } },
    ];

  const total = await prisma.company.count({ where });
  const companies = await prisma.company.findMany({
    where,
    orderBy: { updateDate: "desc" },
    skip: (page - 1) * PAGE,
    take: PAGE,
  });
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const openCompany = openId
    ? await prisma.company.findUnique({ where: { id: openId } })
    : null;

  // 当前用户收藏的公司 id 集合（驱动「★ 收藏」按钮状态）
  const demoUser = await prisma.user.findFirst();
  const favIds = new Set(
    demoUser
      ? (await prisma.favorite.findMany({ where: { userId: demoUser.id }, select: { companyId: true } })).map(
          (f) => f.companyId
        )
      : []
  );

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
      total={total}
      totalAll={await prisma.company.count()}
      page={page}
      pages={pages}
      q={q}
      nature={nature}
      batch={batch}
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
