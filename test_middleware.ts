import 'dotenv/config';
import { generateText, tool, wrapLanguageModel } from 'ai';
import { getGoogleClient } from './server/lib/modelFactory.js';
import { z } from 'zod';

const baseModel = getGoogleClient()('gemini-3-pro-preview');
const wrappedModel = wrapLanguageModel({
    model: baseModel,
    middleware: {
        wrapGenerate: async ({ doGenerate, params }: any) => {
            console.log('--- DO_GENERATE RESULT ---');
            const result = await doGenerate();
            console.dir(result, { depth: null });
            console.log('--------------------------');
            return result;
        }
    }
});

async function main() {
    const result = await generateText({
        model: wrappedModel,
        prompt: 'Say hello and then call the getWeather tool for London.',
        tools: {
            getWeather: tool({
                description: 'Get weather',
                inputSchema: z.object({ location: z.string() }),
                execute: async (args) => ({ temperature: 20 })
            })
        }
    });

    console.log('Final Action:', result.toolCalls);
}

main().catch(console.error);
