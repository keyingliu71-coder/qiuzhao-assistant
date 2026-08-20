import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';

// 从飞书「求职台账总表」+ 用户人工补充（8.8-8.19）导入真实投递（非「未投递」共 63 条）
// 幂等：每次运行先清空该用户的个人投递，再重新导入

const STAGE_NAMES = ['待投递', '已投递未推进', '流程前期', '流程后期', '流程结束'];

type Row = {
  company: string;
  title: string;
  status: string;
  date: string;
  city: string;
  link: string | null;
  note: string;
  subState?: string;
  subTone?: string;
};

const rows: Row[] = [
  { company: '影石创新科技股份有限公司', title: '产品运营专员-2027校招', status: '已投递', date: '2026-07-25T00:00:00+08:00', city: '深圳', link: 'https://arashivision.jobs.feishu.cn/campus/position/7663421971648530694/detail/', note: '岗位方向匹配产品运营，含AI工具、数据分析、产品宣发要求' },
  { company: '影石创新科技股份有限公司', title: '产品经理-2027校招', status: '已投递', date: '2026-07-25T00:00:00+08:00', city: '深圳', link: 'https://arashivision.jobs.feishu.cn/campus/position/7664508546910865706/detail', note: '岗位方向匹配产品经理，含AI工具、用户需求、产品设计要求' },
  { company: '百度', title: '北京-AI产品经理（J100665）', status: '流程终止', date: '2026-07-27T15:51:48+08:00', city: '北京', link: 'https://talent.baidu.com/jobs/detail/GRADUATE/423c0fa3-a0f3-4def-a882-7466d3685b79', note: '简历初筛未通过，招聘流程已终止' },
  { company: '科大讯飞', title: '产品运营（J13401）', status: '流程终止', date: '2026-07-27T15:41:52+08:00', city: '合肥', link: 'https://iflytek.zhiye.com/campus/detail?jobAdId=8dc3e06b-c960-4031-81c2-ee498604e611', note: '招聘流程已终止，无需继续跟进' },
  { company: '科大讯飞', title: 'AI产品经理（J13348）', status: '流程终止', date: '2026-07-27T15:41:52+08:00', city: '合肥', link: 'https://iflytek.zhiye.com/campus/detail?jobAdId=d40ffccd-0aaa-4edc-9554-98036e70e518', note: '招聘流程已终止，无需继续跟进' },
  { company: '字节跳动', title: '行业AI产品实习生 - 飞书商业化', status: '已投递', date: '2026-07-27T18:21:04+08:00', city: '原文未明确', link: 'https://jobs.bytedance.com/campus/position/7665275066474170629/detail?spread=DWA3PQP', note: '来自字节跳动校园招聘官网' },
  { company: '字节跳动', title: '售前AI解决方案管培实习生-飞书商业化', status: '已投递', date: '2026-07-29T21:23:33+08:00', city: '上海', link: 'https://jobs.bytedance.com/campus/position/7654902974821206325/detail', note: 'ByteIntern；面向2027届；本科及以上' },
  { company: '畅游', title: '【2027届秋招】AI产品经理', status: '已投递', date: '2026-07-29T21:23:33+08:00', city: '原文未明确', link: 'https://app.mokahr.com/campus-recruitment/cyou-inc/42233#/job/32edb2fe-bea7-4321-9500-e4ce5c3f1ebe', note: '官网2026-07-27发布' },
  { company: 'OPPO', title: 'AI产品经理', status: '已投递', date: '2026-07-29T21:23:33+08:00', city: '深圳', link: 'https://careers.oppo.com/university/oppo/campus/post/1839?recruitType=Graduate', note: '官网2026-07-15发布；2027届应届生' },
  { company: 'Shopee（虾皮）', title: '产品经理（校招）', status: '初筛阶段', date: '2026-07-30T00:00:00+08:00', city: '用户未提供', link: null, note: '目前处于初筛阶段' },
  { company: '京东集团', title: 'TET管理培训生-产品方向', status: '已投递', date: '2026-08-03T00:00:00+08:00', city: '北京', link: 'https://campus.jd.com/#/details?id=8028', note: '官网岗位方向：产品方向；项目：TET管理培训生' },
  { company: '京东集团', title: '解决方案', status: '已投递', date: '2026-08-03T00:00:00+08:00', city: '成都、北京、厦门、上海等', link: 'https://campus.jd.com/#/details?id=9070', note: '适用业务包含京东科技、京东物流、京东工业及京东零售等' },
  { company: '百度', title: '深圳-AI产品经理（J100667）', status: '已投递', date: '2026-08-03T00:00:00+08:00', city: '深圳', link: 'https://talent.baidu.com/jobs/detail/GRADUATE/6a3ec057-b632-4c99-b075-dce2dbeccdd1', note: '来自百度校园招聘官网' },
  { company: '新大陆自动识别', title: '助理产品经理（27届校招）', status: '已投递', date: '2026-08-03T12:00:00+08:00', city: '福建省·福州市、国外', link: 'https://nlscan.zhiye.com/campus/detail?jobAdId=28a90508-6df6-42a0-b98a-2cbb882e57f5', note: '官网职责含产品开发进度跟踪、项目推进、产品策略数据整理及售前支持' },
  { company: '字节跳动', title: 'AI产品经理 - 抖音电商（A149353）', status: '已投递', date: '2026-08-03T12:00:00+08:00', city: '上海、北京', link: 'https://jobs.bytedance.com/campus/position/7667590063169341701/detail', note: '聚焦抖音电商客服AI产品与智能客服Agent建设' },
  { company: 'Shopee', title: 'ASP计划-AI产品经理', status: '已投递', date: '2026-08-04T12:00:00+08:00', city: '北京', link: null, note: '暂未提供岗位详情链接' },
  { company: '迅雷', title: '【2027校招】X-PEP产品星计划', status: '已投递', date: '2026-08-04T12:00:00+08:00', city: '广东·深圳市', link: 'https://campus.xunlei.com/campus-recruitment/xunlei/26600/#/job/1dead992-7754-403f-aa21-801c3ef7172a', note: 'Xunlei Product Excellence Program产品经理卓越人才计划，所属迅雷云事业部' },
  { company: '合合信息', title: '27届校招-AI产品经理（J14379）', status: '已投递', date: '2026-08-05T12:00:00+08:00', city: '上海市', link: 'https://intsig.zhiye.com/campus/detail?jobAdId=d57f466a-b393-49ae-b2db-3a67a40127d7', note: '涉及大模型、多模态、Agent、RAG及文档AI产品' },
  { company: '联想', title: '解决方案产品经理', status: '已投递', date: '2026-08-05T12:00:00+08:00', city: '上海', link: 'https://talent.lenovo.com.cn/position/detail?id=2360', note: '所属部门SSG，产品策划类，涉及SaaS解决方案产品全生命周期' },
  { company: '基恩士', title: '2027秋季校园招聘：销售工程师/销售', status: '已投递', date: '2026-08-06T12:00:00+08:00', city: '全国', link: 'https://keyence.zhiye.com/campus/jobs', note: '命中负向关键词「销售」，保留真实投递历史' },
  { company: '哔哩哔哩', title: '资源项目管理【2027届】', status: '已投递', date: '2026-08-07T12:00:00+08:00', city: '上海', link: 'https://jobs.bilibili.com/campus/positions/29690', note: '涉及基础设施资源管理、数据分析、产品化驱动及AI Agent能力' },
  { company: '迅雷', title: '数据产品经理', status: '初筛阶段', date: '2026-08-10T09:00:00+08:00', city: '原文未核验', link: 'https://campus.xunlei.com/#/job/cd8443b7-1ecc-4f8a-b53a-b86a5e5ffb87', note: '用户更正：投递的是数据产品经理，处于初筛阶段暂无进展' },
  { company: '德勤', title: 'Analyst – Deloitte IBond德勤风驭 – BJ', status: '已投递', date: '2026-08-10T09:00:00+08:00', city: '北京', link: 'https://wecruit.hotjob.cn/SU648133e50dcad45af15e3cb1/mc/detail?postId=6a704b404315481304771591&recruitType=campus&distance=undefined', note: '内部服务；8.12测评已做', subState: '测评完成', subTone: 'dusty' },
  { company: '小米', title: 'AI数据产品经理', status: '流程后期', date: '2026-08-10T09:00:00+08:00', city: '原文未核验', link: 'https://xiaomi.jobs.f.mioffice.cn/campus/position/7671290609248192795/detail?spread=J7NS6YR', note: '8.10完成笔试，8.11测评完成，8.17开始评估', subState: '笔试完成·评估中', subTone: 'dusty' },
  { company: '小米', title: '平台产品经理', status: '已投递', date: '2026-08-10T09:00:00+08:00', city: '原文未核验', link: 'https://xiaomi.jobs.f.mioffice.cn/campus/position/7670923615999314239/detail?spread=J7NS6YR', note: '第二志愿，暂无进度' },
  // ===== 8.8-8.19 用户人工补充 =====
  { company: '阿里-淘天集团', title: 'ai应用产品经理', status: '流程终止', date: '2026-08-08T12:00:00+08:00', city: '原文未提供', link: null, note: '简历筛选未通过（挂）', subState: '简历筛选未通过', subTone: 'gray' },
  { company: '阿里-淘天集团', title: 'ai产品经理', status: '流程终止', date: '2026-08-08T12:00:00+08:00', city: '原文未提供', link: null, note: '简历筛选未通过（挂）', subState: '简历筛选未通过', subTone: 'gray' },
  { company: '千问办公', title: 'ai agent产品经理', status: '流程终止', date: '2026-08-08T12:00:00+08:00', city: '原文未提供', link: null, note: '简历筛选未通过（挂）', subState: '简历筛选未通过', subTone: 'gray' },
  { company: '千问办公', title: 'ai产品经理-超级智能体', status: '流程终止', date: '2026-08-08T12:00:00+08:00', city: '原文未提供', link: null, note: '简历筛选未通过（挂）', subState: '简历筛选未通过', subTone: 'gray' },
  { company: '阿里-淘宝闪购', title: 'ai产品经理', status: '流程终止', date: '2026-08-09T12:00:00+08:00', city: '原文未提供', link: null, note: '简历筛选未通过（挂）', subState: '简历筛选未通过', subTone: 'gray' },
  { company: '阿里-淘宝闪购', title: 'ai产品运营', status: '流程终止', date: '2026-08-09T12:00:00+08:00', city: '原文未提供', link: null, note: '简历筛选未通过（挂）', subState: '简历筛选未通过', subTone: 'gray' },
  { company: '蚂蚁集团', title: 'ai产品运营', status: '初筛阶段', date: '2026-08-11T12:00:00+08:00', city: '原文未提供', link: null, note: '还没到测评', subState: '初筛阶段', subTone: 'dusty' },
  { company: '作业帮', title: '平台产品经理（企业）', status: '流程终止', date: '2026-08-11T12:00:00+08:00', city: '原文未提供', link: null, note: '简历筛选未通过（挂）', subState: '简历筛选未通过', subTone: 'gray' },
  { company: '作业帮', title: '产品经理', status: '流程终止', date: '2026-08-11T12:00:00+08:00', city: '原文未提供', link: null, note: '简历筛选未通过（挂）', subState: '简历筛选未通过', subTone: 'gray' },
  { company: 'vivo', title: 'ai产品经理', status: '初筛阶段', date: '2026-08-12T12:00:00+08:00', city: '原文未提供', link: null, note: '简历初筛中', subState: '初筛阶段', subTone: 'dusty' },
  { company: '得物', title: '商家ai产品经理', status: '已投递', date: '2026-08-12T12:00:00+08:00', city: '原文未提供', link: null, note: '暂无进展信息' },
  { company: '腾讯', title: '行业运营', status: '流程后期', date: '2026-08-12T12:00:00+08:00', city: '原文未提供', link: null, note: '已测评', subState: '测评完成', subTone: 'dusty' },
  { company: '施耐德', title: 'ai解决设计方案实习生', status: '已投递', date: '2026-08-12T12:00:00+08:00', city: '原文未提供', link: null, note: '无进展' },
  { company: '施耐德', title: 'ai产品实习生', status: '已投递', date: '2026-08-12T12:00:00+08:00', city: '原文未提供', link: null, note: '无进展' },
  { company: '大疆', title: '产品售后服务岗', status: '初筛阶段', date: '2026-08-12T12:00:00+08:00', city: '原文未提供', link: null, note: '简历评估中', subState: '简历评估中', subTone: 'dusty' },
  { company: '用友', title: 'b端产品经理', status: '流程后期', date: '2026-08-12T12:00:00+08:00', city: '原文未提供', link: null, note: '8.13测评完成', subState: '测评完成', subTone: 'dusty' },
  { company: '深信服', title: '售前产品经理', status: '已投递', date: '2026-08-13T12:00:00+08:00', city: '原文未提供', link: null, note: '暂无进展信息' },
  { company: '阿里-盒马bu', title: 'ai agent 产品经理', status: '流程终止', date: '2026-08-13T12:00:00+08:00', city: '原文未提供', link: null, note: '简历筛选未通过（挂）', subState: '简历筛选未通过', subTone: 'gray' },
  { company: '阿里-盒马bu', title: 'ai产品运营', status: '流程终止', date: '2026-08-13T12:00:00+08:00', city: '原文未提供', link: null, note: '简历筛选未通过（挂）', subState: '简历筛选未通过', subTone: 'gray' },
  { company: '快手', title: '平台产品经理-企业效能', status: '流程终止', date: '2026-08-13T12:00:00+08:00', city: '原文未提供', link: null, note: '8.15测评完成，8.19简历筛选已挂', subState: '简历筛选未通过', subTone: 'gray' },
  { company: '字节跳动', title: 'ai服务策略运营岗', status: '流程终止', date: '2026-08-13T12:00:00+08:00', city: '原文未提供', link: null, note: '简历已挂', subState: '简历筛选未通过', subTone: 'gray' },
  { company: '去哪儿', title: '产品运营', status: '已投递', date: '2026-08-14T12:00:00+08:00', city: '原文未提供', link: null, note: '简历还未筛选' },
  { company: '滴滴', title: '产品助理（国际化外卖-ai客服）', status: '流程后期', date: '2026-08-14T12:00:00+08:00', city: '原文未提供', link: null, note: '部门评估中', subState: '部门评估中', subTone: 'dusty' },
  { company: '拓竹', title: '服务运营-数据分析', status: '已投递', date: '2026-08-14T12:00:00+08:00', city: '原文未提供', link: null, note: '暂无进展信息' },
  { company: '小鹏', title: 'ai智能服务培训生', status: '已投递', date: '2026-08-14T12:00:00+08:00', city: '原文未提供', link: null, note: '暂无进展信息' },
  { company: '华为', title: '产品供应设计工程师', status: '已投递', date: '2026-08-15T12:00:00+08:00', city: '原文未提供', link: null, note: '暂无进展信息' },
  { company: '4399', title: 'ai人才储备', status: '流程终止', date: '2026-08-15T12:00:00+08:00', city: '原文未提供', link: null, note: '8.19简历已挂', subState: '简历筛选未通过', subTone: 'gray' },
  { company: '网易互娱', title: 'ai策略运营', status: '初筛阶段', date: '2026-08-16T12:00:00+08:00', city: '原文未提供', link: null, note: '筛选中', subState: '初筛阶段', subTone: 'dusty' },
  { company: '腾讯音乐', title: '内容管理', status: '已投递', date: '2026-08-16T12:00:00+08:00', city: '原文未提供', link: null, note: '暂无进展信息' },
  { company: '阿里-阿里云', title: 'ai技术服务工程师', status: '流程终止', date: '2026-08-17T12:00:00+08:00', city: '原文未提供', link: null, note: '简历已挂', subState: '简历筛选未通过', subTone: 'gray' },
  { company: '阿里-阿里云', title: '管培生-商业技术方向', status: '流程后期', date: '2026-08-17T12:00:00+08:00', city: '原文未提供', link: null, note: '评估中', subState: '评估中', subTone: 'dusty' },
  { company: '招商云创', title: '客户运营', status: '已投递', date: '2026-08-17T12:00:00+08:00', city: '原文未提供', link: null, note: '暂无进展信息' },
  { company: 'TP-LINK', title: '产品工程师', status: '初筛阶段', date: '2026-08-17T12:00:00+08:00', city: '原文未提供', link: null, note: '筛选中', subState: '初筛阶段', subTone: 'dusty' },
  { company: '美团', title: '大模型业务运营岗', status: '已投递', date: '2026-08-18T12:00:00+08:00', city: '原文未提供', link: null, note: '暂无进展信息' },
  { company: '镁信健康', title: 'AI产品经理', status: '已投递', date: '2026-08-18T12:00:00+08:00', city: '原文未提供', link: null, note: '暂无进展信息' },
  { company: '吉利', title: '战略ai产品经理', status: '已投递', date: '2026-08-19T12:00:00+08:00', city: '原文未提供', link: null, note: '暂无进展信息' },
  { company: '唯品会', title: 'ai产品专员', status: '已投递', date: '2026-08-19T12:00:00+08:00', city: '原文未提供', link: null, note: '暂无进展信息' },
  { company: '荣耀', title: '服务解决方案管培生', status: '已投递', date: '2026-08-19T12:00:00+08:00', city: '原文未提供', link: null, note: '暂无进展信息' },
];

function stageOf(status: string): number {
  if (status === '流程终止') return 4;
  if (status === '初筛阶段') return 2;
  if (status === '流程后期') return 3;
  return 1;
}
function subStateOf(status: string): string {
  if (status === '流程终止') return '流程终止';
  if (status === '初筛阶段') return '初筛阶段';
  if (status === '流程后期') return '笔试完成·评估中';
  return '等待反馈';
}
function subToneOf(status: string): string {
  if (status === '流程终止') return 'gray';
  if (status === '初筛阶段') return 'dusty';
  if (status === '流程后期') return 'dusty';
  return 'sage';
}
function baseNameOf(name: string): string {
  return name.split(/[（(]/)[0].trim();
}

async function main() {
  const prisma = new PrismaClient();

  const user = await prisma.user.upsert({
    where: { email: 'me@demo.com' },
    update: {},
    create: { email: 'me@demo.com', name: '刘可颖' },
  });

  await prisma.applicationEvent.deleteMany({ where: { application: { userId: user.id } } });
  await prisma.todo.deleteMany({ where: { userId: user.id } });
  await prisma.application.deleteMany({ where: { userId: user.id } });

  let created = 0, matched = 0, newCompany = 0;

  for (const r of rows) {
    const base = baseNameOf(r.company);
    let company = await prisma.company.findFirst({ where: { name: base } })
      ?? await prisma.company.findFirst({ where: { name: { contains: base } } });
    if (!company) {
      company = await prisma.company.create({
        data: { name: r.company, nature: '个人投递', location: r.city || null, sourceId: null },
      });
      newCompany++;
    } else {
      matched++;
    }

    const stage = stageOf(r.status);
    const app = await prisma.application.create({
      data: {
        userId: user.id,
        companyId: company.id,
        jobTitle: r.title,
        stage,
        stageName: STAGE_NAMES[stage],
        subState: r.subState ?? subStateOf(r.status),
        subTone: r.subTone ?? subToneOf(r.status),
        priority: '中',
        satisfaction: stage === 4 ? '低' : null,
        riskNote: null,
        sourceUrl: r.link, // 官方应聘记录/岗位链接（巡检跳转）
        nextTodo:
          stage === 1 ? '等待反馈，无回音则跟进'
          : stage === 2 ? '关注初筛/测评进展'
          : null,
        createdAt: new Date(r.date),
      },
    });
    await prisma.applicationEvent.create({
      data: {
        applicationId: app.id,
        type: '投递',
        fromStage: 0,
        toStage: stage,
        note: `${r.status} · ${r.note}${r.link ? ` · ${r.link}` : ''}`,
        createdAt: new Date(r.date),
      },
    });
    created++;
  }

  console.log(`导入完成：投递 ${created} 条；匹配公司 ${matched} 家；新建公司 ${newCompany} 家`);
  await prisma.$disconnect();
}

(async () => {
  try {
    try {
      (process as any).loadEnvFile(resolve(__dirname, '..', '.env'));
    } catch {}
    await main();
  } catch (e) {
    console.error('导入失败：', e);
    process.exit(1);
  }
})();
