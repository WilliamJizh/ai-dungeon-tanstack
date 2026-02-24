import 'dotenv/config';
import { randomUUID } from 'crypto';
import { db } from './server/db/index.js';
import { plotStates, vnPackages } from './server/db/schema.js';
import { eq } from 'drizzle-orm';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createStorytellerAgent } from './server/vn/agents/storytellerChatAgent.js';
import type { VNPackage } from './server/vn/types/vnTypes.js';
import { compressContext, summarizeNodeInBackground, sanitizeHistory } from './server/vn/utils/contextCompressor.js';
import { startLLMTrace, getActiveModelInfo } from './server/lib/modelFactory.js';

// Get the package ID or session ID from the args
const cliArgs = process.argv.slice(2);
const argId = cliArgs[0] || 'e527a879-ef93-41b3-958c-b7540ae0bc47';

async function run() {
    console.log(`\nInitializing Storyteller (DM)...`);

    let packageId = argId;
    let sessionId = randomUUID();
    let isResuming = false;
    let existingSummary = '';
    let startingLocationId = '';

    // Check if arg is a sessionId
    const existingSession = db.select().from(plotStates).where(eq(plotStates.sessionId, argId)).get();
    if (existingSession) {
        console.log(`Resuming existing session: ${argId}`);
        sessionId = argId;
        packageId = existingSession.packageId;
        isResuming = true;
        existingSummary = existingSession.storySummary || '';
        startingLocationId = existingSession.currentLocationId || '';
    } else {
        console.log(`Starting new session: ${sessionId}`);
    }

    // 1. Fetch package
    const pkgRow = db.select().from(vnPackages).where(eq(vnPackages.id, packageId)).get();
    if (!pkgRow) {
        console.error(`Package ${packageId} not found in DB.`);
        process.exit(1);
    }
    const vnPackage = JSON.parse(pkgRow.metaJson) as VNPackage;

    // 2. Initialize plot state (if new)
    if (!isResuming) {
        const startingActId = vnPackage.plot.acts[0]?.id;
        startingLocationId = vnPackage.plot.acts[0]?.sandboxLocations?.[0]?.id || '';
        if (!startingActId || !startingLocationId) {
            console.error(`No starting act or node found in package.`);
            process.exit(1);
        }

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

    // 3. Create the real ToolLoopAgent — this runs the full loop with tool execution + schema validation
    const agent = createStorytellerAgent(vnPackage, sessionId);
    const rl = readline.createInterface({ input, output });

    console.log('----------------------------------------------------');
    console.log(`Adventure: ${vnPackage.title}`);
    console.log('----------------------------------------------------');

    let keepPlaying = true;
    let messages: any[] = [];

    if (isResuming && existingSession) {
        const flags = JSON.parse(existingSession.flagsJson || '{}');
        const stats = JSON.parse(existingSession.playerStatsJson || '{}');
        const completed: string[] = JSON.parse(existingSession.completedLocations || '[]');

        // Print recap for the player
        console.log(`📖 Resuming session: ${sessionId}`);
        console.log(`📍 Location: ${startingLocationId}`);
        console.log(`🎭 Act: ${existingSession.currentActId}`);
        if (completed.length) console.log(`✅ Completed: ${completed.join(', ')}`);
        if (Object.keys(flags).length) console.log(`🏷️  Flags: ${JSON.stringify(flags)}`);
        if (stats.hp != null) console.log(`📊 Stats: HP ${stats.hp}/${stats.maxHp}, Level ${stats.level ?? 1}`);
        if (existingSummary) {
            console.log(`\n📜 Previously on this adventure...\n${existingSummary}`);
        }
        console.log('----------------------------------------------------');

        // Build rich context message for the agent
        const parts = [
            `[system: resuming session]`,
            `Current location: ${startingLocationId}`,
            `Current act: ${existingSession.currentActId}`,
        ];
        if (existingSummary) parts.push(`Story so far: ${existingSummary}`);
        if (completed.length) parts.push(`Completed locations: ${completed.join(', ')}`);
        if (Object.keys(flags).length) parts.push(`Active flags: ${JSON.stringify(flags)}`);
        if (stats.hp != null) parts.push(`Player: HP ${stats.hp}/${stats.maxHp}, Level ${stats.level ?? 1}`);

        messages = [
            { role: 'user', content: [{ type: 'text', text: parts.join('\n') }] }
        ];
    } else {
        messages = [
            { role: 'user', content: [{ type: 'text', text: '[scene start]' }] }
        ];
    }

    let frameCount = 1;

    while (keepPlaying) {
        console.log('\n[DM is thinking...]\n');

        const preTurnState = db.select({ currentLocationId: plotStates.currentLocationId, storySummary: plotStates.storySummary }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
        let compressedMessages = await compressContext(messages, sessionId, preTurnState?.storySummary || '') as any[];

        console.log(`\n[DEBUG] Sending ${compressedMessages.length} messages to AI SDK.`);
        console.log(`[DEBUG] Roles sequence: ${compressedMessages.map((m: any) => m.role).join(' -> ')}`);

        // Create a per-turn trace — the model middleware auto-captures everything
        const { provider, modelId } = getActiveModelInfo('storyteller');
        const { traceId, onStepFinish: traceOnStepFinish, finishTrace } = startLLMTrace({
            sessionId,
            pipeline: 'vn-tell-chat', agentId: 'storyteller-chat-agent',
            modelProvider: provider, modelId: modelId,
            tags: ['agent', 'storyteller', 'cli'], source: 'test_storyteller',
        }, { pipeline: 'vn-tell-chat', sessionId });

        try {
            // Shared state mutated during stream consumption
            let lastFrameType: string = '';
            let options: any[] = [];
            let lastDiceRoll: any = null;
            let gameComplete = false;

            // Render a single tool result — called from fullStream for real-time output
            const renderToolResult = (toolName: string, toolInput: any, toolOutput: any) => {
                if (toolName === 'frameBuilderTool') {
                    const frame = (toolOutput as any)?.frame ?? {};
                    const type = frame.type || toolInput?.type || 'unknown';
                    lastFrameType = type;

                    console.log(`\n🎞️  [Frame ${frameCount++}: ${type}]`);

                    // Show panels / assets
                    const panels = frame.panels ?? toolInput?.panels ?? [];
                    if (Array.isArray(panels) && panels.length > 0) {
                        const assets = panels
                            .map((p: any) => p.characterAsset || p.backgroundAsset || '')
                            .filter(Boolean)
                            .join(', ');
                        if (assets) console.log(`   🎨 Assets: ${assets}`);
                    }

                    // Show narrations (new array) or legacy narration
                    const narrations = frame.narrations ?? toolInput?.narrations;
                    const narration = frame.narration ?? toolInput?.narration;
                    if (Array.isArray(narrations) && narrations.length > 0) {
                        narrations.forEach((n: any) => {
                            const eff = n.effect ? ` [${n.effect.type}]` : '';
                            console.log(`   📜 ${n.text}${eff}`);
                        });
                    } else if (narration?.text) {
                        console.log(`   📜 ${narration.text}`);
                    }

                    // Show conversation (new array) or legacy dialogue
                    const conversation = frame.conversation ?? toolInput?.conversation;
                    const dialogue = frame.dialogue ?? toolInput?.dialogue;
                    if (Array.isArray(conversation) && conversation.length > 0) {
                        conversation.forEach((line: any) => {
                            const eff = line.effect ? ` [${line.effect.type}]` : '';
                            if (line.isNarrator) {
                                console.log(`   📝 ${line.text}${eff}`);
                            } else {
                                console.log(`   🗣️  ${line.speaker}: "${line.text}"${eff}`);
                            }
                        });
                    } else if (dialogue?.text) {
                        console.log(`   🗣️  ${dialogue.speaker || 'Character'}: "${dialogue.text}"`);
                    }

                    // Show effects
                    const effects = frame.effects ?? toolInput?.effects ?? [];
                    if (Array.isArray(effects) && effects.length > 0) {
                        console.log(`   ✨ Effects: ${effects.map((e: any) => e.type).join(', ')}`);
                    }

                    // Show audio
                    const audio = frame.audio ?? toolInput?.audio;
                    if (audio?.musicAsset) {
                        console.log(`   🎵 Music: ${audio.musicAsset}${audio.fadeIn ? ' (fade-in)' : ''}`);
                    }

                    // Show dice roll
                    const diceRoll = frame.diceRoll ?? toolInput?.diceRoll;
                    if (diceRoll) {
                        lastDiceRoll = diceRoll;
                        console.log(`   🎲 ${diceRoll.diceNotation} → ${diceRoll.roll ?? '?'} (${diceRoll.description ?? ''})`);
                    }

                    // Show skill check
                    const skillCheck = frame.skillCheck ?? toolInput?.skillCheck;
                    if (skillCheck) {
                        console.log(`   📊 ${skillCheck.stat} DC${skillCheck.difficulty}: ${skillCheck.roll}+${skillCheck.modifier ?? 0}=${skillCheck.total} → ${skillCheck.succeeded ? 'SUCCESS' : 'FAILURE'}`);
                    }

                    // Show item presentation
                    const itemPres = frame.itemPresentation ?? toolInput?.itemPresentation;
                    if (itemPres) {
                        console.log(`\n   🎁 [ITEM AQUIRED]: ${itemPres.itemName}`);
                        if (itemPres.description) console.log(`      ${itemPres.description}`);
                    }

                    // Show cg presentation
                    const cgPres = frame.cgPresentation ?? toolInput?.cgPresentation;
                    if (cgPres) {
                        console.log(`\n   🖼️  [EVENT CG: ${cgPres.emotion || 'neutral'}]`);
                        if (cgPres.description) console.log(`      ${cgPres.description}`);
                    }

                    // Show centered monologue
                    const monologue = frame.monologue ?? toolInput?.monologue;
                    if (monologue) {
                        console.log(`\n       *** ${monologue.speaker ? monologue.speaker + ': ' : ''}${monologue.text} ***\n`);
                    }

                    // Show investigation
                    const invData = frame.investigationData ?? toolInput?.investigationData;
                    if (invData && Array.isArray(invData.hotspots)) {
                        console.log(`\n   🔍 [INVESTIGATION SCENE]`);
                        invData.hotspots.forEach((h: any, i: number) => {
                            console.log(`      - ${h.label} (ID: ${h.id})`);
                        });
                    }

                    // Show lore unlock
                    const lore = frame.loreEntry ?? toolInput?.loreEntry;
                    if (lore) {
                        console.log(`\n   📚 === LORE UNLOCKED: ${lore.title} [${lore.category}] ===`);
                        console.log(`      ${lore.content}`);
                    }

                    // Show dynamic cut-in
                    const cutIn = frame.cutIn ?? toolInput?.cutIn;
                    if (cutIn) {
                        const styleStr = cutIn.style === 'shout' ? '💥' : cutIn.style === 'critical' ? '⚡' : '💭';
                        console.log(`   ${styleStr} [CUT-IN: ${cutIn.speaker}] "${cutIn.text}"`);
                    }

                    // Show flashback
                    const flashback = frame.flashback ?? toolInput?.flashback;
                    if (flashback) {
                        console.log(`   ⏪ [FLASHBACK: ${flashback.filter || 'sepia'}] ${flashback.text}`);
                    }

                    // Show cross-examination
                    const crossExam = frame.crossExamination ?? toolInput?.crossExamination;
                    if (crossExam) {
                        console.log(`\n   ⚖️  [CROSS-EXAMINATION: ${crossExam.speaker}]`);
                        console.log(`      "${crossExam.statement}"`);
                    }

                    // Show time limit
                    const timeLimit = frame.timeLimit ?? toolInput?.timeLimit;
                    if (timeLimit) {
                        console.log(`\n   ⏱️  [WARNING: ${timeLimit.seconds}s TIME LIMIT]`);
                        console.log(`      ${timeLimit.text}`);
                    }

                    // Show choices
                    const choices = frame.choices ?? toolInput?.choices;
                    if (type === 'choice' && Array.isArray(choices) && choices.length > 0) {
                        console.log('\n❓ What do you do?');
                        options = choices;
                        choices.forEach((c: any, i: number) => {
                            console.log(`  [${i + 1}] ${c.text}`);
                        });
                        const showFree = frame.showFreeTextInput ?? toolInput?.showFreeTextInput;
                        if (showFree) console.log(`  [Or type any action]`);
                    } else if (frame.showFreeTextInput ?? toolInput?.showFreeTextInput) {
                        options = frame.choices ?? toolInput?.choices ?? [];
                        if (options.length > 0) {
                            console.log('\n❓ What do you do?');
                            options.forEach((c: any, i: number) => {
                                console.log(`  [${i + 1}] ${c.text}`);
                            });
                            console.log(`  [Or type any action]`);
                        }
                    } else if (type === 'choice') {
                        console.log('\n❓ What do you do?');
                        console.log('  [Type any action]');
                    }

                    // Debug: if frame was empty, dump raw input to diagnose
                    if (!conversation?.length && !narrations?.length && !dialogue?.text && !narration?.text && type === 'unknown') {
                        console.log(`   [RAW INPUT]: ${JSON.stringify(toolInput, null, 2).substring(0, 200)}`);
                    }

                } else if (toolName === 'nodeCompleteTool') {
                    const out = toolOutput as any;
                    console.log(`\n✅ Location Complete: ${out?.completedLocationId ?? '(location)'}`);
                    if (out?.isGameComplete) {
                        console.log(`\n🎉 GAME OVER!`);
                        gameComplete = true;
                    }
                }
                // plotStateTool, recordPlayerActionTool, etc. are silent
            };

            // Outer loop: turn-level frame retry (nudges model if entire turn produces 0 frames)
            // Inner loop: dice continuation (re-runs agent after player rolls dice)
            let retryCount = 0;
            const MAX_RETRIES = 2;
            let turnDone = false;
            while (!turnDone) {
                let totalFrames = 0;

                // ── Inner: dice-continuation loop ──────────────────────────────
                let diceLoop = true;
                while (diceLoop) {
                    lastFrameType = '';
                    options = [];
                    lastDiceRoll = null;

                    const result = await agent.stream({
                        messages: compressedMessages,
                        onStepFinish: traceOnStepFinish,
                        timeout: 120_000,
                    });

                    // Consume fullStream — tool-result events fire immediately per-tool,
                    // giving real-time frame rendering instead of waiting for all steps.
                    for await (const event of result.fullStream) {
                        if (event.type === 'tool-result') {
                            const toolOutput = event.output as any;
                            if (event.toolName === 'frameBuilderTool' && toolOutput?.ok) {
                                totalFrames++;
                            }
                            renderToolResult(event.toolName, (event as any).input, event.output);
                        }
                    }

                    // Stream fully consumed — promises resolve immediately
                    const text = await result.text;
                    if (text && text.trim()) {
                        console.log(`\n💬 [DM Text]:\n${text}`);
                    }

                    // Append response messages to conversation history
                    const resp = await result.response;
                    const appendRaw = resp.messages as any[];
                    const combined = [...messages, ...appendRaw];
                    messages = sanitizeHistory(combined);

                    if (gameComplete) {
                        keepPlaying = false;
                        diceLoop = false;
                    } else if (lastFrameType === 'dice-roll') {
                        // Dice roll frame — player presses Enter, we compute the result
                        try { await rl.question('\n🎲 [Press Enter to roll...]'); }
                        catch { keepPlaying = false; break; }

                        const notation = lastDiceRoll?.diceNotation ?? '1d20';
                        const match = notation.match(/(\d+)d(\d+)/);
                        const [count, sides] = match ? [+match[1], +match[2]] : [1, 20];
                        let total = 0;
                        for (let i = 0; i < count; i++) total += Math.floor(Math.random() * sides) + 1;
                        console.log(`🎲 You rolled: ${total}`);
                        messages.push({ role: 'user', content: [{ type: 'text', text: `[dice-result] ${total}` }] });
                        // Re-compress for next iteration
                        const freshState = db.select({ storySummary: plotStates.storySummary }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
                        compressedMessages = await compressContext(messages, sessionId, freshState?.storySummary || '') as any[];
                    } else {
                        diceLoop = false;
                    }
                }

                // ── Turn complete — check if any frames were produced ──────────
                if (!keepPlaying || gameComplete) {
                    turnDone = true;
                } else if (totalFrames === 0 && retryCount < MAX_RETRIES) {
                    retryCount++;
                    console.log(`\n[Retry ${retryCount}/${MAX_RETRIES}] No frames after turn, nudging model...`);
                    messages.push({
                        role: 'user',
                        content: [{ type: 'text', text: '[system: Continue the scene. Call frameBuilderTool with conversation[] or narrations[] to advance the narrative.]' }],
                    });
                    const freshState = db.select({ storySummary: plotStates.storySummary }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
                    compressedMessages = await compressContext(messages, sessionId, freshState?.storySummary || '') as any[];
                    // turnDone stays false → outer loop retries
                } else {
                    turnDone = true;
                }
            }

            finishTrace('success');

            // Check for location transitions to trigger summarization
            if (preTurnState) {
                const postTurnState = db.select({ currentLocationId: plotStates.currentLocationId }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
                if (postTurnState && postTurnState.currentLocationId !== preTurnState.currentLocationId) {
                    console.log(`\n[Location Transition: ${preTurnState.currentLocationId} -> ${postTurnState.currentLocationId}. Summarizing previous scene...]`);
                    await summarizeNodeInBackground(sessionId, messages as any[], preTurnState.storySummary);
                }
            }

            if (!keepPlaying) break;

            // Prompt for player input
            const ask = async (prompt: string) => {
                try { return await rl.question(prompt); }
                catch { keepPlaying = false; return 'exit'; }
            };

            if (options.length > 0) {
                const answer = await ask('\n> ');
                if (answer.toLowerCase() === 'exit' || answer.toLowerCase() === 'quit') {
                    keepPlaying = false;
                } else {
                    const optIdx = parseInt(answer) - 1;
                    const chosenText = (!isNaN(optIdx) && options[optIdx])
                        ? `Player chooses: ${options[optIdx].text}`
                        : `Player takes action: ${answer}`;
                    messages.push({ role: 'user', content: [{ type: 'text', text: chosenText }] });
                }
            } else {
                const answer = await ask('\n> ');
                if (answer.toLowerCase() === 'exit' || answer.toLowerCase() === 'quit') {
                    keepPlaying = false;
                } else {
                    messages.push({ role: 'user', content: [{ type: 'text', text: `Player: ${answer}` }] });
                }
            }

        } catch (e) {
            console.error('\n[Error computing next turn]', e);
            finishTrace('error', e);
            keepPlaying = false;
        }
    }

    rl.close();
    console.log('\n[Session ended]');
}

run();
