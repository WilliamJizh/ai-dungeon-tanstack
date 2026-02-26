/**
 * Comprehensive evaluation playthrough.
 * Plays as a real player with varied actions across 6 turns,
 * evaluating prose quality, rhythm, effects, and narrative coherence.
 */
import { randomUUID } from 'crypto';
import { db } from './server/db/index.js';
import { plotStates, vnPackages } from './server/db/schema.js';
import { eq } from 'drizzle-orm';
import { createStorytellerAgent } from './server/vn/agents/storytellerChatAgent.js';
import type { VNPackage } from './server/vn/types/vnTypes.js';

const packageId = process.argv[2] || 'e527a879-ef93-41b3-958c-b7540ae0bc47';

// Diverse player actions testing different scenarios — mix urgency and contemplation
const SCENARIOS: { label: string; action: string | null }[] = [
  { label: 'Scene opening', action: null },
  { label: 'Investigate floorboard', action: 'Player chooses: Pry up the uneven board with a fingernail.' },
  { label: 'URGENT: run from noise', action: 'Player takes action: I grab the locket and bolt for the door — I heard heavy footsteps coming down the hall!' },
  { label: 'Quiet: catch breath, examine surroundings', action: 'Player takes action: I press my back against the cold wall of the corridor, clutching the locket, and just listen. What can I hear? What do I see?' },
  { label: 'Off-script: try to pick a lock', action: 'Player takes action: I notice a locked display case and try to pick the lock with a hairpin.' },
];

const BANNED = [
  'a sense of', 'palpable tension', "couldn't help but", 'sent shivers down',
  'the weight of', 'hung heavy in the air', 'a mix of', 'it was not', 'no x, no y',
];

interface FrameData {
  type: string;
  narration?: string;
  narrationBeats?: string[];
  dialogue?: { speaker: string; text: string };
  conversationLines?: ({ speaker: string; text: string } | { narrator: string })[];
  effects: string[];
  perLineEffects?: string[];
  audio?: string;
  choices?: string[];
  hasFreeText: boolean;
  diceRoll?: any;
  skillCheck?: any;
}

interface TurnReport {
  turn: number;
  label: string;
  frames: FrameData[];
  bannedViolations: string[];
  hasSceneComplete: boolean;
}

async function run() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          STORYTELLER EVALUATION PLAYTHROUGH             ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const pkgRow = db.select().from(vnPackages).where(eq(vnPackages.id, packageId)).get();
  if (!pkgRow) { console.error('Package not found.'); process.exit(1); }
  const vnPackage = JSON.parse(pkgRow.metaJson) as VNPackage;

  const sessionId = randomUUID();
  const startingSceneId = vnPackage.plot.acts[0]?.scenes[0]?.id;
  if (!startingSceneId) { console.error('No starting scene.'); process.exit(1); }

  db.insert(plotStates).values({
    sessionId, packageId,
    currentActId: vnPackage.plot.acts[0].id,
    currentSceneId: startingSceneId,
    currentBeat: 0, offPathTurns: 0,
    flagsJson: '{}', completedScenes: '[]',
    updatedAt: new Date().toISOString(),
  }).run();

  const agent = createStorytellerAgent(vnPackage, sessionId);
  let messages: any[] = [
    { role: 'user', content: [{ type: 'text', text: '[scene start]' }] }
  ];

  const reports: TurnReport[] = [];
  let globalFrame = 0;

  for (let turn = 0; turn < SCENARIOS.length; turn++) {
    const scenario = SCENARIOS[turn];
    console.log(`\n┌─── TURN ${turn}: ${scenario.label} ${'─'.repeat(Math.max(0, 48 - scenario.label.length))}┐`);

    try {
      const report: TurnReport = {
        turn, label: scenario.label,
        frames: [], bannedViolations: [],
        hasSceneComplete: false,
      };

      // Inner loop: keep generating until agent yields for something other than dice-result
      let awaitingDice = true;
      while (awaitingDice) {
        const result = await agent.generate({ messages });
        let yieldType: string | null = null;
        let lastDiceRoll: any = null;

        for (const step of result.steps) {
          for (const tr of step.toolResults ?? []) {
            if (tr.toolName === 'frameBuilderTool') {
              globalFrame++;
              const frame = (tr.output as any)?.frame ?? {};
              const inp = tr.input as any;
              const type = frame.type || inp?.type || 'unknown';

              const fd: FrameData = {
                type,
                effects: (frame.effects ?? inp?.effects ?? []).map((e: any) => e.type),
                hasFreeText: !!(frame.showFreeTextInput ?? inp?.showFreeTextInput),
              };

              // Narrations[] (new) or narration (legacy)
              const narrations = frame.narrations ?? inp?.narrations;
              const narr = frame.narration ?? inp?.narration;
              if (Array.isArray(narrations) && narrations.length > 0) {
                fd.narrationBeats = narrations.map((n: any) => n.text);
                fd.narration = narrations.map((n: any) => n.text).join(' ');
                fd.perLineEffects = narrations.filter((n: any) => n.effect).map((n: any) => n.effect.type);
              } else if (narr?.text) {
                fd.narration = narr.text;
              }

              // Conversation[] (new) or dialogue (legacy)
              const conv = frame.conversation ?? inp?.conversation;
              const dlg = frame.dialogue ?? inp?.dialogue;
              if (Array.isArray(conv) && conv.length > 0) {
                fd.conversationLines = conv.map((l: any) => 'narrator' in l ? { narrator: l.narrator } : { speaker: l.speaker || '', text: l.text });
                // Set dialogue to first non-narrator speaker for backward compat in reports
                const firstSpeaker = conv.find((l: any) => !('narrator' in l));
                if (firstSpeaker) fd.dialogue = { speaker: firstSpeaker.speaker || 'unknown', text: firstSpeaker.text };
                const lineEffects = conv.filter((l: any) => l.effect).map((l: any) => l.effect.type);
                fd.perLineEffects = [...(fd.perLineEffects ?? []), ...lineEffects];
              } else if (dlg?.text) {
                fd.dialogue = { speaker: dlg.speaker || 'unknown', text: dlg.text };
              }

              const aud = frame.audio ?? inp?.audio;
              if (aud?.musicAsset) fd.audio = aud.musicAsset;

              const choices = frame.choices ?? inp?.choices;
              if (Array.isArray(choices) && choices.length) fd.choices = choices.map((c: any) => c.text);

              if (frame.diceRoll ?? inp?.diceRoll) {
                fd.diceRoll = frame.diceRoll ?? inp?.diceRoll;
                lastDiceRoll = fd.diceRoll;
              }
              if (frame.skillCheck ?? inp?.skillCheck) fd.skillCheck = frame.skillCheck ?? inp?.skillCheck;

              // Check banned phrases — aggregate all text from new and legacy fields
              const convTexts = (fd.conversationLines ?? []).map(l => l.text);
              const allText = [fd.narration, fd.dialogue?.text, ...convTexts].filter(Boolean).join(' ');
              for (const b of BANNED) {
                if (allText.toLowerCase().includes(b.toLowerCase())) {
                  report.bannedViolations.push(`"${b}" found in frame ${globalFrame}`);
                }
              }

              report.frames.push(fd);

              // Print
              console.log(`│`);
              console.log(`│  🎞️  Frame ${globalFrame} [${type}]`);
              if (fd.effects.length) console.log(`│      ✨ ${fd.effects.join(', ')}`);
              if (fd.audio) console.log(`│      🎵 ${fd.audio}`);
              if (fd.narrationBeats && fd.narrationBeats.length > 0) {
                fd.narrationBeats.forEach((beat: string) => {
                  console.log(`│      📜 ${beat.substring(0, 300)}${beat.length > 300 ? '...' : ''}`);
                });
              } else if (fd.narration) {
                console.log(`│      📜 ${fd.narration.substring(0, 300)}${fd.narration.length > 300 ? '...' : ''}`);
              }
              if (fd.conversationLines && fd.conversationLines.length > 0) {
                fd.conversationLines.forEach((line) => {
                  if ('narrator' in line) {
                    console.log(`│      📝 ${line.narrator.substring(0, 250)}${line.narrator.length > 250 ? '...' : ''}`);
                  } else {
                    console.log(`│      🗣️  ${(line as any).speaker}: "${(line as any).text.substring(0, 250)}${(line as any).text.length > 250 ? '...' : ''}"`);
                  }
                });
              } else if (fd.dialogue) {
                console.log(`│      🗣️  ${fd.dialogue.speaker}: "${fd.dialogue.text.substring(0, 250)}${fd.dialogue.text.length > 250 ? '...' : ''}"`);
              }
              if (fd.perLineEffects?.length) console.log(`│      🎭 Per-line effects: ${fd.perLineEffects.join(', ')}`);
              if (fd.diceRoll) console.log(`│      🎲 ${fd.diceRoll.diceNotation} → ${fd.diceRoll.roll ?? '?'} (${fd.diceRoll.description})`);
              if (fd.skillCheck) console.log(`│      📊 ${fd.skillCheck.stat} DC${fd.skillCheck.difficulty}: ${fd.skillCheck.roll}+${fd.skillCheck.modifier}=${fd.skillCheck.total} → ${fd.skillCheck.succeeded ? 'SUCCESS' : 'FAILURE'}`);
              if (fd.choices) console.log(`│      ❓ ${fd.choices.join(' | ')}`);

            } else if (tr.toolName === 'sceneCompleteTool') {
              report.hasSceneComplete = true;
              console.log(`│  ✅ SCENE COMPLETE: ${(tr.output as any)?.completedSceneId}`);
            } else if (tr.toolName === 'yieldToPlayer') {
              yieldType = (tr.input as any)?.waitingFor ?? 'choice';
              console.log(`│  ⏸️  yield(${yieldType})`);
            }
          }
        }

        messages.push(...(result.response.messages as any[]));

        if (yieldType === 'dice-result' && lastDiceRoll) {
          // Simulate physics dice roll
          const notation = lastDiceRoll.diceNotation ?? '1d20';
          const match = notation.match(/(\d+)d(\d+)/);
          const [count, sides] = match ? [+match[1], +match[2]] : [1, 20];
          let total = 0;
          for (let i = 0; i < count; i++) total += Math.floor(Math.random() * sides) + 1;
          console.log(`│  🎲 Simulated roll: ${total}`);
          messages.push({ role: 'user', content: [{ type: 'text', text: `[dice-result] ${total}` }] });
          // Continue inner loop — agent will process the result
        } else {
          awaitingDice = false;
        }
      }

      reports.push(report);
      console.log(`└${'─'.repeat(58)}┘`);

      // Append next scenario action
      const nextAction = SCENARIOS[turn + 1]?.action;
      if (nextAction) {
        messages.push({ role: 'user', content: [{ type: 'text', text: nextAction }] });
      }

    } catch (e: any) {
      console.log(`│  ❌ ERROR: ${e.message?.substring(0, 100)}`);
      console.log(`└${'─'.repeat(58)}┘`);
      break;
    }
  }

  // ═══ FINAL REPORT ═══
  console.log('\n\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                    FINAL REPORT                         ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // Per-turn analysis
  for (const r of reports) {
    const types = r.frames.map(f => f.type);
    const hasNarr = r.frames.some(f => f.narration || f.narrationBeats?.length);
    const hasDlg = r.frames.some(f => f.dialogue || f.conversationLines?.length);
    const hasEfx = r.frames.some(f => f.effects.length > 0);
    const hasAud = r.frames.some(f => f.audio);
    const hasChoice = r.frames.some(f => f.choices?.length);
    const hasPerLineEfx = r.frames.some(f => f.perLineEffects?.length);
    const avgNarr = r.frames.filter(f => f.narration).map(f => f.narration!.length);
    const avgLen = avgNarr.length ? Math.round(avgNarr.reduce((a, b) => a + b) / avgNarr.length) : 0;
    const totalConvLines = r.frames.reduce((s, f) => s + (f.conversationLines?.length ?? 0), 0);
    const totalNarrBeats = r.frames.reduce((s, f) => s + (f.narrationBeats?.length ?? 0), 0);

    console.log(`Turn ${r.turn} [${r.label}]:`);
    console.log(`  ${r.frames.length} frames: ${types.join(' → ')}`);
    console.log(`  Narration: ${hasNarr ? `✅ (${totalNarrBeats} beats)` : '❌'}  Dialogue: ${hasDlg ? `✅ (${totalConvLines} lines)` : '❌'}  Effects: ${hasEfx ? '✅' : '❌'}  Audio: ${hasAud ? '✅' : '❌'}  Choices: ${hasChoice ? '✅' : '❌'}`);
    if (hasPerLineEfx) console.log(`  Per-line effects: ${r.frames.flatMap(f => f.perLineEffects ?? []).join(', ')}`);
    console.log(`  Avg narration: ${avgLen} chars`);
    if (r.bannedViolations.length) console.log(`  ⚠️  VIOLATIONS: ${r.bannedViolations.join('; ')}`);
    console.log();
  }

  // Overall metrics
  const totalFrames = reports.reduce((s, r) => s + r.frames.length, 0);
  const allFrameTypes = reports.flatMap(r => r.frames.map(f => f.type));
  const uniqueTypes = [...new Set(allFrameTypes)];
  const turnsWithEffects = reports.filter(r => r.frames.some(f => f.effects.length)).length;
  const turnsWithAudio = reports.filter(r => r.frames.some(f => f.audio)).length;
  const totalBanned = reports.reduce((s, r) => s + r.bannedViolations.length, 0);
  const frameCounts = reports.map(r => r.frames.length);
  const allNarr = reports.flatMap(r => r.frames.filter(f => f.narration).map(f => f.narration!.length));

  console.log('─── OVERALL METRICS ───');
  console.log(`Frames: ${totalFrames} across ${reports.length} turns (${frameCounts.join(', ')} per turn)`);
  console.log(`Frame types: ${uniqueTypes.join(', ')} (${uniqueTypes.length} unique)`);
  console.log(`Effects: ${turnsWithEffects}/${reports.length} turns`);
  console.log(`Audio: ${turnsWithAudio}/${reports.length} turns`);
  console.log(`Banned phrases: ${totalBanned} violations`);
  console.log(`Avg narration: ${allNarr.length ? Math.round(allNarr.reduce((a, b) => a + b) / allNarr.length) : 0} chars`);
  console.log(`Rhythm variance: ${Math.min(...frameCounts)}-${Math.max(...frameCounts)} frames/turn`);

  // Qualitative checklist
  console.log('\n─── QUALITATIVE CHECKLIST ───');
  const t0 = reports[0];
  console.log(`[${t0?.frames[0]?.effects.includes('fade-in') ? '✅' : '❌'}] Scene opens with fade-in effect`);
  console.log(`[${t0?.frames.some(f => f.audio) ? '✅' : '❌'}] Scene opens with music`);
  console.log(`[${t0?.frames.filter(f => f.type === 'full-screen' || f.type === 'dialogue').length >= 3 ? '✅' : '❌'}] Scene has 3+ atmosphere frames before choice`);
  console.log(`[${totalBanned === 0 ? '✅' : '❌'}] No banned phrases`);
  console.log(`[${uniqueTypes.length >= 4 ? '✅' : '❌'}] Uses 4+ frame types`);
  console.log(`[${turnsWithEffects >= reports.length * 0.5 ? '✅' : '❌'}] Effects used in 50%+ turns`);

  // Check off-script handling (turn 3)
  const t3 = reports[3];
  if (t3) {
    const t3HasNarr = t3.frames.some(f => (f.narration && f.narration.length > 100) || (f.narrationBeats && f.narrationBeats.some(b => b.length > 50)));
    console.log(`[${t3HasNarr ? '✅' : '❌'}] Off-script action handled with narrative depth`);
  }

  // Check new schema usage
  const usesConversation = reports.some(r => r.frames.some(f => f.conversationLines?.length));
  const usesNarrationBeats = reports.some(r => r.frames.some(f => f.narrationBeats?.length));
  console.log(`[${usesConversation ? '✅' : '❌'}] Uses conversation[] array (new schema)`);
  console.log(`[${usesNarrationBeats ? '✅' : '❌'}] Uses narrations[] array (new schema)`);

  console.log('\n[Evaluation complete]');
}

run().catch(e => { console.error(e); process.exit(1); });
