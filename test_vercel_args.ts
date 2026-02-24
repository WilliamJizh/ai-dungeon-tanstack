import { sanitizeHistory } from './server/vn/utils/contextCompressor.js';

// Recreate the shape that Vercel AI SDK actually puts in `messages` array
const mockMessages = [
  {
    role: "assistant",
    content: [
      {
        type: "tool-call",
        toolCallId: "call_abc123",
        toolName: "plotStateTool",
        args: { locationId: "dark_room" } // We assume args is the key
      }
    ]
  }
];

const result = sanitizeHistory(mockMessages);
console.log(JSON.stringify(result, null, 2));
