/**
 * Non-interactive smoke test for the storyteller agent.
 * Runs a pre-scripted sequence of player actions across multiple turns
 * and evaluates prose quality, effects usage, rhythm, etc.
 */
import { randomUUID } from 'crypto';
import { db } from './server/db/index.js';
import { plotStates, vnPackages } from './server/db/schema.js';
import { eq } from 'drizzle-orm';
import { createStorytellerAgent } from './server/vn/agents/storytellerChatAgent.js';
import type { VNPackage } from './server/vn/types/vnTypes.js';

const packageId = process.argv[2] || 'e527a879-ef93-41b3-958c-b7540ae0bc47';

// Pre-scripted player actions for each turn
const PLAYER_ACTIONS = [
  // Turn 0: scene start (automatic)
  null,
  // Turn 1: investigate the floorboard
  'Player chooses: Follow the scratching sound to the loose floorboard near the bed.',
  // Turn 2: examine what was found (free text)
  'Player takes action: I carefully examine whatever is hidden beneath the floorboard, brushing away the dust with my fingertips.',
  // Turn 3: try something creative / off-script
  'Player takes action: I hold the locket up to the moonlight coming through the window, turning it slowly, looking for any hidden engravings.',
];

const BANNED_PHRASES = [
  'a sense of', 'palpable tension', "couldn't help but", 'sent shivers down',
  'the weight of', 'hung heavy in the air', 'a mix of',
];

interface TurnStats {
  turn: number;
  frameCount: number;
  frameTypes: string[];
  hasEffects: boolean;
  hasAudio: boolean;
  hasChoices: boolean;
  hasFreeText: boolean;
  bannedPhraseViolations: string[];
  narrationLengths: number[];
  narrationBeatCount: number;
  dialogueSpeakers: string[];
  conversationLineCount: number;
  effectTypes: string[];
  perLineEffects: string[];
  audioAssets: string[];
}

async function run() {
  console.log(`\n=== STORYTELLER SMOKE TEST ===`);
  console.log(`Package: ${packageId}\n`);

  const pkgRow = db.select().from(vnPackages).where(eq(vnPackages.id, packageId)).get();
  if (!pkgRow) { console.error(`Package not found.`); process.exit(1); }
  const vnPackage = JSON.parse(pkgRow.metaJson) as VNPackage;

  const sessionId = randomUUID();
  const startingSceneId = vnPackage.plot.acts[0]?.scenes[0]?.id;
  if (!startingSceneId) { console.error(`No starting scene.`); process.exit(1); }

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

  const allTurnStats: TurnStats[] = [];
  let globalFrameCount = 0;

  for (let turn = 0; turn < PLAYER_ACTIONS.length; turn++) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`TURN ${turn}${turn === 0 ? ' (scene start)' : ` — "${PLAYER_ACTIONS[turn]?.substring(0, 60)}..."`}`);
    console.log('═'.repeat(60));

    const stats: TurnStats = {
      turn,
      frameCount: 0,
      frameTypes: [],
      hasEffects: false,
      hasAudio: false,
      hasChoices: false,
      hasFreeText: false,
      bannedPhraseViolations: [],
      narrationLengths: [],
      narrationBeatCount: 0,
      dialogueSpeakers: [],
      conversationLineCount: 0,
      effectTypes: [],
      perLineEffects: [],
      audioAssets: [],
    };

    // Inner loop: keep generating until agent yields for something other than dice-result
    let awaitingDice = true;
    while (awaitingDice) {
      const result = await agent.generate({ messages });
      let yieldType: string | null = null;
      let lastDiceRoll: any = null;

      // Process frames
      for (const step of result.steps) {
        for (const toolResult of step.toolResults ?? []) {
          if (toolResult.toolName === 'frameBuilderTool') {
            globalFrameCount++;
            stats.frameCount++;

            const frame = (toolResult.output as any)?.frame ?? {};
            const input = toolResult.input as any;
            const type = frame.type || input?.type || 'unknown';
            stats.frameTypes.push(type);

            // Check effects
            const effects = frame.effects ?? input?.effects ?? [];
            if (Array.isArray(effects) && effects.length > 0) {
              stats.hasEffects = true;
              stats.effectTypes.push(...effects.map((e: any) => e.type));
            }

            // Check audio
            const audio = frame.audio ?? input?.audio;
            if (audio?.musicAsset) {
              stats.hasAudio = true;
              stats.audioAssets.push(audio.musicAsset);
            }

            // Check narrations[] (new) or narration (legacy)
            const narrations = frame.narrations ?? input?.narrations;
            const narration = frame.narration ?? input?.narration;
            if (Array.isArray(narrations) && narrations.length > 0) {
              stats.narrationBeatCount += narrations.length;
              for (const n of narrations) {
                stats.narrationLengths.push(n.text.length);
                if (n.effect) stats.perLineEffects.push(n.effect.type);
                for (const phrase of BANNED_PHRASES) {
                  if (n.text.toLowerCase().includes(phrase.toLowerCase())) {
                    stats.bannedPhraseViolations.push(`"${phrase}" in narration: "${n.text.substring(0, 80)}..."`);
                  }
                }
              }
            } else if (narration?.text) {
              stats.narrationBeatCount += 1;
              stats.narrationLengths.push(narration.text.length);
              for (const phrase of BANNED_PHRASES) {
                if (narration.text.toLowerCase().includes(phrase.toLowerCase())) {
                  stats.bannedPhraseViolations.push(`"${phrase}" in narration: "${narration.text.substring(0, 80)}..."`);
                }
              }
            }

            // Check conversation[] (new) or dialogue (legacy)
            const conversation = frame.conversation ?? input?.conversation;
            const dialogue = frame.dialogue ?? input?.dialogue;
            if (Array.isArray(conversation) && conversation.length > 0) {
              stats.conversationLineCount += conversation.length;
              for (const line of conversation) {
                if (!('narrator' in line)) stats.dialogueSpeakers.push(line.speaker || 'unknown');
                if (line.effect) stats.perLineEffects.push(line.effect.type);
                const lineText = 'narrator' in line ? line.narrator : line.text;
                for (const phrase of BANNED_PHRASES) {
                  if (lineText.toLowerCase().includes(phrase.toLowerCase())) {
                    stats.bannedPhraseViolations.push(`"${phrase}" in conversation: "${lineText.substring(0, 80)}..."`);
                  }
                }
              }
            } else if (dialogue?.text) {
              stats.conversationLineCount += 1;
              stats.dialogueSpeakers.push(dialogue.speaker || 'unknown');
              for (const phrase of BANNED_PHRASES) {
                if (dialogue.text.toLowerCase().includes(phrase.toLowerCase())) {
                  stats.bannedPhraseViolations.push(`"${phrase}" in dialogue: "${dialogue.text.substring(0, 80)}..."`);
                }
              }
            }

            // Check dice roll
            const diceRoll = frame.diceRoll ?? input?.diceRoll;
            if (diceRoll) lastDiceRoll = diceRoll;

            // Check choices
            const choices = frame.choices ?? input?.choices;
            if (Array.isArray(choices) && choices.length > 0) stats.hasChoices = true;
            if (frame.showFreeTextInput ?? input?.showFreeTextInput) stats.hasFreeText = true;

            // Print frame
            console.log(`\n  🎞️  Frame ${globalFrameCount} [${type}]`);
            if (Array.isArray(narrations) && narrations.length > 0) {
              narrations.forEach((n: any) => {
                const eff = n.effect ? ` [${n.effect.type}]` : '';
                console.log(`      📜 ${n.text.substring(0, 200)}${n.text.length > 200 ? '...' : ''}${eff}`);
              });
            } else if (narration?.text) {
              console.log(`      📜 ${narration.text.substring(0, 200)}${narration.text.length > 200 ? '...' : ''}`);
            }
            if (Array.isArray(conversation) && conversation.length > 0) {
              conversation.forEach((line: any) => {
                const eff = line.effect ? ` [${line.effect.type}]` : '';
                if ('narrator' in line) {
                  console.log(`      📝 ${line.narrator.substring(0, 200)}${line.narrator.length > 200 ? '...' : ''}${eff}`);
                } else {
                  console.log(`      🗣️  ${line.speaker}: "${line.text.substring(0, 200)}${line.text.length > 200 ? '...' : ''}"${eff}`);
                }
              });
            } else if (dialogue?.text) {
              console.log(`      🗣️  ${dialogue.speaker}: "${dialogue.text.substring(0, 200)}${dialogue.text.length > 200 ? '...' : ''}"`);
            }
            if (diceRoll) console.log(`      🎲 ${diceRoll.diceNotation} → ${diceRoll.roll ?? '?'} (${diceRoll.description ?? ''})`);
            if (effects.length) console.log(`      ✨ Effects: ${effects.map((e: any) => e.type).join(', ')}`);
            if (audio?.musicAsset) console.log(`      🎵 Music: ${audio.musicAsset}${audio.fadeIn ? ' (fade-in)' : ''}`);
            if (choices?.length) console.log(`      ❓ Choices: ${choices.map((c: any) => c.text).join(' | ')}`);

            // Check skill check
            const skillCheck = frame.skillCheck ?? input?.skillCheck;
            if (skillCheck) console.log(`      📊 ${skillCheck.stat} DC${skillCheck.difficulty}: ${skillCheck.roll}+${skillCheck.modifier ?? 0}=${skillCheck.total} → ${skillCheck.succeeded ? 'SUCCESS' : 'FAILURE'}`);

          } else if (toolResult.toolName === 'yieldToPlayer') {
            yieldType = (toolResult.input as any)?.waitingFor ?? 'choice';
            console.log(`\n  ⏸️  Yield: waitingFor=${yieldType}`);
          } else if (toolResult.toolName === 'sceneCompleteTool') {
            console.log(`\n  ✅ Scene Complete: ${(toolResult.output as any)?.completedSceneId}`);
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
        console.log(`  🎲 Simulated roll: ${total}`);
        messages.push({ role: 'user', content: [{ type: 'text', text: `[dice-result] ${total}` }] });
      } else {
        awaitingDice = false;
      }
    }

    allTurnStats.push(stats);

    // Append next player action
    const nextAction = PLAYER_ACTIONS[turn + 1];
    if (nextAction) {
      messages.push({ role: 'user', content: [{ type: 'text', text: nextAction }] });
    }
  }

  // Print evaluation summary
  console.log(`\n\n${'═'.repeat(60)}`);
  console.log('EVALUATION SUMMARY');
  console.log('═'.repeat(60));

  for (const stats of allTurnStats) {
    console.log(`\nTurn ${stats.turn}:`);
    console.log(`  Frames: ${stats.frameCount} [${stats.frameTypes.join(', ')}]`);
    console.log(`  Effects: ${stats.hasEffects ? `✅ (${stats.effectTypes.join(', ')})` : '❌ none'}`);
    console.log(`  Audio: ${stats.hasAudio ? `✅ (${stats.audioAssets.join(', ')})` : '❌ none'}`);
    console.log(`  Choices: ${stats.hasChoices ? '✅' : '❌'}  Free-text: ${stats.hasFreeText ? '✅' : '❌'}`);
    console.log(`  Narration: ${stats.narrationBeatCount} beats, lengths [${stats.narrationLengths.join(', ')}] chars`);
    console.log(`  Conversation: ${stats.conversationLineCount} lines, speakers: ${stats.dialogueSpeakers.length ? stats.dialogueSpeakers.join(', ') : 'none'}`);
    if (stats.perLineEffects.length) console.log(`  Per-line effects: ${stats.perLineEffects.join(', ')}`);
    if (stats.bannedPhraseViolations.length) {
      console.log(`  ⚠️  BANNED PHRASES FOUND:`);
      stats.bannedPhraseViolations.forEach(v => console.log(`     - ${v}`));
    }
  }

  // Overall assessment
  const totalFrames = allTurnStats.reduce((s, t) => s + t.frameCount, 0);
  const turnsWithEffects = allTurnStats.filter(t => t.hasEffects).length;
  const turnsWithAudio = allTurnStats.filter(t => t.hasAudio).length;
  const totalBanned = allTurnStats.reduce((s, t) => s + t.bannedPhraseViolations.length, 0);
  const avgNarration = allTurnStats.flatMap(t => t.narrationLengths);
  const avgLen = avgNarration.length ? Math.round(avgNarration.reduce((a, b) => a + b, 0) / avgNarration.length) : 0;

  console.log(`\n--- OVERALL ---`);
  console.log(`Total frames: ${totalFrames} across ${allTurnStats.length} turns`);
  console.log(`Avg narration length: ${avgLen} chars`);
  console.log(`Effects used: ${turnsWithEffects}/${allTurnStats.length} turns`);
  console.log(`Audio set: ${turnsWithAudio}/${allTurnStats.length} turns`);
  console.log(`Banned phrases: ${totalBanned} violations`);

  // Frame type variety
  const allTypes = allTurnStats.flatMap(t => t.frameTypes);
  const uniqueTypes = [...new Set(allTypes)];
  console.log(`Frame type variety: ${uniqueTypes.join(', ')} (${uniqueTypes.length} unique)`);

  // Rhythm check: variance in frames per turn
  const frameCounts = allTurnStats.map(t => t.frameCount);
  const minFrames = Math.min(...frameCounts);
  const maxFrames = Math.max(...frameCounts);
  console.log(`Rhythm: ${minFrames}-${maxFrames} frames/turn (${minFrames === maxFrames ? '⚠️ no variation' : '✅ varied'})`);

  console.log(`\n[Smoke test complete]`);
}

run().catch(e => { console.error(e); process.exit(1); });
