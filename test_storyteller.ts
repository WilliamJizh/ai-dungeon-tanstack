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
import { startLLMTrace, getActiveModelInfo, downgradeModel, resetModel, isQuotaOrRateLimitError } from './server/lib/modelFactory.js';
import { writeFileSync, appendFileSync, existsSync } from 'node:fs';

// Get the package ID or session ID from the args
const cliArgs = process.argv.slice(2);
const argId = cliArgs.find(a => !a.startsWith('--')) || 'e527a879-ef93-41b3-958c-b7540ae0bc47';
const AUTO_MODE = cliArgs.includes('--auto');
const MAX_AUTO_TURNS = parseInt(cliArgs.find(a => a.startsWith('--max-turns='))?.split('=')[1] || '200');
const LOG_FILE = `playtest_log_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.md`;

// Auto-play action pool — proactive, plot-advancing actions that trigger encounters & skill checks
const AUTO_ACTIONS = [
    'I examine the most important object here and try to figure out what it does',
    'I talk to the person here and ask them directly about the situation',
    'I decide to take action on what I just learned — what can I do next?',
    'I search this place thoroughly for anything I might have missed',
    'I want to go somewhere new — where can I travel from here?',
    'I confront the biggest problem or mystery in front of me',
    'I try to use what I found to make progress on the main objective',
    'I ask for help — is there anyone who knows more about this?',
    'I commit to solving the puzzle or challenge here before moving on',
    'Something feels off — I investigate the anomaly more closely',
    // Risky actions that should trigger dice rolls:
    'I attempt to repair or hack the device in front of me',
    'I try to sneak past the danger without being noticed',
    'I try to persuade the other person to help me, even if they seem reluctant',
    'I physically push through the obstacle blocking my path',
    'I try to decode or decipher the hidden message or signal',
];
let autoActionIdx = 0;

// Loop detection state — track recent choice sets to detect scene repetition
const recentChoiceSets: string[] = [];  // last N serialized choice arrays
const LOOP_DETECTION_WINDOW = 3;        // detect after 3 identical choice sets
let consecutiveLoopBreaks = 0;          // escalate loop-breaking strategy

function log(text: string) {
    if (AUTO_MODE) {
        appendFileSync(LOG_FILE, text + '\n');
    }
}

async function run() {
    if (AUTO_MODE) {
        console.log(`\n[AUTO-PLAY MODE] Max turns: ${MAX_AUTO_TURNS}, Log: ${LOG_FILE}`);
        writeFileSync(LOG_FILE, `# Playtest Log\n\nStarted: ${new Date().toISOString()}\nMode: AUTO-PLAY\nMax turns: ${MAX_AUTO_TURNS}\n\n---\n\n`);
    }
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
    let agent = createStorytellerAgent(vnPackage, sessionId);
    const rl = AUTO_MODE ? null : readline.createInterface({ input, output });

    console.log('----------------------------------------------------');
    console.log(`Adventure: ${vnPackage.title}`);
    console.log(`Session: ${sessionId}`);
    console.log('----------------------------------------------------');

    if (AUTO_MODE) {
        log(`## Session Info\n- Package: ${vnPackage.title}\n- Session: ${sessionId}\n- Package ID: ${packageId}\n\n---\n`);
    }

    let keepPlaying = true;
    let messages: any[] = [];
    let turnNumber = 0;
    let consecutiveSuccesses = 0;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 5;
    let endingTurnCountdown: number | null = null;
    let turnsSinceLastDiceRoll = 0; // Track dice-roll usage for hint injection

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
        turnNumber++;
        turnsSinceLastDiceRoll++;
        if (AUTO_MODE && turnNumber > MAX_AUTO_TURNS) {
            console.log(`\n[AUTO-PLAY] Max turns (${MAX_AUTO_TURNS}) reached. Stopping.`);
            log(`\n---\n\n## Auto-play stopped at turn ${turnNumber} (max turns reached)\n`);
            break;
        }
        console.log(`\n[Turn ${turnNumber} — DM is thinking...]\n`);
        if (AUTO_MODE) {
            // Log turn header with DB state
            const dbState = db.select().from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
            const flags = JSON.parse(dbState?.flagsJson || '{}');
            const flagCount = Object.keys(flags).length;
            log(`\n### Turn ${turnNumber}\n`);
            log(`- Act: ${dbState?.currentActId || '?'}`);
            log(`- Location: ${dbState?.currentLocationId || '?'}`);
            log(`- Progression: ${dbState?.globalProgression || 0}`);
            log(`- Turn Count (DB): ${dbState?.turnCount || 0}`);
            log(`- Flags (${flagCount}): ${flagCount > 0 ? JSON.stringify(flags) : 'none'}`);
            log('');
        }

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
            let lastInvestigationHotspots: any[] = [];
            let gameComplete = false;

            // Render a single tool result — called from fullStream for real-time output
            const renderToolResult = (toolName: string, toolInput: any, toolOutput: any) => {
                if (toolName === 'frameBuilderTool') {
                    const frame = (toolOutput as any)?.frame ?? {};
                    const type = frame.type || toolInput?.type || 'unknown';
                    lastFrameType = type;

                    const frameNum = frameCount++;
                    console.log(`\n🎞️  [Frame ${frameNum}: ${type}]`);

                    // Auto-mode: log frame summary
                    if (AUTO_MODE) {
                        const narrations = frame.narrations ?? toolInput?.narrations ?? [];
                        const conversation = frame.conversation ?? toolInput?.conversation ?? [];
                        const choices = frame.choices ?? toolInput?.choices ?? [];
                        const narText = narrations.map((n: any) => n.text).join(' ');
                        const convText = conversation.map((c: any) => 'narrator' in c ? `*${c.narrator}*` : `**${c.speaker}**: "${c.text}"`).join('\n  - ');
                        const choiceText = choices.map((c: any, i: number) => `  ${i + 1}. ${c.text}`).join('\n');

                        log(`**Frame ${frameNum}** (${type})`);
                        if (narText) log(`> ${narText.slice(0, 300)}${narText.length > 300 ? '...' : ''}`);
                        if (convText) log(`  - ${convText.slice(0, 400)}${convText.length > 400 ? '...' : ''}`);
                        if (choiceText) log(`Choices:\n${choiceText}`);
                        log('');
                    }

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
                            if ('narrator' in line) {
                                console.log(`   📝 ${line.narrator}${eff}`);
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
                        lastInvestigationHotspots = invData.hotspots;
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
                    lastInvestigationHotspots = [];

                    let result: any;
                    const MAX_FRAMES_PER_TURN = 20;

                    // Pre-fetch plotState via agent's bound tool (includes cache + Director invocation).
                    // DeepSeek V3.2 ignores toolChoice, so we call it externally to guarantee
                    // the Director is consulted every turn. The cache prevents double calls if
                    // the model also calls plotStateTool on its own.
                    let plotStateResult: any = null;
                    try {
                        const lastUserMsg = compressedMessages.filter((m: any) => m.role === 'user').pop();
                        const playerQuery = typeof lastUserMsg?.content === 'string'
                            ? lastUserMsg.content
                            : (lastUserMsg?.content ?? []).map((c: any) => c.text || '').join(' ');
                        if (typeof (agent as any).preFetchPlotState === 'function') {
                            plotStateResult = await (agent as any).preFetchPlotState(playerQuery);
                        }
                    } catch (psErr: any) {
                        console.log(`[plotStateTool pre-call] Error: ${psErr?.message?.slice(0, 200)}`);
                    }

                    // Inject plotState result into the last user message so the model has Director guidance.
                    // We embed it as a [DIRECTOR_CONTEXT] prefix — simpler than synthetic tool messages
                    // which fail AI SDK validation on the first turn.
                    let messagesWithPlotState = compressedMessages;
                    if (plotStateResult) {
                        const lastIdx = compressedMessages.length - 1;
                        const lastMsg = compressedMessages[lastIdx];
                        const lastContent = typeof lastMsg.content === 'string'
                            ? lastMsg.content
                            : (lastMsg.content || []).map((c: any) => c.text || '').join(' ');
                        const briefJson = JSON.stringify(plotStateResult);
                        const diceHint = turnsSinceLastDiceRoll >= 3
                            ? `\n[SYSTEM REMINDER: ${turnsSinceLastDiceRoll} turns since last dice-roll. You MUST use a dice-roll frame this turn for any uncertain action. Emit frameBuilderTool with type:"dice-roll" and diceRoll:{diceNotation:"2d6", description:"2d6 + [Stat] (+N)"}. The loop stops automatically on dice-roll.]\n`
                            : '';
                        const enrichedText = `[DIRECTOR_CONTEXT — treat as plotStateTool result]\n${briefJson}${diceHint}\n\n[PLAYER_INPUT]\n${lastContent}`;
                        messagesWithPlotState = [
                            ...compressedMessages.slice(0, lastIdx),
                            { role: 'user' as const, content: [{ type: 'text' as const, text: enrichedText }] },
                        ];
                    }

                    for (let attempt = 0; attempt < 3; attempt++) {
                        try {
                            result = await agent.stream({
                                messages: messagesWithPlotState,
                                onStepFinish: (stepResult: any) => {
                                    // Trace callback
                                    traceOnStepFinish(stepResult);

                                    // Debug: inspect step structure
                                    const trCount = stepResult.toolResults?.length ?? 0;
                                    const tcCount = stepResult.toolCalls?.length ?? 0;
                                    const contentTypes = (stepResult.content ?? []).map((p: any) => p.type).join(',');
                                    console.log(`[onStepFinish] step=${stepResult.stepNumber} reason=${stepResult.finishReason} toolCalls=${tcCount} toolResults=${trCount} content=[${contentTypes}]`);
                                    // Show tool errors
                                    for (const part of stepResult.content ?? []) {
                                        if (part.type === 'tool-error') {
                                            console.log(`  [TOOL-ERROR] ${part.toolName}: ${String(part.error?.message ?? part.error).slice(0, 200)}`);
                                        }
                                    }
                                },
                                timeout: 120_000,
                            });

                            for await (const event of result.fullStream) {
                                if (event.type === 'tool-result') {
                                    if (event.toolName === 'frameBuilderTool') {
                                        totalFrames++;
                                        if (totalFrames > MAX_FRAMES_PER_TURN) {
                                            console.log(`\n[Safety] Max frames per turn (${MAX_FRAMES_PER_TURN}) reached`);
                                            if (AUTO_MODE) log(`**Safety cutoff**: ${MAX_FRAMES_PER_TURN} frames reached\n`);
                                            continue;
                                        }
                                    }
                                    renderToolResult(event.toolName, (event as any).input ?? (event as any).args, event.output);
                                }
                            }

                            break;
                        } catch (retryErr: any) {
                            if (isQuotaOrRateLimitError(retryErr)) {
                                console.log(`\n[Quota/rate-limit error, downgrading model...]`);
                                downgradeModel('storyteller');
                                agent = createStorytellerAgent(vnPackage, sessionId);
                                continue;
                            }
                            if (retryErr?.name === 'AI_NoOutputGeneratedError' && attempt < 2) {
                                console.log(`\n[Transient empty response, retry ${attempt + 1}/2...]`);
                                continue;
                            }
                            const errMsg = String(retryErr?.message ?? '');
                            if ((retryErr?.name === 'TimeoutError' || errMsg.includes('timeout') || errMsg.includes('aborted')) && attempt < 2) {
                                console.log(`\n[Connection timed out at attempt ${attempt + 1}, downgrading model...]`);
                                downgradeModel('storyteller');
                                agent = createStorytellerAgent(vnPackage, sessionId);
                                continue;
                            }
                            throw retryErr;
                        }
                    }

                    // Extract response messages for history
                    if (result) {
                        const text = await result.text;
                        if (text && text.trim()) {
                            console.log(`\n💬 [DM Text]:\n${text}`);
                        }

                        const resp = await result.response;
                        const appendRaw = resp.messages as any[];
                        messages = sanitizeHistory([...messages, ...appendRaw]);
                    }

                    if (gameComplete) {
                        keepPlaying = false;
                        diceLoop = false;
                        if (AUTO_MODE) log(`\n---\n\n## GAME COMPLETE at Turn ${turnNumber}\n`);
                    } else if (lastFrameType === 'dice-roll') {
                        turnsSinceLastDiceRoll = 0; // Reset dice-roll tracker
                        // Dice roll frame — player presses Enter, we compute the result
                        if (!AUTO_MODE) {
                            try { await rl!.question('\n🎲 [Press Enter to roll...]'); }
                            catch { keepPlaying = false; break; }
                        } else {
                            console.log('\n🎲 [AUTO: Rolling dice...]');
                        }

                        const notation = lastDiceRoll?.diceNotation ?? '1d20';
                        const match = notation.match(/(\d+)d(\d+)/);
                        const [count, sides] = match ? [+match[1], +match[2]] : [1, 20];
                        let total = 0;
                        for (let i = 0; i < count; i++) total += Math.floor(Math.random() * sides) + 1;
                        console.log(`🎲 You rolled: ${total}`);
                        if (AUTO_MODE) log(`**Dice Roll**: ${notation} = **${total}**\n`);
                        messages.push({ role: 'user', content: [{ type: 'text', text: `[dice-result] ${total}` }] });
                        // Re-compress for next iteration
                        const freshState = db.select({ storySummary: plotStates.storySummary }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
                        compressedMessages = await compressContext(messages, sessionId, freshState?.storySummary || '') as any[];
                    } else if (lastFrameType === 'investigation' && lastInvestigationHotspots.length > 0) {
                        // Investigation frame — player picks a hotspot to examine
                        const hotspot = lastInvestigationHotspots[Math.floor(Math.random() * lastInvestigationHotspots.length)];
                        const msg = `Player investigates: ${hotspot.label || hotspot.id}`;
                        console.log(`\n🔍 [${AUTO_MODE ? 'AUTO: ' : ''}Investigating ${hotspot.label}]`);
                        if (AUTO_MODE) log(`**Investigation**: ${hotspot.label} (${hotspot.id})\n`);
                        messages.push({ role: 'user', content: [{ type: 'text', text: msg }] });
                        const freshState2 = db.select({ storySummary: plotStates.storySummary }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
                        compressedMessages = await compressContext(messages, sessionId, freshState2?.storySummary || '') as any[];
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
            consecutiveErrors = 0;

            // Model recovery: after 3 consecutive successful turns on a downgraded model,
            // try resetting to the best model to get richer narrative quality.
            consecutiveSuccesses++;
            if (consecutiveSuccesses >= 3) {
                const { modelId: currentModelId } = getActiveModelInfo('storyteller');
                const originalId = resetModel('storyteller');
                if (currentModelId !== originalId) {
                    console.log(`\n[Model Recovery] ${currentModelId} → ${originalId} after ${consecutiveSuccesses} successes`);
                    if (AUTO_MODE) log(`**Model Recovery**: upgraded back to ${originalId}\n`);
                    agent = createStorytellerAgent(vnPackage, sessionId);
                    consecutiveSuccesses = 0;
                }
            }

            // Increment turn count (mirrors tellChatRoute behavior)
            const currentState = db.select({ turnCount: plotStates.turnCount }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
            if (currentState) {
                db.update(plotStates)
                    .set({ turnCount: (currentState.turnCount ?? 0) + 1 })
                    .where(eq(plotStates.sessionId, sessionId))
                    .run();
            }

            // Check for location transitions to trigger summarization
            if (preTurnState) {
                const postTurnState = db.select({ currentLocationId: plotStates.currentLocationId }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
                if (postTurnState && postTurnState.currentLocationId !== preTurnState.currentLocationId) {
                    console.log(`\n[Location Transition: ${preTurnState.currentLocationId} -> ${postTurnState.currentLocationId}. Summarizing previous scene...]`);
                    await summarizeNodeInBackground(sessionId, messages as any[], preTurnState.storySummary);
                }
            }

            if (!keepPlaying) break;

            // End-game detection: if the final act's progression threshold is met,
            // allow 2 more turns for ending narration then stop.
            if (AUTO_MODE) {
                const postState = db.select({
                    currentActId: plotStates.currentActId,
                    globalProgression: plotStates.globalProgression,
                }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
                if (postState) {
                    const acts = vnPackage.plot.acts;
                    const isFinalAct = acts[acts.length - 1]?.id === postState.currentActId;
                    const finalRequired = acts[acts.length - 1]?.globalProgression?.requiredValue ?? Infinity;
                    if (isFinalAct && (postState.globalProgression ?? 0) >= finalRequired) {
                        if (!endingTurnCountdown) {
                            endingTurnCountdown = 3; // Allow 3 more turns for ending narration
                            console.log(`\n[AUTO] FINAL ACT COMPLETE — ${endingTurnCountdown} turns remaining for ending`);
                            log(`\n**FINAL ACT PROGRESSION MET** — narrating ending...\n`);
                        }
                        endingTurnCountdown--;
                        if (endingTurnCountdown <= 0) {
                            console.log(`\n[AUTO] Ending narration complete. Stopping.`);
                            log(`\n**ENDING NARRATION COMPLETE**\n`);
                            keepPlaying = false;
                        }
                    }
                }
            }

            // Prompt for player input
            if (AUTO_MODE) {
                // Auto-play: only interact when the story prompts for it
                let chosenText: string;

                if (options.length > 0) {
                    // ── Choice frame presented — pick an option ──────────────
                    const choiceKey = options.map((o: any) => o.text).sort().join('|');
                    recentChoiceSets.push(choiceKey);
                    if (recentChoiceSets.length > LOOP_DETECTION_WINDOW + 2) recentChoiceSets.shift();

                    const lastN = recentChoiceSets.slice(-LOOP_DETECTION_WINDOW);
                    const isLoop = lastN.length >= LOOP_DETECTION_WINDOW && lastN.every(k => k === lastN[0]);

                    if (isLoop) {
                        consecutiveLoopBreaks++;
                        console.log(`\n[AUTO] ⚠️  LOOP DETECTED (${consecutiveLoopBreaks}x) — breaking`);
                        log(`**⚠️ LOOP DETECTED** (${consecutiveLoopBreaks}x)\n`);

                        if (consecutiveLoopBreaks <= 2) {
                            const idx = options.length - 1;
                            chosenText = `Player chooses: ${options[idx].text}`;
                            log(`**Player Choice (loop-break)**: Option ${idx + 1} — ${options[idx].text}\n`);
                        } else {
                            // Force travel to escape loop
                            const dbRow = db.select().from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
                            const currentAct = vnPackage.plot.acts.find(a => a.id === dbRow?.currentActId);
                            const loc = currentAct?.sandboxLocations?.find(l => l.id === dbRow?.currentLocationId);
                            const connections = loc?.connections || [];
                            if (connections.length > 0) {
                                const target = connections[Math.floor(Math.random() * connections.length)];
                                chosenText = `Player: I want to go to ${target}. Let's leave this place.`;
                                log(`**Player Action (forced travel)**: Go to ${target}\n`);
                            } else {
                                chosenText = `Player: I need to find a completely different approach.`;
                                log(`**Player Action (forced explore)**: Leave current area\n`);
                            }
                        }
                        recentChoiceSets.length = 0;
                    } else {
                        consecutiveLoopBreaks = 0;
                        const idx = Math.random() < 0.6 ? 0 : Math.floor(Math.random() * options.length);
                        chosenText = `Player chooses: ${options[idx].text}`;
                        console.log(`\n[AUTO] Chose option ${idx + 1}: ${options[idx].text}`);
                        log(`**Player Choice**: Option ${idx + 1} — ${options[idx].text}\n`);
                    }
                } else {
                    // ── No choice/dice-roll frame — story didn't ask for interaction ────
                    // Always send [continue] — only interact when the story prompts it.
                    {
                        chosenText = '[continue]';
                        console.log(`\n[AUTO] [continue]`);
                        log(`*[continue]*\n`);
                    }
                }
                messages.push({ role: 'user', content: [{ type: 'text', text: chosenText }] });
            } else {
                // Interactive mode
                const ask = async (prompt: string) => {
                    try { return await rl!.question(prompt); }
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
            }

        } catch (e: any) {
            const errMsg = String(e?.message ?? '');
            const isTimeout = e?.name === 'TimeoutError'
                || errMsg.includes('timeout')
                || errMsg.includes('aborted due to timeout');

            const isRecoverable = isTimeout
                || e?.name === 'AI_NoOutputGeneratedError'
                || e?.name === 'AI_InvalidPromptError'
                || errMsg.includes('No output generated');

            if (isRecoverable) {
                consecutiveSuccesses = 0;
                consecutiveErrors++;
                console.error(`\n[Turn ${turnNumber} error (${e?.name ?? 'unknown'}) — recovering (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS})]`);
                finishTrace('error', e);

                if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                    console.error(`\n[FATAL] ${MAX_CONSECUTIVE_ERRORS} consecutive errors — stopping to avoid infinite loop`);
                    if (AUTO_MODE) log(`\n**STOPPED**: ${MAX_CONSECUTIVE_ERRORS} consecutive errors (likely quota exhausted)\n`);
                    keepPlaying = false;
                    continue;
                }

                // Downgrade on timeout/quota errors, or after 2+ consecutive errors (likely hidden quota).
                const shouldDowngrade = isTimeout || isQuotaOrRateLimitError(e) || consecutiveErrors >= 2;
                if (shouldDowngrade) {
                    const reason = isQuotaOrRateLimitError(e) ? 'quota' : isTimeout ? 'timeout' : `${consecutiveErrors} consecutive errors`;
                    const newModel = downgradeModel('storyteller');
                    console.log(`[Downgraded to ${newModel} (${reason}), continuing next turn...]`);
                    if (AUTO_MODE) log(`**Turn ${turnNumber} error**: ${e?.name} — downgraded to ${newModel} (${reason})\n`);
                    agent = createStorytellerAgent(vnPackage, sessionId);
                } else {
                    console.log(`[Transient error (${e?.name}), retrying with same model...]`);
                    if (AUTO_MODE) log(`**Turn ${turnNumber} error**: ${e?.name} — retrying\n`);
                }

                // Re-add a user message so the model has something to respond to
                if (AUTO_MODE) {
                    const action = AUTO_ACTIONS[autoActionIdx % AUTO_ACTIONS.length];
                    autoActionIdx++;
                    messages.push({ role: 'user', content: [{ type: 'text', text: `Player: ${action}` }] });
                }
            } else {
                console.error('\n[Error computing next turn]', e);
                finishTrace('error', e);
                if (AUTO_MODE) log(`\n**ERROR at Turn ${turnNumber}**: ${(e as any)?.message || e}\n`);
                keepPlaying = false;
            }
        }
    }

    if (rl) rl.close();

    if (AUTO_MODE) {
        // Write final summary
        const finalState = db.select().from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
        const finalFlags = JSON.parse(finalState?.flagsJson || '{}');
        const finalCompleted: string[] = JSON.parse(finalState?.completedLocations || '[]');
        log(`\n---\n\n## Final State\n`);
        log(`- Session: ${sessionId}`);
        log(`- Total turns played: ${turnNumber}`);
        log(`- Final act: ${finalState?.currentActId || '?'}`);
        log(`- Final location: ${finalState?.currentLocationId || '?'}`);
        log(`- Global progression: ${finalState?.globalProgression || 0}`);
        log(`- Completed locations: ${finalCompleted.length > 0 ? finalCompleted.join(', ') : 'none'}`);
        log(`- Flags (${Object.keys(finalFlags).length}): ${JSON.stringify(finalFlags, null, 2)}`);
        log(`- Story summary: ${finalState?.storySummary || '(none)'}`);
        log(`\nEnded: ${new Date().toISOString()}`);
        console.log(`\n[AUTO-PLAY] Log written to: ${LOG_FILE}`);
    }

    console.log('\n[Session ended]');
}

run();
