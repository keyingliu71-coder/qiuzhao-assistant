import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

type OfferioCompany = {
  id?: string;
  companyName: string;
  companyNature?: string;
  industry?: string;
  batch?: string;
  target?: string;
  location?: string;
  positions?: string;
  updateDate?: string;
  deadline?: string;
  applyLink?: string;
  hasWrittenTest?: string;
};

const STAGE_NAMES = ['待投递', '已投递未推进', '流程前期', '流程后期', '流程结束'];

async function main() {
  console.log('读取 offerio 公司数据...');
  const raw = readFileSync(join(__dirname, 'offerio.json'), 'utf-8');
  const companies: OfferioCompany[] = JSON.parse(raw);
  console.log(`共 ${companies.length} 家，开始写入 Company 表...`);

  // 清空旧数据，保证可重复执行不产生重复
  console.log('清空旧数据（保证可重跑）...');
  await prisma.applicationEvent.deleteMany({});
  await prisma.todo.deleteMany({});
  await prisma.application.deleteMany({});
  await prisma.evidence.deleteMany({});
  await prisma.job.deleteMany({});
  await prisma.company.deleteMany({});

  const BATCH = 300;
  for (let i = 0; i < companies.length; i += BATCH) {
    const slice = companies.slice(i, i + BATCH);
    await prisma.company.createMany({
      data: slice.map((c) => ({
        sourceId: c.id || null,
        name: c.companyName,
        nature: c.companyNature || null,
        industry: c.industry || null,
        batch: c.batch || null,
        target: c.target || null,
        location: c.location || null,
        positions: c.positions || null,
        updateDate: c.updateDate || null,
        deadline: c.deadline || null,
        applyLink: c.applyLink || null,
        hasWrittenTest: c.hasWrittenTest || null,
      })),
    });
    if ((i / BATCH) % 3 === 0) console.log(`  -> ${Math.min(i + BATCH, companies.length)} / ${companies.length}`);
  }

  // 用户
  const user = await prisma.user.upsert({
    where: { email: 'me@demo.com' },
    update: {},
    create: { email: 'me@demo.com', name: '刘可颖' },
  });

  // 幂等重灌个人侧数据
  await prisma.todo.deleteMany({ where: { userId: user.id } });
  await prisma.applicationEvent.deleteMany({});
  await prisma.application.deleteMany({ where: { userId: user.id } });
  await prisma.evidence.deleteMany({ where: { userId: user.id } });

  // 统一证据库（对齐原型证据表）
  const demoEvidence = [
    { fact: '主导智谱 AI 助教，3 个月获 97.2% 好评', experience: '智谱实习', sourceFile: '实习证明.pdf', confirmed: true, writable: true, defenseLevel: '高风险', metricOk: true, contributionOk: true, risk: 'AI 面被追问口径不足' },
    { fact: '搭建校园二手交易平台，DAU 1200+', experience: '独立项目', sourceFile: '作品集链接', confirmed: true, writable: true, defenseLevel: '高', metricOk: true, contributionOk: true, risk: '—' },
    { fact: '美团商业分析实习，优化活动 ROI 18%', experience: '美团实习', sourceFile: '实习证明.pdf', confirmed: false, writable: false, defenseLevel: '中', metricOk: false, contributionOk: true, risk: '指标口径需补充' },
  ];
  for (const e of demoEvidence) {
    await prisma.evidence.create({ data: { userId: user.id, ...e } });
  }

  // 看板（对齐原型 5 列 13 条）
  const findCompany = async (kw: string) =>
    (await prisma.company.findFirst({ where: { name: { contains: kw } } })) || null;

  type AppSeed = {
    kw: string; title: string; stage: number;
    subState?: string; subTone?: string; riskNote?: string;
    priority?: string; satisfaction?: string; nextTodo?: string;
    todos?: string[]; events?: { type: string; note?: string; fromStage?: number; toStage?: number }[];
  };
  const seeds: AppSeed[] = [
    { kw: '腾讯', title: '腾讯 · 产品经理（云）', stage: 0, subState: '待定制简历', subTone: 'terra', priority: '高', nextTodo: '用简历 Skill 生成定向简历', todos: ['用「简历制作 Skill」生成定向简历'] },
    { kw: '美团', title: '美团 · 商业分析', stage: 0, subState: '待填写网申', subTone: 'sand', riskNote: '⚠ 08-20 截止，仅剩 3 天', priority: '中', todos: ['08-20 前完成在线测评'] },
    { kw: '字节跳动', title: '字节 · AI 产品运营', stage: 0, subState: '待评估', subTone: 'gray', priority: '中', nextTodo: 'JD 匹配评估', todos: ['JD 匹配评估'] },
    { kw: '华为', title: '华为 · 硬件产品经理', stage: 1, subState: '已读未回', subTone: 'dusty', nextTodo: '周四前无回音则跟进', todos: ['周四前无回音则跟进'] },
    { kw: '京东', title: '京东 · 解决方案工程师', stage: 1, subState: '等待反馈', subTone: 'sage', todos: ['等待 HR 反馈'] },
    { kw: '网易', title: '网易 · 游戏策划', stage: 1, subState: '内推处理中', subTone: 'sand', todos: ['跟进内推进度'] },
    { kw: '腾讯', title: '腾讯 · 产品运营（游戏）', stage: 2, subState: 'AI面已完成', subTone: 'sage', priority: '高', nextTodo: '用面试 Skill 生成一面准备', todos: ['明天 15:00 一面，用「面试 Skill」生成准备材料'] },
    { kw: '阿里', title: '阿里 · 产品实习生', stage: 2, subState: 'HR初筛', subTone: 'dusty', todos: ['等待初筛结果'] },
    { kw: '百度', title: '百度 · 战略分析', stage: 2, subState: '笔试测评待完成', subTone: 'sand', todos: ['完成笔试测评'] },
    { kw: '京东', title: '京东 · 解决方案岗', stage: 3, subState: '二面已完成', subTone: 'sage', satisfaction: '高', nextTodo: '用面试 Skill 准备终面', todos: ['用「面试 Skill」准备终面'] },
    { kw: '字节跳动', title: '字节 · 数据分析', stage: 3, subState: '三面已完成', subTone: 'sand', todos: ['等待三面结果'] },
    { kw: '美团', title: '美团 · 产品经理', stage: 4, subState: 'Offer沟通中', subTone: 'sage', satisfaction: '高', todos: ['谈薪中'] },
    { kw: '拼多多', title: '拼多多 · 运营', stage: 4, subState: '未通过', subTone: 'gray', todos: ['复盘未通过原因'] },
  ];

  for (const s of seeds) {
    const company = await findCompany(s.kw);
    const app = await prisma.application.create({
      data: {
        userId: user.id,
        companyId: company?.id || null,
        jobTitle: s.title,
        stage: s.stage,
        stageName: STAGE_NAMES[s.stage],
        subState: s.subState || null,
        subTone: s.subTone || null,
        riskNote: s.riskNote || null,
        priority: s.priority || '中',
        satisfaction: s.satisfaction || null,
        nextTodo: s.nextTodo || null,
      },
    });
    await prisma.applicationEvent.create({
      data: { applicationId: app.id, type: '加入待投递', toStage: 0, note: '种子导入' },
    });
    if (s.stage > 0) {
      await prisma.applicationEvent.create({
        data: { applicationId: app.id, type: '状态变更', fromStage: 0, toStage: s.stage, note: s.subState || '' },
      });
    }
    for (const t of s.todos || []) {
      await prisma.todo.create({ data: { userId: user.id, applicationId: app.id, text: t, done: false } });
    }
  }

  console.log(`公司 ${companies.length} 家；证据 ${demoEvidence.length} 条；看板投递 ${seeds.length} 条`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
