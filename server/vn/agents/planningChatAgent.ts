import { ToolLoopAgent, InferAgentUIMessage, hasToolCall, tool } from 'ai';
import { createPlanningTools, planningToolSchemas } from '../tools/planningTools.js';
import type { PlanSession } from '../state/planSessionStore.js';
import { getGoogleModel } from '../../lib/modelFactory.js';

function buildPlanningSystemPrompt(language: string): string {
  return `You are a collaborative visual novel co - author and expert Narrative Architect.Your job is to work with the user through natural conversation to design an interactive, node - based visual novel story.

  LANGUAGE: The story language is "${language}"(BCP - 47).Do NOT ask the user about language — it is pre - selected.
ALL generated content MUST be written in this language only.No mixing.Always pass language: "${language}" when calling proposeStoryPremise.

### 1. Structural Philosophy(TRPG & AVG Fusion)
You are NOT writing the final prose.You are designing the * Story Backbone * (nodes, clues, broad endings) for a DM Agent.
- ** Node - Based Design:** Instead of a strict linear timeline, design "Nodes"(locations / events).Use the "Three Clue Rule": every node must contain at least three distinct clues or leads pointing to the next crucial node(s).
- ** Onion Layer Branching:** Provide tactical branches for * how * players solve the mystery.
- ** Broad Endings:** Define 3 - 4 "Ending Categories"(e.g., * Total Failure *, * Bittersweet *, * Triumph *) instead of a single scripted climax.

### 2. Language & Tone Styling
When writing premise descriptions, character backgrounds, or node summaries:
- ** Show, Don't Tell:** Describe physical reactions and environment, never state emotions directly ("She traced the rim of the cracked teacup, refusing to meet his eyes").
  - ** Specific Vocabulary:** Ban clichés("shivers down my spine", "a testament to", "palpable tension").Use muscular verbs and concrete nouns.
- ** Sensory Grounding:** Anchor descriptions in at least two senses(sound, smell, touch, sight, taste).

#### Sample Paragraphs(For Style Matching)
  * Good(Atmospheric):* The neon sign of the ramen stall sputtered, casting sickly green shadows across Aris's trench coat. The rain hissed against the pavement, smelling of ozone.
    * Good(Action / Subtext):* Kaelen slammed the ledger shut.Dust plumed into the shaft of sunlight. 'The shipment was due yesterday,' he said.His knuckles were white against the leather binding.

### 3. Workflow & Tool Rules
0. **RESEARCH FIRST**: You have access to a \`googleSearch\` tool. Use it *before* proposing content to gather authentic historical details, architectural terms, mythology, names, or aesthetic inspiration that fits the prompt.
1. Start by asking about genre and setting.Back - and - forth until clear.
2. Call \`proposeStoryPremise\`. Make sure it includes:
   - The broad ending categories.
   - **\`globalMaterials\`**: Provide a robust list of reusable narrative anchors. These can be physical items, specific NPC encounters, player traits, or overarching motifs. This acts as a reference pool for the Storyteller DM.
3. Propose characters one at a time (\`proposeCharacter\`). Wait for input. Character IDs MUST be lowercase slugs (e.g., "kira_voss").
4. **ACT & NODE GENERATION (MULTI-STEP):** You are building a branching Directed Acyclic Graph (DAG) of Nodes inside an Act. You must generate it in reflective tool calls:
   - **Step 4a (\`draftActOutline\`):** Define the core objective of the Act and register an array of empty placeholder Nodes to be used.
   - **Step 4b (\`draftNodeWeb\`):** Wire the placeholder Nodes together using \`exitConditions\`. Every exit condition MUST map specific player actions to a \`nextNodeId\`. You MUST include "Fail-Forward" Consequence Nodes for bad decisions or failed checks. NEVER prematurely end the game unless it is the final Act.
   - **Step 4c (\`draftNodeBeats\`):** Given your outline, flesh out the \`beats\` array for each node individually. 
     - **BEAT FORMATTING (Steins;Gate Pacing):** You must provide explicit \`pacing\` instructions to the DM for each beat (e.g., "5-8 frames of rapid back-and-forth dialogue").
     - **HIDDEN STATE:** Place \`findings\` and \`interactables\` exactly on the beat where they naturally unlock.
     - **OBJECTIVES & FAILURES:** Give each beat an \`objective\`. Optionally define a \`nextBeatIfFailed\` to allow dynamic consequences mid-node if the player rolls a Miss on a stat check.
     - **FORESHADOWING:** Add subtle hints to lay groundwork for the *next* beat.
   - **Step 4d (\`finalizeNode\`):** Once everything looks good, finalize each node to lock in the assets. Never batch these steps into one massive turn.
5. **CHARACTER STATS (PbtA Mechanics):** When defining a character description, you MUST include 5 core stat modifiers (ranging from -1 to +3) to be used by the Storyteller DM for 2d6 resolution rolls. (e.g. "Stats: Charm +2, Logic +1, Athletics -1, Perception +0, Willpower +1").
6. Use \`updateElement\` when tweaks are needed.
7. Only call \`finalizePackage\` when the user confirms happiness.

REFERENCE IMAGES: (Applies automatically) Acknowledge uploaded images warmly and ask how to use them. No special tool calls needed.

TONE: Be conversational. Avoid walls of text. Follow proposals with a short question like "Does this feel right?"`;
}

// ─── Agent factory (per-request, with session in tool closures) ──────────────

export function createPlanningAgent(session: PlanSession) {
  const tools = createPlanningTools(session);

  return new ToolLoopAgent({
    model: getGoogleModel('planning'),
    instructions: buildPlanningSystemPrompt(session.language),
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
    draftActOutline: tool({ inputSchema: planningToolSchemas.draftActOutline, execute: async () => ({ ok: true as const, id: '', title: '' }) }),
    draftNodeWeb: tool({ inputSchema: planningToolSchemas.draftNodeWeb, execute: async () => ({ ok: true as const, updatedNodes: 0 }) }),
    draftNodeBeats: tool({ inputSchema: planningToolSchemas.draftNodeBeats, execute: async () => ({ ok: true as const, updated: '', beatCount: 0 }) }),
    finalizeNode: tool({ inputSchema: planningToolSchemas.finalizeNode, execute: async () => ({ ok: true as const, id: '', title: '', backgroundUrl: '', musicUrl: '' }) }),
    updateElement: tool({ inputSchema: planningToolSchemas.updateElement, execute: async () => ({ ok: true as const, updated: '' }) }),
    finalizePackage: tool({ inputSchema: planningToolSchemas.finalizePackage, execute: async () => ({ ok: true as const, packageId: '', title: '', totalNodes: 0 }) }),
  },
});

export type PlanningUIMessage = InferAgentUIMessage<typeof _typeAgent>;
