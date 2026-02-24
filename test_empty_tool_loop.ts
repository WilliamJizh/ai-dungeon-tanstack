import 'dotenv/config';
import { randomUUID } from 'crypto';
import { db } from './server/db/index.js';
import { vnPackages } from './server/db/schema.js';
import { createStorytellerAgent } from './server/vn/agents/storytellerChatAgent.js';

async function run() {
  const pkgRows = db.select().from(vnPackages).all();
  let vnPackage = null;
  for (const row of pkgRows) {
      const p = JSON.parse(row.metaJson);
      if (p.plot && p.plot.globalContext && p.plot.globalContext.setting) {
          vnPackage = p;
          break;
      }
  }

  const sessionId = randomUUID();
  const agent = createStorytellerAgent(vnPackage, sessionId);
  
  // Create a raw SDK call without ToolLoopAgent wrapper
  import('ai').then(async (ai) => {
      const model = (agent as any).model; // Extract the bound model
      try {
          const { text, toolCalls } = await ai.generateText({
              model,
              messages: [{ role: 'user', content: [{ type: 'text', text: '[scene start]' }] }],
              tools: (agent as any).tools,
              opt: { toolChoice: 'required' } as any 
          });
          
          console.log(`\n\nDirect SDK call returned: ${toolCalls?.length || 0} tools.`);
          console.log(text);
          console.log(JSON.stringify(toolCalls, null, 2));
      } catch (err) {
          console.error("SDK Error:", err);
      }
  });
}
run();
