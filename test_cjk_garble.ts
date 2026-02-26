/**
 * Diagnostic: compare streaming vs non-streaming CJK output from OpenRouter.
 * Usage: OPENROUTER_API_KEY=... npx tsx test_cjk_garble.ts
 */
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, streamText } from 'ai';

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) { console.error('OPENROUTER_API_KEY not set'); process.exit(1); }

const openrouter = createOpenRouter({ apiKey });
// Use a cheap model since credits are low
const model = openrouter('anthropic/claude-3.5-haiku');

const prompt = `请用中文写一段100字的场景描写：走进旧电子城二手市场，松香和铁锈的气味。第一人称叙述。`;

async function testNonStreaming() {
  console.log('\n=== NON-STREAMING ===\n');
  const { text } = await generateText({ model, prompt, maxTokens: 150 });
  console.log(text);
  return text;
}

async function testStreaming() {
  console.log('\n=== STREAMING ===\n');
  const result = streamText({ model, prompt, maxTokens: 150 });
  let full = '';
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
    full += chunk;
  }
  console.log('\n');
  return full;
}

// Compare character-by-character to find corruption
function findGarbled(text: string): string[] {
  const suspicious: string[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    // CJK Unified Ideographs range: U+4E00 to U+9FFF
    // CJK Extension A: U+3400 to U+4DBF
    // Flag chars outside common range but still CJK
    if (code >= 0x3400 && code <= 0x9FFF) {
      // Check if it's a very rare character (frequency heuristic)
      // Common CJK range: most used chars are U+4E00-U+9FFF
      // Rare chars often above U+9000 or in extension ranges
    }
  }
  return suspicious;
}

(async () => {
  try {
    console.log('Testing CJK garbling with OpenRouter + Claude Sonnet 4.6...');
    console.log('Credits may be low — if 402 error, top up or switch model.\n');

    const nonStreamText = await testNonStreaming();
    const streamedText = await testStreaming();

    console.log('=== COMPARISON ===');
    console.log(`Non-streaming length: ${nonStreamText.length} chars`);
    console.log(`Streaming length: ${streamedText.length} chars`);

    // Both outputs are from the same model with same prompt but different calls,
    // so content will differ. We're looking for garbled chars in each.
    console.log('\n--- Non-streaming chars (hex dump first 50 CJK): ---');
    let count = 0;
    for (const char of nonStreamText) {
      if (char.codePointAt(0)! >= 0x4E00) {
        const buf = Buffer.from(char, 'utf8');
        process.stdout.write(`${char}[${buf.toString('hex')}] `);
        if (++count >= 50) break;
      }
    }

    console.log('\n\n--- Streaming chars (hex dump first 50 CJK): ---');
    count = 0;
    for (const char of streamedText) {
      if (char.codePointAt(0)! >= 0x4E00) {
        const buf = Buffer.from(char, 'utf8');
        process.stdout.write(`${char}[${buf.toString('hex')}] `);
        if (++count >= 50) break;
      }
    }
    console.log('\n');

  } catch (e: any) {
    console.error('Error:', e.message);
    if (e.statusCode === 402) {
      console.error('Credits exhausted. Top up at https://openrouter.ai/settings/credits');
    }
  }
})();
