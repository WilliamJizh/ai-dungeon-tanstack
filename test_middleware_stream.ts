import 'dotenv/config';
import { streamText, tool, wrapLanguageModel } from 'ai';
import { getGoogleClient } from './server/lib/modelFactory.js';
import { z } from 'zod';

const baseModel = getGoogleClient()('gemini-3.1-pro-preview');
const wrappedModel = wrapLanguageModel({
    model: baseModel,
    middleware: {
        wrapGenerate: async ({ doGenerate, params }: any) => {
            console.log('--- DO_GENERATE CALLED ---');
            const result = await doGenerate();
            console.dir(result, { depth: null });
            return result;
        },
        wrapStream: async ({ doStream, params }: any) => {
            console.log('--- DO_STREAM CALLED ---');
            const stream = await doStream();
            // To see what doStream returns, we just return it. 
            // But we can monkeypatch stream to log things if we want.
            return stream;
        }
    }
});

async function main() {
    const result = streamText({
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

    for await (const chunk of result.fullStream) {
        if (chunk.type === 'tool-call') {
            console.log('Got tool call from stream!');
        }
    }
    console.log('Usage:', await result.usage);
}

main().catch(console.error);
