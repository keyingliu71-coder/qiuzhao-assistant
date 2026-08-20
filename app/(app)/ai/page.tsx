import { prisma } from "@/lib/prisma";
import AIClient from "./AIClient";

export const dynamic = "force-dynamic";

export default async function AIPage() {
  const apps = await prisma.application.findMany({ select: { jobTitle: true } });
  const seen = new Set<string>();
  const jobs: string[] = [];
  for (const a of apps) {
    if (a.jobTitle && !seen.has(a.jobTitle)) {
      seen.add(a.jobTitle);
      jobs.push(a.jobTitle);
    }
  }
  return <AIClient jobs={jobs} />;
}
