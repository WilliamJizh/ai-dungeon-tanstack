import { standardizePrompt } from 'ai/dist/prompt/standardize-prompt.js';

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

try {
  standardizePrompt({ prompt: messages });
  console.log("Success!");
} catch (e: any) {
  console.log("Error Name:", e.name);
  console.log("Error JSON:", JSON.stringify(e, null, 2));
}
