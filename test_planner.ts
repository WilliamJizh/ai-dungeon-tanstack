import 'dotenv/config';
import { createPlanningAgent } from './server/vn/agents/planningChatAgent.js';
import { getOrCreatePlanSession } from './server/vn/state/planSessionStore.js';
import { createPlanningTools } from './server/vn/tools/planningTools.js';
import { randomUUID } from 'crypto';

// CLI args: npx tsx test_planner.ts [language] [prompt]
// language defaults to 'en', prompt defaults to the Blackwood Academy story
const cliArgs = process.argv.slice(2);
const language = cliArgs[0] || 'en';
const userPrompt = cliArgs.slice(1).join(' ') || `Can we create a dark academia mystery?
The setting is an elite, isolated boarding school called Blackwood Academy in the 1920s.
The main character is a new student who found a strange locket.`;

// ── Helpers ──────────────────────────────────────────────────────────────────

type Message = { role: 'user' | 'assistant'; content: Array<{ type: 'text'; text: string }> };

function userMsg(text: string): Message {
    return { role: 'user', content: [{ type: 'text', text }] };
}

function logToolResults(steps: any[], label: string): number {
    let count = 0;
    for (const step of steps) {
        for (const tr of step.toolResults ?? []) {
            count++;
            const out = tr.output as any;
            if (tr.toolName === 'proposeStoryPremise') {
                console.log(`    ✓ proposeStoryPremise: "${out.title}"`);
            } else if (tr.toolName === 'proposeCharacter') {
                console.log(`    ✓ proposeCharacter: ${out.name} (${out.id})`);
            } else if (tr.toolName === 'draftActOutline') {
                console.log(`    ✓ draftActOutline: ${out.title} (${out.id})`);
            } else if (tr.toolName === 'draftNodeWeb') {
                console.log(`    ✓ draftNodeWeb: wired ${out.updatedNodes} locations`);
            } else if (tr.toolName === 'draftNodeBeats') {
                console.log(`    ✓ draftNodeBeats: added beats to ${out.updated}`);
            } else if (tr.toolName === 'finalizeNode') {
                console.log(`    ✓ finalizeNode: generated assets for ${out.id}`);
            } else if (tr.toolName === 'finalizePackage') {
                console.log(`    ✓ finalizePackage: ${out.title} (${out.totalNodes} nodes)`);
            } else {
                console.log(`    ✓ ${tr.toolName}`);
            }
        }
    }
    return count;
}

// ── Multi-step generation ────────────────────────────────────────────────────

async function run() {
    const sessionId = randomUUID();
    const session = getOrCreatePlanSession(sessionId, language, true); // bypassAssets=true for CLI

    console.log(`\nSession: ${sessionId}`);
    console.log(`Package ID: ${session.packageId}`);
    console.log(`Language: ${language}\n`);

    const agent = createPlanningAgent(session);
    const startTime = Date.now();
    const langRule = `ALL output MUST be in ${language}. Do not mix English and ${language}.`;

    // Accumulate conversation history across steps
    let messages: any[] = [];
    let totalToolCalls = 0;
    let totalSteps = 0;
    let packageId: string | null = null;

    async function step(label: string, prompt: string) {
        const stepStart = Date.now();
        console.log(`\n[Phase: ${label}]`);
        messages.push(userMsg(prompt));

        const result = await agent.generate({ messages });

        const elapsed = ((Date.now() - stepStart) / 1000).toFixed(1);
        const stepToolCount = logToolResults(result.steps, label);
        totalToolCalls += stepToolCount;
        totalSteps += result.steps.length;

        if (result.text?.trim()) {
            console.log(`    Agent: ${result.text.substring(0, 200)}`);
        }

        console.log(`    (${elapsed}s, ${stepToolCount} tool calls, ${result.steps.length} steps)`);

        // Append all response messages to conversation history for next step
        // AI SDK exposes the final message list via result.response.messages or result.responseMessages
        const r = result as any;
        const responseMessages = r.response?.messages ?? r.responseMessages;
        if (responseMessages) {
            messages.push(...responseMessages);
        } else {
            // Fallback: just append an assistant text message so conversation continues
            if (result.text?.trim()) {
                messages.push({ role: 'assistant' as const, content: [{ type: 'text' as const, text: result.text }] });
            }
        }

        // Check for finalizePackage
        for (const s of result.steps) {
            for (const tr of s.toolResults ?? []) {
                if (tr.toolName === 'finalizePackage') {
                    packageId = (tr.output as any).packageId;
                }
            }
        }

        return result;
    }

    try {
        // ── Phase 1: Story Premise ───────────────────────────────────────
        await step('Story Premise', `[TARGET LANGUAGE: ${language}]
${userPrompt}

Generate the story premise now. Call proposeStoryPremise with:
- A rich globalContext (setting, tone, 3-4 overarchingTruths)
- 5-8 descriptive globalMaterials (phrases, not keywords)
- At least 4 globalWorldInfo entries covering different aspects of the world
- 3 possibleEndings
${langRule}`);

        // ── Phase 2: Characters ──────────────────────────────────────────
        await step('Characters', `Now propose exactly 4 characters one at a time using proposeCharacter:
1. The protagonist
2. A key ally
3. A supporting NPC
4. An antagonist/villain
Each must have detailed descriptions with PbtA stats. ${langRule}`);

        // ── Phase 3-6: Acts 1-4 ─────────────────────────────────────────
        for (let actNum = 1; actNum <= 4; actNum++) {
            const locCount = actNum <= 2 ? '3' : '2';
            await step(`Act ${actNum}`, `Now generate Act ${actNum} of 4. Do the following in order:
1. draftActOutline — define objective, scenarioContext, inevitableEvents, scenarioWorldInfo (at least 2 entries), and ${locCount} intendedLocations
2. draftNodeWeb — connect the locations with rich 2-3 sentence ambientDetail for each
3. draftNodeBeats — for EACH location, write 2-3 detailed beats with vivid 3-5 sentence descriptions, findings (as {id, detail} objects), and interactables (as {id, detail} objects)
${langRule}`);
        }

        // ── Phase 7: Finalize ────────────────────────────────────────────
        if (!packageId) {
            await step('Finalize', `All 4 acts are complete. Now call finalizePackage to save the entire story.`);
        }

        // Auto-finalize if the AI still didn't call finalizePackage
        if (!packageId && session.draft.acts.length > 0) {
            console.log('\n[AI dropped finalizePackage. Auto-finalizing partial draft...]');
            const tools = createPlanningTools(session);
            const r = (await (tools.finalizePackage as any).execute({ title: session.draft.premise?.title ?? 'Untitled' }, { toolCallId: '', messages: [] })) as any;
            packageId = r.packageId;
            console.log(`  ✓ Auto-finalized: ${r.title} (${r.totalNodes} nodes)`);
        }

        // ── Summary ──────────────────────────────────────────────────────
        const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);

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
            console.log(`  Nodes: ${session.draft.acts.flatMap(a => a.nodes).map(n => n.title).join(', ') || '(none)'}`);
        }

        console.log(`[Done — ${totalToolCalls} tool calls across ${totalSteps} steps in ${totalElapsed}s]`);

    } catch (error) {
        console.error('\nPlanning failed:', error);

        if (session.draft.premise) {
            console.log('\n--- Partial Draft ---');
            console.log(`Title: ${session.draft.premise.title}`);
            console.log(`Characters: ${session.draft.characters.map(c => c.name).join(', ')}`);
            console.log(`Acts: ${session.draft.acts.map(a => a.title).join(', ')}`);
            console.log(`Nodes: ${session.draft.acts.flatMap(a => a.nodes).map(n => n.title).join(', ')}`);
        }
    }
}

run();
