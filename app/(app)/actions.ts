export async function setSatisfaction(appId: string, value: string) {
  await prisma.application.update({ where: { id: appId }, data: { satisfaction: value } });
  revalidatePath("/board");
}

// 子状态（流程细分口径：流程前期[测评/AI面·笔试] / 流程后期[一面·二面·三面] / 结束[Offer·拒]）
export async function setSubState(appId: string, subState: string, subTone: string) {
  await prisma.application.update({ where: { id: appId }, data: { subState, subTone } });
  revalidatePath("/board");
  revalidatePath("/dashboard");
}