import 'dotenv/config';
import { generateText } from 'ai';
import { getOpenRouterClient } from './server/lib/modelFactory.js';

async function runTest() {
  console.log("Testing OpenRouter configuration with moonshotai/kimi-k2.5...");
  try {
    const or = getOpenRouterClient();
    const model = or('moonshotai/kimi-k2.5');
    
    console.log("Sending prompt to model...");
    const { text } = await generateText({
      model,
      prompt: 'Write a haiku about a robot learning to paint.',
    });
    
    console.log('\n--- Result ---');
    console.log(text);
    console.log('--------------\n');
    console.log('Success!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

runTest();
