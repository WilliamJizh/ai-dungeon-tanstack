import 'dotenv/config';
import { tool, generateText } from 'ai';
import { z } from 'zod';
import { MODEL_IDS, getModel } from './server/lib/modelFactory.js';

const mockWeatherTool = tool({
    description: 'Get the weather for a city. Call this when the user asks.',
    parameters: z.object({ city: z.string() }),
    execute: async ({ city }) => {
        console.log(`\n☁️  [Tool Execution: Fetching weather for ${city} (returning huge payload)]`);
        return {
            city,
            temperature: '72F',
            condition: 'Sunny',
            forecast: Array.from({ length: 100 }).map((_, i) => ({ day: i, desc: 'Sunny and bright and hot and nice.' })),
            metaData: 'Huge bloated metadata string that we want to strip from history'.repeat(100)
        };
    }
});

import { sanitizeHistory } from './server/vn/utils/contextCompressor.js';
async function runTurn(turnNum: number, userPrompt: string, messages: any[], model: any) {
    console.log(`\n\n=== TURN ${turnNum} ===`);
    console.log(`🙋 User: ${userPrompt}`);
    messages.push({ role: 'user', content: [{ type: 'text', text: userPrompt }] });

    console.log(`[Sending ${messages.length} messages to Gemini. Roles: ${messages.map((m: any) => m.role).join(' -> ')}]`);
    console.log(`[Current Context Size Request Payload: ~${JSON.stringify(messages).length} chars]`);

    const result = await generateText({
        model,
        tools: { mockWeatherTool },
        maxSteps: 3,
        messages
    });

    if (result.text) {
        console.log(`\n🤖 Agent: ${result.text}`);
    }

    // Sanitize!
    const appendRaw = result.response.messages;

    console.log(`\n[Sanitization] Raw appended history size: ${JSON.stringify(appendRaw).length} chars`);

    const combined = [...messages, ...appendRaw];
    const newMessages = sanitizeHistory(combined);

    console.log(`[Sanitization] Sanitized total history size: ${JSON.stringify(newMessages).length} chars`);

    return newMessages;
}

async function runTest() {
    const model = getModel('chat'); // Assuming this is set up to wrap Google model
    let messages: any[] = [];

    console.log('--- STARTING SANITIZATION TEST (Programmatic) ---');

    // Turn 1: Basic greeting
    messages = await runTurn(1, 'Hello! I am a human.', messages, model);

    // Turn 2: Trigger the tool call with massive bloated return
    messages = await runTurn(2, 'What is the weather in Tokyo?', messages, model);

    // Turn 3: See if it remembers the output despite having its history altered into text strings
    messages = await runTurn(3, 'Awesome. Did I ask about the weather? What city was it, and what was the temperature again?', messages, model);

    console.log('\n✅ Script Complete.');
}

runTest().catch(console.error);
