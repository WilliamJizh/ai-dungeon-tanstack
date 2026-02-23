import 'dotenv/config';
import { randomUUID } from 'crypto';
import { db } from './server/db/index.js';
import { plotStates, vnPackages } from './server/db/schema.js';
import { eq } from 'drizzle-orm';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createStorytellerAgent } from './server/vn/agents/storytellerChatAgent.js';
import type { VNPackage } from './server/vn/types/vnTypes.js';
import { compressContext, summarizeNodeInBackground } from './server/vn/utils/contextCompressor.js';
import { startLLMTrace, MODEL_IDS } from './server/lib/modelFactory.js';

// Get the package ID from the args or use the one we just generated
const cliArgs = process.argv.slice(2);
const packageId = cliArgs[0] || 'e527a879-ef93-41b3-958c-b7540ae0bc47'; // The ID of the generated "Shadows of Blackwood"

async function run() {
    console.log(`\nInitializing Storyteller (DM) for package: ${packageId}\n`);

    // 1. Fetch package
    const pkgRow = db.select().from(vnPackages).where(eq(vnPackages.id, packageId)).get();
    if (!pkgRow) {
        console.error(`Package ${packageId} not found in DB.`);
        process.exit(1);
    }
    const vnPackage = JSON.parse(pkgRow.metaJson) as VNPackage;

    // 2. Initialize plot state
    const sessionId = randomUUID();
    console.log(`Session ID: ${sessionId}`);

    const startingActId = vnPackage.plot.acts[0]?.id;
    const startingNodeId = vnPackage.plot.acts[0]?.nodes[0]?.id;
    if (!startingActId || !startingNodeId) {
        console.error(`No starting act or node found in package.`);
        process.exit(1);
    }

    db.insert(plotStates).values({
        sessionId,
        packageId,
        currentActId: startingActId,
        currentNodeId: startingNodeId,
        currentBeat: 0,
        offPathTurns: 0,
        flagsJson: '{}',
        completedNodes: '[]',
        playerStatsJson: '{}',
        updatedAt: new Date().toISOString(),
    } as any).run();

    // 3. Create the real ToolLoopAgent — this runs the full loop with tool execution + schema validation
    const agent = createStorytellerAgent(vnPackage, sessionId);
    const rl = readline.createInterface({ input, output });

    console.log('----------------------------------------------------');
    console.log(`Starting Adventure: ${vnPackage.title}`);
    console.log('----------------------------------------------------');

    let keepPlaying = true;
    // Use ModelMessage format (not UIMessage format) for agent.generate()
    let messages: any[] = [
        { role: 'user', content: [{ type: 'text', text: '[scene start]' }] }
    ];
    let frameCount = 1;

    while (keepPlaying) {
        console.log('\n[DM is thinking...]\n');

        const preTurnState = db.select({ currentNodeId: plotStates.currentNodeId, storySummary: plotStates.storySummary }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
        const compressedMessages = await compressContext(messages, sessionId, preTurnState?.storySummary || '') as any[];

        console.log(`\n[DEBUG] Sending ${compressedMessages.length} messages to AI SDK.`);
        console.log(`[DEBUG] Roles sequence: ${compressedMessages.map((m: any) => m.role).join(' -> ')}`);

        // Create a per-turn trace — the model middleware auto-captures everything
        const { traceId, onStepFinish, finishTrace } = startLLMTrace({
            sessionId,
            pipeline: 'vn-tell-chat', agentId: 'storyteller-chat-agent',
            modelProvider: 'google', modelId: MODEL_IDS.storyteller,
            tags: ['agent', 'storyteller', 'cli'], source: 'test_storyteller',
        }, { pipeline: 'vn-tell-chat', sessionId });

        try {
            // Use agent.generate() — this runs the FULL ToolLoopAgent loop,
            // executing tools, validating schemas, and stopping on stopWhen conditions.
            const result = await agent.generate({ messages: compressedMessages });

            // Feed each step to the tracer so tool calls + results are recorded
            for (const step of result.steps) {
                onStepFinish(step);
            }
            finishTrace('success');

            let waitingFor: 'choice' | 'free-text' | 'continue' | 'dice-result' | 'combat-result' | null = null;
            let options: any[] = [];
            let lastDiceRoll: any = null;

            if (result.text && result.text.trim()) {
                console.log(`\n💬 [DM Text]:\n${result.text}`);
            }

            // Read frames from tool results across ALL steps (the agent may run multiple LLM turns)
            for (const step of result.steps) {
                for (const toolResult of step.toolResults ?? []) {
                    const toolName = toolResult.toolName;
                    const toolOutput = toolResult.output;

                    if (toolName === 'frameBuilderTool') {
                        const frame = (toolOutput as any)?.frame ?? {};
                        const input = toolResult.input as any;
                        const type = frame.type || input?.type || 'unknown';

                        console.log(`\n🎞️  [Frame ${frameCount++}: ${type}]`);

                        // Show panels / assets
                        const panels = frame.panels ?? input?.panels ?? [];
                        if (Array.isArray(panels) && panels.length > 0) {
                            const assets = panels
                                .map((p: any) => p.characterAsset || p.backgroundAsset || '')
                                .filter(Boolean)
                                .join(', ');
                            if (assets) console.log(`   🎨 Assets: ${assets}`);
                        }

                        // Show narrations (new array) or legacy narration
                        const narrations = frame.narrations ?? input?.narrations;
                        const narration = frame.narration ?? input?.narration;
                        if (Array.isArray(narrations) && narrations.length > 0) {
                            narrations.forEach((n: any) => {
                                const eff = n.effect ? ` [${n.effect.type}]` : '';
                                console.log(`   📜 ${n.text}${eff}`);
                            });
                        } else if (narration?.text) {
                            console.log(`   📜 ${narration.text}`);
                        }

                        // Show conversation (new array) or legacy dialogue
                        const conversation = frame.conversation ?? input?.conversation;
                        const dialogue = frame.dialogue ?? input?.dialogue;
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
                        const effects = frame.effects ?? input?.effects ?? [];
                        if (Array.isArray(effects) && effects.length > 0) {
                            console.log(`   ✨ Effects: ${effects.map((e: any) => e.type).join(', ')}`);
                        }

                        // Show audio
                        const audio = frame.audio ?? input?.audio;
                        if (audio?.musicAsset) {
                            console.log(`   🎵 Music: ${audio.musicAsset}${audio.fadeIn ? ' (fade-in)' : ''}`);
                        }

                        // Show dice roll
                        const diceRoll = frame.diceRoll ?? input?.diceRoll;
                        if (diceRoll) {
                            lastDiceRoll = diceRoll;
                            console.log(`   🎲 ${diceRoll.diceNotation} → ${diceRoll.roll ?? '?'} (${diceRoll.description ?? ''})`);
                        }

                        // Show skill check
                        const skillCheck = frame.skillCheck ?? input?.skillCheck;
                        if (skillCheck) {
                            console.log(`   📊 ${skillCheck.stat} DC${skillCheck.difficulty}: ${skillCheck.roll}+${skillCheck.modifier ?? 0}=${skillCheck.total} → ${skillCheck.succeeded ? 'SUCCESS' : 'FAILURE'}`);
                        }

                        // Show choices
                        const choices = frame.choices ?? input?.choices;
                        if (type === 'choice' && Array.isArray(choices) && choices.length > 0) {
                            console.log('\n❓ What do you do?');
                            options = choices;
                            choices.forEach((c: any, i: number) => {
                                console.log(`  [${i + 1}] ${c.text}`);
                            });
                            const showFree = frame.showFreeTextInput ?? input?.showFreeTextInput;
                            if (showFree) console.log(`  [Or type any action]`);
                        } else if (frame.showFreeTextInput ?? input?.showFreeTextInput) {
                            options = frame.choices ?? input?.choices ?? [];
                            if (options.length > 0) {
                                console.log('\n❓ What do you do?');
                                options.forEach((c: any, i: number) => {
                                    console.log(`  [${i + 1}] ${c.text}`);
                                });
                                console.log(`  [Or type any action]`);
                            }
                        } else if (type === 'choice') {
                            // Choice frame with no explicit choices — still prompt player
                            console.log('\n❓ What do you do?');
                            console.log('  [Type any action]');
                        }

                        // Debug: if frame was empty, dump raw input to diagnose
                        if (!conversation?.length && !narrations?.length && !dialogue?.text && !narration?.text && type === 'unknown') {
                            console.log(`   [RAW INPUT]: ${JSON.stringify(input, null, 2).substring(0, 200)}`);
                        }

                    } else if (toolName === 'yieldToPlayer') {
                        waitingFor = (toolResult.input as any)?.waitingFor ?? 'choice';

                    } else if (toolName === 'nodeCompleteTool') {
                        const out = toolOutput as any;
                        console.log(`\n✅ Node Complete: ${out?.completedNodeId ?? '(node)'}`);
                        if (out?.isGameComplete) {
                            console.log(`\n🎉 GAME OVER!`);
                            keepPlaying = false;
                        }

                    } else if (toolName === 'plotStateTool') {
                        // silent — just shows the DM is tracking narrative beats
                    }
                }
            }

            // Build the next messages array by appending result.response.messages
            // This is the proper way to continue a multi-turn conversation with the AI SDK
            messages.push(...(result.response.messages as any[]));

            // Check for node transitions to trigger summarization
            if (preTurnState) {
                const postTurnState = db.select({ currentNodeId: plotStates.currentNodeId }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
                if (postTurnState && postTurnState.currentNodeId !== preTurnState.currentNodeId) {
                    console.log(`\n[Node Transition: ${preTurnState.currentNodeId} -> ${postTurnState.currentNodeId}. Summarizing previous scene...]`);
                    // We DO await this in the CLI to keep console output clean, though it's fire-and-forget in HTTP
                    await summarizeNodeInBackground(sessionId, messages, preTurnState.storySummary);
                }
            }

            if (!keepPlaying) break;

            // Prompt for player input
            const ask = async (prompt: string) => {
                try { return await rl.question(prompt); }
                catch { keepPlaying = false; return 'exit'; }
            };

            if (waitingFor === 'dice-result') {
                // Simulate physics dice roll for CLI
                const notation = lastDiceRoll?.diceNotation ?? '1d20';
                const match = notation.match(/(\d+)d(\d+)/);
                const [count, sides] = match ? [+match[1], +match[2]] : [1, 20];
                let total = 0;
                for (let i = 0; i < count; i++) total += Math.floor(Math.random() * sides) + 1;
                console.log(`\n🎲 You rolled: ${total}`);
                messages.push({ role: 'user', content: [{ type: 'text', text: `[dice-result] ${total}` }] });
            } else if (waitingFor === 'choice' || waitingFor === 'free-text' || options.length > 0) {
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
            } else if (waitingFor === 'continue') {
                await ask('\n[Press Enter to continue...]');
                messages.push({ role: 'user', content: [{ type: 'text', text: 'Player continues.' }] });
            } else {
                console.log('\n[No player input required this turn — type a free action or "exit"]');
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
