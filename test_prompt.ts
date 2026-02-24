import 'dotenv/config';
import { generateText } from 'ai';
import { getModel } from './server/lib/modelFactory.js';
import util from 'util';

const messages: any = [
  {"role":"user","content":[{"type":"text","text":"[scene start]"}]},
  {"role":"assistant","content":[{"type":"tool-call","toolCallId":"functions.plotStateTool:0","toolName":"plotStateTool","args":{}}]},
  {"role":"tool","content":[{"type":"tool-result","toolCallId":"functions.plotStateTool:0","toolName":"plotStateTool","result":{"type":"json","value":{"currentActId":"act_1_setup"}}}]},
  {"role":"assistant","content":[{"type":"text","text":"  "},{"type":"tool-call","toolCallId":" functions.frameBuilderTool:1 ","toolName":"frameBuilderTool","args":{"id":"lab-opening-1","type":"full-screen"}}]},
  {"role":"tool","content":[{"type":"tool-result","toolCallId":" functions.frameBuilderTool:1 ","toolName":"frameBuilderTool","result":{"type":"json","value":{"ok":true}}}]},
  {"role":"assistant","content":[{"type":"text","text":"  "},{"type":"tool-call","toolCallId":" functions.yieldToPlayer:2 ","toolName":"yieldToPlayer","args":{"waitingFor":"free-text"}}]},
  {"role":"tool","content":[{"type":"tool-result","toolCallId":" functions.yieldToPlayer:2 ","toolName":"yieldToPlayer","result":{"type":"json","value":{}}}]},
  {"role":"user","content":[{"type":"text","text":"Player takes action: "}]}
];

async function runTest() {
  try {
    const { modelType, provider, modelId } = getModel('storyteller');
    const result = await generateText({
      model: modelType,
      messages: messages,
      tools: {
        plotStateTool: { description: 'plot state', parameters: {} as any, execute: async () => ({}) },
        frameBuilderTool: { description: 'frame builder', parameters: {} as any, execute: async () => ({}) },
        yieldToPlayer: { description: 'yield', parameters: {} as any, execute: async () => ({}) }
      }
    });
    console.log("Success!");
  } catch (e: any) {
    console.log(util.inspect(e, { depth: null, colors: true }));
    console.log("JSON Error:", JSON.stringify(e, null, 2));
  }
}

runTest();
