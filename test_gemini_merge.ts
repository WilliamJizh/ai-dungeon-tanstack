import 'dotenv/config';
import { generateText, tool, CoreMessage } from 'ai';
import { z } from 'zod';
import { getModel } from './server/lib/modelFactory.js';

const model = getModel('planning');

async function run() {
    const messages: CoreMessage[] = [
        { role: 'system', content: 'You are a collaborative visual novel co-author and expert Narrative Architect.' },
        {
            role: 'user',
            content: '[TARGET LANGUAGE: zh-CN]\nCreate a Steins;Gate story backbone. Focus on time travel, causality, and a thriller narrative.\n\nGenerate the story premise now. Call proposeStoryPremise with:\n- A rich globalContext (setting, tone, 3-4 overarchingTruths)\n- 5-8 descriptive globalMaterials (phrases, not keywords)\n- At least 4 globalWorldInfo entries covering different aspects of the world\n- 3 possibleEndings\nALL output MUST be in zh-CN. Do not mix English and zh-CN.'
        },
    ];

    try {
        const result = await generateText({
            model,
            messages,
            tools: {
                proposeStoryPremise: tool({
                    description: 'Propose the story premise',
                    parameters: z.object({ title: z.string() }),
                    execute: async () => ({ title: 'Steins Gate' })
                })
            }
        });
        console.log('Success:', result.text);
    } catch (e: any) {
        console.error('Failed:', e);
    }
}
run();
