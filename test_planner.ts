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

async function run() {
    const sessionId = randomUUID();
    const session = getOrCreatePlanSession(sessionId, language, true); // bypassAssets=true for CLI

    console.log(`\nSession: ${sessionId}`);
    console.log(`Package ID: ${session.packageId}`);
    console.log(`Language: ${language}\n`);

    const agent = createPlanningAgent(session);

    // The agent's system prompt says "Start by asking about genre" — for CLI batch mode,
    // we override this by instructing it to generate everything in one pass.
    const batchPrompt = `${userPrompt}

AUTOMATED GENERATION — do NOT stop to ask questions. Generate ALL of the following sequentially in this exact turn:
1. proposeStoryPremise (with globalMaterials and possibleEndings)
2. proposeCharacter (at least 2 characters, one at a time)
3. draftActOutline (propose a core objective and a list of intended Node IDs for Act 1)
4. draftNodeWeb (connect those nodes together in a network using exitConditions)
5. draftNodeBeats (for each node in the act, detailed beats with pacing, findings, interactables)
6. finalizePackage

CRITICAL: You MUST call finalizePackage as your 6th and final tool call in this turn. It is the only way to save the network!`;

    console.log('[Planning agent is designing the story...]\n');

    try {
        const result = await agent.generate({
            messages: [{ role: 'user', content: [{ type: 'text', text: batchPrompt }] }],
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
                } else if (tr.toolName === 'draftActOutline') {
                    console.log(`  draftActOutline: ${out.title} (${out.id})`);
                } else if (tr.toolName === 'draftNodeWeb') {
                    console.log(`  draftNodeWeb: wired ${out.updatedNodes} nodes`);
                } else if (tr.toolName === 'draftNodeBeats') {
                    console.log(`  draftNodeBeats: added beats to ${out.updated} `);
                } else if (tr.toolName === 'finalizeNode') {
                    console.log(`  finalizeNode: generated assets for ${out.id}`);
                } else if (tr.toolName === 'finalizePackage') {
                    console.log(`  finalizePackage: ${out.title} (${out.totalNodes} nodes)`);
                    packageId = out.packageId;
                } else {
                    console.log(`  ${tr.toolName} `);
                }
            }
        }

        if (!packageId && session.draft.acts.length > 0) {
            console.log('\n[AI dropped finalizePackage. Auto-finalizing partial draft...]');
            const tools = createPlanningTools(session);
            const r = (await tools.finalizePackage.execute({ packageId }, { toolCallId: '', messages: [] })) as any;
            packageId = r.packageId;
            console.log(`\n\n=== GENERATION COMPLETE ===\nPackage ID: ${r.packageId}\nTitle: ${r.title}\nTotal Nodes Generated: ${r.totalNodes}`);
        }

        if (packageId) {
            console.log(`\n${'='.repeat(60)} `);
            console.log(`PACKAGE ID: ${packageId} `);
            console.log(`${'='.repeat(60)} `);
            console.log(`\nTo play this story: \n`);
            console.log(`  npx tsx test_storyteller.ts ${packageId} \n`);
        } else {
            console.log('\nfinalizePackage was not called. Partial draft:');
            console.log(`  Title: ${session.draft.premise?.title ?? '(none)'} `);
            console.log(`  Characters: ${session.draft.characters.map(c => c.name).join(', ') || '(none)'} `);
            console.log(`  Acts: ${session.draft.acts.map(a => a.title).join(', ') || '(none)'} `);
            console.log(`  Nodes: ${session.draft.acts.flatMap(a => a.nodes).map(n => n.title).join(', ') || '(none)'} `);
            console.log(`  Beats: ${session.draft.acts.flatMap(a => a.nodes).flatMap(n => n.beats).map(b => b.description.substring(0, 20)).join(', ') || '(none)'} `);
        }

        console.log(`[Done — ${toolCount} tool calls across ${result.steps.length} steps]`);

    } catch (error) {
        console.error('\nPlanning failed:', error);

        if (session.draft.premise) {
            console.log('\n--- Partial Draft ---');
            console.log(`Title: ${session.draft.premise.title} `);
            console.log(`Characters: ${session.draft.characters.map(c => c.name).join(', ')} `);
            console.log(`Acts: ${session.draft.acts.map(a => a.title).join(', ')} `);
            console.log(`Nodes: ${session.draft.acts.flatMap(a => a.nodes).map(n => n.title).join(', ')} `);
            console.log(`Beats: ${session.draft.acts.flatMap(a => a.nodes).flatMap(n => n.beats).map(b => b.description.substring(0, 20)).join(', ')} `);
        }
    }
}

run();
