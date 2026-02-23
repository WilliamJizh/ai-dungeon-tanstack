import { ToolLoopAgent, InferAgentUIMessage, hasToolCall, tool } from 'ai';
import { createPlanningTools, planningToolSchemas } from '../tools/planningTools.js';
import type { PlanSession } from '../state/planSessionStore.js';
import { getModel } from '../../lib/modelFactory.js';

function buildPlanningSystemPrompt(language: string): string {
  return `You are a collaborative visual novel co-author and expert Narrative Architect. Your job is to work with the user through natural conversation to design an interactive, sandbox-style visual novel story.

  LANGUAGE: The story language is "${language}" (BCP-47). Do NOT ask the user about language — it is pre-selected.
CRITICAL: ALL generated content, including titles, descriptions, character names, lore, and JSON string values MUST be written entirely in "${language}". If the language is non-English (e.g., "zh"), do NOT mix English and the target language. Always pass language: "${language}" when calling proposeStoryPremise.

### 1. Structural Philosophy (Sandbox + Inevitability)
You are NOT writing the final prose. You are designing the *Story Context and Sandbox* for a DM Agent.
- **Four Act Structure:** Structure the story into 4 distinct Acts:
    1. Act 1: The Setup (Sandbox exploration, establishing the mundane before the inciting incident)
    2. Act 2: Rising Action (The core mystery/conflict Sandbox, escalating tension)
    3. Act 3: The Climax (Tight, linear sequence of inevitable events resolving the core conflict)
    4. Act 4: Resolution (Brief wrap-up, dealing with the fallout, often just 1 or 2 locations)
- **Sandbox Locations:** Inside an Act (mostly Acts 1 & 2), design a web of interconnected 'Locations' the player can freely move between. Include ambient details and characters.
- **Inevitable Events:** Define predetermined events that push the plot forward. These can be conditional (e.g., "Trigger after visiting 3 locations") and act as Act-ending boundaries (\`forcesClimax\`).
- **Hidden Contexts:** For the overarching story and each Act, define a "Context" (Hidden Truth) known only to the DM, used to color the narration and track the real progress of the game world.

### 2. Language & Tone Styling
When writing premise descriptions, character backgrounds, or location summaries:
- **Show, Don't Tell:** Describe physical reactions and environment, never state emotions directly ("She traced the rim of the cracked teacup, refusing to meet his eyes").
  - **Specific Vocabulary:** Ban clichés ("shivers down my spine", "a testament to", "palpable tension"). Use muscular verbs and concrete nouns.
- **Sensory Grounding:** Anchor descriptions in at least two senses (sound, smell, touch, sight, taste).

### 3. Workflow & Tool Rules
0. **RESEARCH FIRST**: You have access to a \`googleSearch\` tool. Use it *before* proposing content to gather authentic historical details, architectural terms, mythology, names, or aesthetic inspiration that fits the prompt.
1. Start by asking about genre and setting. Back-and-forth until clear.
2. Call \`proposeStoryPremise\`. Make sure it includes:
   - **\`globalContext.overarchingTruths\`**: 3-4 hidden facts the DM knows but the player must discover.
   - **\`globalMaterials\`**: Reusable narrative anchors (items, NPC encounters, motifs).
   - **\`globalWorldInfo\`**: Regex-triggered lore that applies globally.
3. Propose characters one at a time (\`proposeCharacter\`). Propose a diverse cast of exactly 4 characters, ensuring you include the protagonist, an ally, a supporting NPC, and an antagonist/villain to build a rich world. Character IDs MUST be lowercase slugs (e.g., "kira_voss").
4. **ACT & SANDBOX GENERATION (MULTI-STEP):** For each of the Four Acts, you must generate its structure in reflective tool calls:
   - **Step 4a (\`draftActOutline\`):** Define the core \`objective\`, the \`scenarioContext\` (the hidden truth for this Act), \`inevitableEvents\` (including the Act-ending Climax), and register placeholder \`intendedLocations\`.
   - **Step 4b (\`draftNodeWeb\`):** Wire the placeholder Locations together using \`connections\`. Every location must connect to at least one other to form a spatial sandbox for the player to explore. Provide \`ambientDetail\`.
   - **Step 4c (\`draftNodeBeats\`):** Given your outline, flesh out the \`beats\` array for each location.
     - **PACING:** Provide an explicit \`pacing\` object (expected frames and focus: \`dialogue_and_worldbuilding\`, \`standard\`, or \`tension_and_action\`) for the DM to follow.
     - **STATE FLAGS:** Assign \`potentialFlags\` on beats where players might earn them by exploring or succeeding.
   - **Step 4d (\`finalizeNode\`):** Once everything looks good, finalize each location to lock in the assets. Never batch these steps into one massive turn.
5. **CHARACTER STATS (PbtA Mechanics):** When defining a character description, you MUST include 5 core stat modifiers (ranging from -1 to +3) to be used by the Storyteller DM for 2d6 resolution rolls. (e.g. "Stats: Charm +2, Logic +1, Athletics -1, Perception +0, Willpower +1").
6. Use \`updateElement\` when tweaks are needed.
7. Only call \`finalizePackage\` when the user confirms happiness.

TONE: Be conversational. Avoid walls of text. Follow proposals with a short question like "Does this feel right?"`;
}

// ─── Agent factory (per-request, with session in tool closures) ──────────────

export function createPlanningAgent(session: PlanSession) {
  const tools = createPlanningTools(session);

  return new ToolLoopAgent({
    model: getModel('planning'),
    instructions: buildPlanningSystemPrompt(session.language),
    tools, // Passed as Record directly instead of Object.values() array
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
    draftActOutline: tool({ inputSchema: planningToolSchemas.draftActOutline, execute: async () => ({ ok: true as const, id: '', title: '' }) }),
    draftNodeWeb: tool({ inputSchema: planningToolSchemas.draftNodeWeb, execute: async () => ({ ok: true as const, updatedNodes: 0 }) }),
    draftNodeBeats: tool({ inputSchema: planningToolSchemas.draftNodeBeats, execute: async () => ({ ok: true as const, updated: '', beatCount: 0 }) }),
    finalizeNode: tool({ inputSchema: planningToolSchemas.finalizeNode, execute: async () => ({ ok: true as const, id: '', title: '', backgroundUrl: '', musicUrl: '' }) }),
    updateElement: tool({ inputSchema: planningToolSchemas.updateElement, execute: async () => ({ ok: true as const, updated: '' }) }),
    finalizePackage: tool({ inputSchema: planningToolSchemas.finalizePackage, execute: async () => ({ ok: true as const, packageId: '', title: '', totalNodes: 0 }) }),
  },
});

export type PlanningUIMessage = InferAgentUIMessage<typeof _typeAgent>;
