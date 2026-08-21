import { prisma } from "@/lib/prisma";
import { STAGE_NAMES } from "@/lib/constants";
import BoardClient from "./BoardClient";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const apps = await prisma.application.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      todos: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
      company: true,
      job: true,
    },
  });

  const evidence = await prisma.evidence.findMany();

  const data = apps.map((a) => ({
    id: a.id,
    jobTitle: a.jobTitle,
    companyId: a.companyId,
    companyName: a.company?.name ?? "",
    location: a.company?.location ?? a.job?.location ?? "",
    stage: a.stage,
    stageName: a.stageName,
    subState: a.subState,
    subTone: a.subTone,
    priority: a.priority,
    satisfaction: a.satisfaction,
    nextTodo: a.nextTodo,
    riskNote: a.riskNote,
    createdAt: a.createdAt.toISOString(),
    todos: a.todos.map((t) => ({ id: t.id, text: t.text, done: t.done })),
    events: a.events.map((e) => ({
      id: e.id,
      type: e.type,
      fromStage: e.fromStage,
      toStage: e.toStage,
      note: e.note,
      createdAt: e.createdAt.toISOString(),
    })),
  }));

  return (
    <>
      <div className="page" style={{ marginBottom: 14 }}>
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <h1 className="pagetitle" style={{ margin: 0 }}>
            投递看板
          </h1>
          <span style={{ flex: 1 }}></span>
          <span className="realdata-tag">● 真实数据</span>
        </div>
      </div>
      <BoardClient
        apps={data}
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
      />
    </>
  );
}