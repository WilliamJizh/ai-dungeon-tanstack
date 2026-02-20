import { ToolLoopAgent, InferAgentUIMessage, hasToolCall, tool } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';
import { createPlanningTools, planningToolSchemas } from '../tools/planningTools.js';
import type { PlanSession } from '../state/planSessionStore.js';

const MODEL_ID = process.env.GEMINI_CHAT_MODEL ?? 'gemini-3-flash-preview';

const PLANNING_CHAT_SYSTEM_PROMPT = `You are a collaborative visual novel co-author. Your job is to work with the user through natural conversation to design and build an interactive visual novel story together.

LANGUAGE SETUP:
- In your first or second message, ask the user which language they want for their story. Options: English (en) or 中文/Chinese (zh-CN).
- Once established, ALL generated content — character names, descriptions, story beats, dialogue examples, scene titles, location names — MUST be in that language.
- Always include the chosen language value when calling proposeStoryPremise (language field).
- If the user writes in Chinese, default to zh-CN. If in English, default to en.

PERSONALITY: Creative, enthusiastic, inquisitive. Ask one focused question at a time. Build on the user's ideas rather than replacing them.

YOUR WORKFLOW:
1. Start by asking about genre, setting, and the player character. Have a back-and-forth until you have a clear vision.
2. Call proposeStoryPremise once you have enough information. Don't rush this — get the user's input first.
3. Use your built-in knowledge to research relevant genre conventions, historical details, or world-building lore when needed.
4. Propose characters one at a time. Ask the user for input between each one. Each call generates a portrait image.
5. Propose acts and scenes after the cast is established. Each scene call generates a background image and music.
6. Be receptive to tweaks — use updateElement when the user wants to adjust anything.
7. Only call finalizePackage when the user explicitly confirms they're happy with the story.

TOOL USAGE RULES:
- Ask clarifying questions in plain text before calling tools.
- You can call multiple tools in sequence within one turn (e.g., proposeAct then proposeScene).
- Don't batch ALL scenes into one turn — propose act by act, checking in with the user.
- Character IDs MUST be lowercase slugs (e.g., "kira_voss"). The scene location field MUST equal the scene ID.

TONE: Be conversational. Avoid walls of text. After proposing something, follow up with a short question like "Does this feel right?" or "Want me to adjust anything?".`;

// ─── Agent factory (per-request, with session in tool closures) ──────────────

export function createPlanningAgent(session: PlanSession) {
  const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY! });
  const tools = createPlanningTools(session);

  return new ToolLoopAgent({
    model: google(MODEL_ID),
    instructions: PLANNING_CHAT_SYSTEM_PROMPT,
    tools,
    stopWhen: hasToolCall('finalizePackage'),
  });
}

// ─── Type inference agent (static, for PlanningUIMessage) ────────────────────
// google_search is a provider tool — excluded from type ref, handled generically in UI.

const _typeAgent = new ToolLoopAgent({
  model: undefined as never,
  tools: {
    proposeStoryPremise: tool({ inputSchema: planningToolSchemas.proposeStoryPremise, execute: async () => ({ ok: true as const, title: '' }) }),
    proposeCharacter: tool({ inputSchema: planningToolSchemas.proposeCharacter, execute: async () => ({ ok: true as const, id: '', name: '', imageUrl: '' }) }),
    proposeAct: tool({ inputSchema: planningToolSchemas.proposeAct, execute: async () => ({ ok: true as const, id: '', title: '' }) }),
    proposeScene: tool({ inputSchema: planningToolSchemas.proposeScene, execute: async () => ({ ok: true as const, id: '', title: '', backgroundUrl: '', musicUrl: '' }) }),
    updateElement: tool({ inputSchema: planningToolSchemas.updateElement, execute: async () => ({ ok: true as const, updated: '' }) }),
    finalizePackage: tool({ inputSchema: planningToolSchemas.finalizePackage, execute: async () => ({ ok: true as const, packageId: '', title: '', totalScenes: 0 }) }),
  },
});

export type PlanningUIMessage = InferAgentUIMessage<typeof _typeAgent>;
