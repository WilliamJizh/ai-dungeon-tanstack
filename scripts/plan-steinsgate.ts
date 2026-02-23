import 'dotenv/config';
import { createPlanningAgent } from '../server/vn/agents/planningChatAgent.js';
import { getOrCreatePlanSession } from '../server/vn/state/planSessionStore.js';
import { randomUUID } from 'crypto';

async function run() {
  const sessionId = randomUUID();
  const session = getOrCreatePlanSession(sessionId, 'zh-CN', true); // bypassAssets=true for CLI

  console.log(`\nSession: ${sessionId}`);
  console.log(`Package ID: ${session.packageId}\n`);

  const agent = createPlanningAgent(session);

  const prompt = `设计一个类似《命运石之门》（Steins;Gate）风格的日式视觉小说冒险故事。

设定要求：
- 时间旅行/平行世界为核心机制
- 现代都市 + 科幻悬疑基调
- 主角团是一群在秋叶原地下实验室搞发明的大学生/宅人
- 故事从一个看似普通的发明（类似电话微波炉）意外发现能发送信息到过去开始
- 涉及神秘组织追踪、世界线收束、蝴蝶效应
- 多条世界线/时间线交织，选择导致不同结局
- 基调从轻松日常逐渐转为紧张悬疑，最终走向高潮反转

角色要求（至少4个核心角色）：
- 中二病主角（自称"疯狂科学家"的天才怪人）
- 天才黑客/程序员搭档
- 神秘的时间旅行者/关键女角
- 组织的内部人员/双面间谍

剧情结构要求：
- 3幕结构
- Act 1: 日常 + 发现时间机器 + 初次改变历史
- Act 2: 蝴蝶效应显现 + 组织追杀 + 世界线概念揭示 + 重大反转
- Act 3: 世界线收束 + 最终对决 + 多结局分支
- 每幕至少2-3个场景节点

所有内容必须用中文（zh-CN）撰写。ID/slug 用英文小写。

AUTOMATED GENERATION — 不要停下来问问题。按顺序调用所有工具：
1. proposeStoryPremise（包含完整的 globalMaterials 和 possibleEndings）
2. proposeCharacter × 4+（逐个创建角色）
3. proposeAct × 3（三幕）
4. proposeScene × 6+（每幕至少2个场景，包含 interactables, findings, callbacks, exitConditions）
5. finalizePackage
现在开始，一口气全部生成完毕。`;

  console.log('[Planning agent is designing the story...]\n');

  try {
    const result = await agent.generate({
      messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
    });

    // Show agent text if any
    if (result.text?.trim()) {
      console.log(`\n[Agent]: ${result.text}\n`);
    }

    // Process tool results across all steps
    let packageId: string | null = null;
    let toolCount = 0;

    for (const step of result.steps) {
      for (const tr of step.toolResults ?? []) {
        toolCount++;
        const out = tr.output as any;

        if (tr.toolName === 'proposeStoryPremise') {
          console.log(`  proposeStoryPremise: "${out.title}"`);
        } else if (tr.toolName === 'proposeCharacter') {
          console.log(`  proposeCharacter: ${out.name} (${out.id})`);
        } else if (tr.toolName === 'proposeAct') {
          console.log(`  proposeAct: ${out.title} (${out.id})`);
        } else if (tr.toolName === 'proposeScene') {
          console.log(`  proposeScene: ${out.title} (${out.id})`);
        } else if (tr.toolName === 'finalizePackage') {
          console.log(`  finalizePackage: ${out.title} (${out.totalScenes} scenes)`);
          packageId = out.packageId;
        } else {
          console.log(`  ${tr.toolName}`);
        }
      }
    }

    if (packageId) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`PACKAGE ID: ${packageId}`);
      console.log(`${'='.repeat(60)}`);
      console.log(`\nTo play this story:\n`);
      console.log(`  npx tsx test_storyteller.ts ${packageId}\n`);
    } else {
      console.log('\nfinalizePackage was not called. Partial draft:');
      console.log(`  Title: ${session.draft.premise?.title ?? '(none)'}`);
      console.log(`  Characters: ${session.draft.characters.map(c => c.name).join(', ') || '(none)'}`);
      console.log(`  Acts: ${session.draft.acts.map(a => a.title).join(', ') || '(none)'}`);
      console.log(`  Scenes: ${session.draft.scenes.map(s => s.title).join(', ') || '(none)'}`);
    }

    console.log(`[Done — ${toolCount} tool calls across ${result.steps.length} steps]`);

  } catch (error) {
    console.error('\nPlanning failed:', error);

    if (session.draft.premise) {
      console.log('\n--- Partial Draft ---');
      console.log(`Title: ${session.draft.premise.title}`);
      console.log(`Characters: ${session.draft.characters.map(c => c.name).join(', ')}`);
      console.log(`Acts: ${session.draft.acts.map(a => a.title).join(', ')}`);
      console.log(`Scenes: ${session.draft.scenes.map(s => s.title).join(', ')}`);
    }
  }
}

run();
