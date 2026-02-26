import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText, tool, jsonSchema } from 'ai';

const origFetch = globalThis.fetch;
globalThis.fetch = async (url: any, opts: any) => {
  if (String(url).includes('chat/completions') && opts?.body) {
    const body = JSON.parse(opts.body);
    console.log('=== REQUEST TOOLS ===');
    console.log(JSON.stringify(body.tools, null, 2));
  }
  return origFetch(url, opts);
};

async function main() {
  const client = createOpenRouter({
    apiKey: 'your-api-key-1',
    baseURL: 'http://localhost:8317/v1',
  });
  const model = client('claude-sonnet-4-6');

  const result = streamText({
    model,
    prompt: 'Call the greet tool with name=World.',
    tools: {
      greet: tool({
        description: 'Greet someone',
        parameters: jsonSchema({
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
          additionalProperties: false,
        } as any),
        execute: async (input: any) => `Hello ${input.name}`,
      }),
    },
    maxSteps: 2,
  });

  for await (const event of result.fullStream) {
    if (event.type === 'tool-result') console.log('Result:', event.output);
  }
  console.log('Done.');
}

main().catch(e => console.error(e.message));
