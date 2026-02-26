/**
 * Turn-by-turn interactive play script.
 * Usage: npx tsx play_interactive.ts <packageId> <action>
 *   - First call: npx tsx play_interactive.ts <packageId> "[scene start]"
 *   - Subsequent: npx tsx play_interactive.ts <sessionId> "my free-text action"
 *
 * Runs exactly ONE turn, prints frames, saves session state, exits.
 * The caller (Claude) reads output and decides the next action.
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';
import { db } from './server/db/index.js';
import { plotStates, vnPackages } from './server/db/schema.js';
import { eq } from 'drizzle-orm';
import { createStorytellerAgent } from './server/vn/agents/storytellerChatAgent.js';
import type { VNPackage } from './server/vn/types/vnTypes.js';
import { compressContext, summarizeNodeInBackground, sanitizeHistory } from './server/vn/utils/contextCompressor.js';
import { startLLMTrace, getActiveModelInfo } from './server/lib/modelFactory.js';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';

const argId = process.argv[2];
const playerAction = process.argv.slice(3).join(' ') || '[scene start]';

if (!argId) {
  console.error('Usage: npx tsx play_interactive.ts <packageId|sessionId> "<action>"');
  process.exit(1);
}

// Session state file — persists messages between turns
const STATE_DIR = '/tmp/vn_play_state';

async function run() {
  let packageId = argId;
  let sessionId = '';
  let messages: any[] = [];
  let vnPackage: VNPackage;
  let isNew = false;

  // Check if arg is an existing session
  const existingSession = db.select().from(plotStates).where(eq(plotStates.sessionId, argId)).get();

  if (existingSession) {
    // Resume existing session
    sessionId = argId;
    packageId = existingSession.packageId;

    // Load messages from state file
    const stateFile = `${STATE_DIR}/${sessionId}.json`;
    if (existsSync(stateFile)) {
      messages = JSON.parse(readFileSync(stateFile, 'utf-8'));
    }
  } else {
    // Check if it's a package ID
    const pkgRow = db.select().from(vnPackages).where(eq(vnPackages.id, argId)).get();
    if (!pkgRow) {
      console.error(`Neither session nor package found for: ${argId}`);
      process.exit(1);
    }

    // New session
    sessionId = randomUUID();
    isNew = true;
    vnPackage = JSON.parse(pkgRow.metaJson) as VNPackage;

    const startingActId = vnPackage.plot.acts[0]?.id;
    const startingLocationId = vnPackage.plot.acts[0]?.sandboxLocations?.[0]?.id || '';

    db.insert(plotStates).values({
      sessionId,
      packageId,
      currentActId: startingActId,
      currentLocationId: startingLocationId,
      currentBeat: 0,
      offPathTurns: 0,
      flagsJson: '{}',
      completedLocations: '[]',
      playerStatsJson: '{}',
      updatedAt: new Date().toISOString(),
    } as any).run();
  }

  // Load package
  const pkgRow = db.select().from(vnPackages).where(eq(vnPackages.id, packageId)).get();
  if (!pkgRow) { console.error('Package not found'); process.exit(1); }
  vnPackage = JSON.parse(pkgRow.metaJson) as VNPackage;

  // Ensure state dir exists
  if (!existsSync(STATE_DIR)) {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(STATE_DIR, { recursive: true });
  }

  // Add player action to messages
  if (messages.length === 0) {
    messages = [{ role: 'user', content: [{ type: 'text', text: playerAction }] }];
  } else {
    messages.push({ role: 'user', content: [{ type: 'text', text: playerAction }] });
  }

  // Print session info
  const dbState = db.select().from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
  console.log(`SESSION=${sessionId}`);
  console.log(`ACT=${dbState?.currentActId || '?'}`);
  console.log(`LOCATION=${dbState?.currentLocationId || '?'}`);
  console.log(`PROGRESSION=${dbState?.globalProgression || 0}`);
  console.log(`TURN=${dbState?.turnCount || 0}`);
  const flags = JSON.parse(dbState?.flagsJson || '{}');
  if (Object.keys(flags).length > 0) console.log(`FLAGS=${JSON.stringify(flags)}`);
  console.log('---');

  // Create agent
  const agent = createStorytellerAgent(vnPackage!, sessionId);

  // Pre-fetch plot state
  const preTurnState = db.select({ currentLocationId: plotStates.currentLocationId, storySummary: plotStates.storySummary }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
  let compressedMessages = await compressContext(messages, sessionId, preTurnState?.storySummary || '') as any[];

  // Pre-fetch plotState for Director guidance
  let plotStateResult: any = null;
  try {
    const lastUserMsg = compressedMessages.filter((m: any) => m.role === 'user').pop();
    const playerQuery = typeof lastUserMsg?.content === 'string'
      ? lastUserMsg.content
      : (lastUserMsg?.content ?? []).map((c: any) => c.text || '').join(' ');
    if (typeof (agent as any).preFetchPlotState === 'function') {
      plotStateResult = await (agent as any).preFetchPlotState(playerQuery);
    }
  } catch (err: any) {
    console.log(`[plotState error]: ${err?.message?.slice(0, 200)}`);
  }

  // Inject Director context
  let messagesForAgent = compressedMessages;
  if (plotStateResult) {
    const lastIdx = compressedMessages.length - 1;
    const lastMsg = compressedMessages[lastIdx];
    const lastContent = typeof lastMsg.content === 'string'
      ? lastMsg.content
      : (lastMsg.content || []).map((c: any) => c.text || '').join(' ');
    const briefJson = JSON.stringify(plotStateResult);
    const enrichedText = `[DIRECTOR_CONTEXT — treat as plotStateTool result]\n${briefJson}\n\n[PLAYER_INPUT]\n${lastContent}`;
    messagesForAgent = [
      ...compressedMessages.slice(0, lastIdx),
      { role: 'user' as const, content: [{ type: 'text' as const, text: enrichedText }] },
    ];
  }

  // Run one turn
  const { provider, modelId } = getActiveModelInfo('storyteller');
  const { traceId, onStepFinish: traceOnStepFinish, finishTrace } = startLLMTrace({
    sessionId, pipeline: 'vn-tell-chat', agentId: 'storyteller-chat-agent',
    modelProvider: provider, modelId, tags: ['agent', 'storyteller', 'interactive'], source: 'play_interactive',
  }, { pipeline: 'vn-tell-chat', sessionId });

  let frameCount = 0;
  let lastOptions: any[] = [];
  let lastDiceRoll: any = null;
  let needsDiceContinuation = false;

  // Dice continuation loop
  let diceLoop = true;
  while (diceLoop) {
    lastOptions = [];
    lastDiceRoll = null;

    const result = await agent.stream({
      messages: messagesForAgent,
      onStepFinish: (stepResult: any) => {
        traceOnStepFinish(stepResult);
      },
      timeout: 120_000,
    });

    let lastFrameType = '';

    for await (const event of result.fullStream) {
      if (event.type === 'tool-result' && event.toolName === 'frameBuilderTool') {
        frameCount++;
        const frame = (event.output as any)?.frame ?? {};
        const input = (event as any).input ?? {};
        const type = frame.type || input?.type || 'unknown';
        lastFrameType = type;

        console.log(`\nFRAME_${frameCount} type=${type}`);

        // Narrations
        const narrations = frame.narrations ?? input?.narrations ?? [];
        for (const n of narrations) {
          const eff = n.effect ? ` [${n.effect.type}]` : '';
          console.log(`  NAR: ${n.text}${eff}`);
        }

        // Conversation
        const conversation = frame.conversation ?? input?.conversation ?? [];
        for (const line of conversation) {
          const eff = line.effect ? ` [${line.effect.type}]` : '';
          if ('narrator' in line) {
            console.log(`  DESC: ${(line as any).narrator}${eff}`);
          } else {
            console.log(`  SPEAK[${(line as any).speaker}]: ${(line as any).text}${eff}`);
          }
        }

        // Effects / Audio
        const effects = frame.effects ?? input?.effects ?? [];
        if (effects.length > 0) console.log(`  FX: ${effects.map((e: any) => e.type).join(', ')}`);
        const audio = frame.audio ?? input?.audio;
        if (audio?.musicAsset) console.log(`  MUSIC: ${audio.musicAsset}`);

        // Dice roll
        const diceRoll = frame.diceRoll ?? input?.diceRoll;
        if (diceRoll) {
          lastDiceRoll = diceRoll;
          console.log(`  DICE: ${diceRoll.diceNotation} (${diceRoll.description || ''})`);
        }

        // Skill check
        const skillCheck = frame.skillCheck ?? input?.skillCheck;
        if (skillCheck) {
          console.log(`  CHECK: ${skillCheck.stat} DC${skillCheck.difficulty}: ${skillCheck.roll}+${skillCheck.modifier}=${skillCheck.total} → ${skillCheck.succeeded ? 'SUCCESS' : 'FAIL'}`);
        }

        // Choices
        const choices = frame.choices ?? input?.choices ?? [];
        if (type === 'choice' && choices.length > 0) {
          lastOptions = choices;
          console.log(`  CHOICES:`);
          choices.forEach((c: any, i: number) => {
            console.log(`    [${i + 1}] ${c.text}`);
          });
          if (frame.showFreeTextInput ?? input?.showFreeTextInput) {
            console.log(`    [free text accepted]`);
          }
        }

        // Transition
        const transition = frame.transition ?? input?.transition;
        if (transition) {
          console.log(`  TRANSITION: ${transition.type}${transition.titleCard ? ' — ' + transition.titleCard : ''}`);
        }

        // Item
        const item = frame.itemPresentation ?? input?.itemPresentation;
        if (item) {
          console.log(`  ITEM: ${item.itemName} — ${item.description || ''}`);
        }
      }
    }

    // Append response to history
    const text = await result.text;
    const resp = await result.response;
    messages = sanitizeHistory([...messages, ...(resp.messages as any[])]);

    if (lastFrameType === 'dice-roll' && lastDiceRoll) {
      // Auto-roll dice and continue
      const notation = lastDiceRoll.diceNotation ?? '2d6';
      const match = notation.match(/(\d+)d(\d+)/);
      const [count, sides] = match ? [+match[1], +match[2]] : [2, 6];
      let total = 0;
      for (let i = 0; i < count; i++) total += Math.floor(Math.random() * sides) + 1;
      console.log(`\nDICE_RESULT: ${notation} = ${total}`);
      messages.push({ role: 'user', content: [{ type: 'text', text: `[dice-result] ${total}` }] });
      const freshState = db.select({ storySummary: plotStates.storySummary }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
      messagesForAgent = await compressContext(messages, sessionId, freshState?.storySummary || '') as any[];
      // Continue dice loop
    } else {
      diceLoop = false;
    }
  }

  finishTrace('success');

  // Increment turn count
  const currentState = db.select({ turnCount: plotStates.turnCount }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
  if (currentState) {
    db.update(plotStates)
      .set({ turnCount: (currentState.turnCount ?? 0) + 1 })
      .where(eq(plotStates.sessionId, sessionId))
      .run();
  }

  // Check location transition
  if (preTurnState) {
    const postTurnState = db.select({ currentLocationId: plotStates.currentLocationId }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
    if (postTurnState && postTurnState.currentLocationId !== preTurnState.currentLocationId) {
      console.log(`\nLOCATION_CHANGE: ${preTurnState.currentLocationId} → ${postTurnState.currentLocationId}`);
      await summarizeNodeInBackground(sessionId, messages as any[], preTurnState.storySummary);
    }
  }

  // Save messages for next turn
  writeFileSync(`${STATE_DIR}/${sessionId}.json`, JSON.stringify(messages));

  // Print final state
  const finalState = db.select().from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
  console.log(`\n---`);
  console.log(`NEXT_SESSION=${sessionId}`);
  console.log(`FRAMES_THIS_TURN=${frameCount}`);
  console.log(`FLAGS=${JSON.stringify(JSON.parse(finalState?.flagsJson || '{}'))}`);
  console.log(`PROGRESSION=${finalState?.globalProgression || 0}`);
  console.log(`ACT=${finalState?.currentActId || '?'}`);
}

run().catch(err => {
  console.error('FATAL:', err.message || err);
  process.exit(1);
});
