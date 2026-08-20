import { prisma } from "@/lib/prisma";
import LibraryClient from "./LibraryClient";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const evidence = await prisma.evidence.findMany();

  // 收藏（公司招聘库「★ 收藏」的来源）
  const favs = await prisma.favorite.findMany({
    orderBy: { createdAt: "desc" },
    include: { company: true },
  });

  return (
    <LibraryClient
      evidence={evidence.map((e) => ({
        id: e.id,
        fact: e.fact,
        experience: e.experience,
        sourceFile: e.sourceFile,
        confirmed: e.confirmed,
        writable: e.writable,
        defenseLevel: e.defenseLevel,
        metricOk: e.metricOk,
        contributionOk: e.contributionOk,
        risk: e.risk,
      }))}
      favorites={favs
        .filter((f) => f.company)
        .map((f) => ({
          id: f.id,
          companyId: f.companyId,
          companyName: f.company!.name,
          nature: f.company!.nature,
          batch: f.company!.batch,
          location: f.company!.location,
          positions: f.company!.positions,
        }))}
    />
  );
}
