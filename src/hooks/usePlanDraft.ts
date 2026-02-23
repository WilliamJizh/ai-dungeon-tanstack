import { useMemo } from 'react';
import { isToolUIPart } from 'ai';
import type { PlanningUIMessage } from '../../server/vn/agents/planningChatAgent';

export interface DraftCharacter {
  id: string;
  name: string;
  role: string;
  description: string;
  imagePrompt: string;
  imageUrl?: string;
}

export interface DraftBeat {
  id: string;
  title: string;
  description: string;
  pacing: string;
  findings?: string[];
  interactables?: string[];
  foreshadowing?: string;
  objective?: string;
  nextBeatIfFailed?: string;
  musicUrl?: string;
}

export interface DraftNode {
  id: string;
  title: string;
  location: string;
  beats: DraftBeat[];
  exitConditions: { condition: string; nextNodeId?: string }[];
  mood: string;
  backgroundUrl?: string;
  musicUrl?: string;
}

export interface DraftPremise {
  title: string;
  artStyle: string;
  setting: { world: string; era: string; tone: string };
  premise: string;
  themes: string[];
  possibleEndings: string[];
}

export interface PlanDraftState {
  premise?: DraftPremise;
  characters: DraftCharacter[];
  nodes: DraftNode[];
  packageId?: string;
}

/**
 * Derives the current story draft state by walking all tool-* parts
 * in the message stream. Later messages override earlier ones for the same id.
 */
export function usePlanDraft(messages: PlanningUIMessage[]): PlanDraftState {
  return useMemo(() => {
    const premiseMap = new Map<string, DraftPremise>();
    const characterMap = new Map<string, DraftCharacter>();
    const sceneMap = new Map<string, DraftNode>();
    let packageId: string | undefined;

    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      for (const part of msg.parts) {
        if (!isToolUIPart(part) || part.state !== 'output-available') continue;

        if (part.type === 'tool-proposeStoryPremise') {
          const input = (part as { input: DraftPremise }).input;
          premiseMap.set('premise', input);
        }

        if (part.type === 'tool-proposeCharacter') {
          const input = (part as { input: DraftCharacter }).input;
          const output = (part as { output: { imageUrl?: string } }).output;
          characterMap.set(input.id, { ...input, imageUrl: output?.imageUrl });
        }

        if (part.type === 'tool-draftNodeOutline') {
          const input = (part as { input: { id: string; title: string; location: string } }).input;
          const current = sceneMap.get(input.id);
          sceneMap.set(input.id, {
            id: input.id,
            title: input.title,
            location: input.location,
            beats: current?.beats || [],
            exitConditions: (input as any).exitConditions || [],
            mood: (input as any).mood || '',
            backgroundUrl: current?.backgroundUrl,
            musicUrl: current?.musicUrl,
          });
        }

        if (part.type === 'tool-draftNodeBeats') {
          const input = (part as { input: { nodeId: string; beats: any[] } }).input;
          const current = sceneMap.get(input.nodeId);
          if (current) {
            current.beats = input.beats.map((b, i) => ({
              ...b,
              id: `${current.id}-beat-${i + 1}`,
              title: `Beat ${i + 1}`,
              musicUrl: current.musicUrl
            })) as DraftBeat[];
          }
        }

        if (part.type === 'tool-finalizeNode') {
          const input = (part as { input: { nodeId: string } }).input;
          const output = (part as { output: { backgroundUrl?: string; musicUrl?: string } }).output;
          const current = sceneMap.get(input.nodeId);
          if (current) {
            current.backgroundUrl = output?.backgroundUrl;
            current.musicUrl = output?.musicUrl;
          }
        }

        if (part.type === 'tool-updateElement') {
          const input = (part as { input: { type: string; id?: string; changes: Record<string, unknown>; regenerateImage?: boolean } }).input;
          if (input.type === 'character' && input.id) {
            const existing = characterMap.get(input.id);
            if (existing) characterMap.set(input.id, { ...existing, ...input.changes as Partial<DraftCharacter> });
          }
          if (input.type === 'node' && input.id) {
            const existing = sceneMap.get(input.id);
            if (existing) sceneMap.set(input.id, { ...existing, ...input.changes as Partial<DraftNode> });
          }
          if (input.type === 'premise') {
            const existing = premiseMap.get('premise');
            if (existing) premiseMap.set('premise', { ...existing, ...input.changes as Partial<DraftPremise> });
          }
        }

        if (part.type === 'tool-finalizePackage') {
          const output = (part as { output: { packageId?: string } }).output;
          packageId = output?.packageId;
        }
      }
    }

    const nodes: DraftNode[] = Array.from(sceneMap.values());

    return {
      premise: premiseMap.get('premise'),
      characters: Array.from(characterMap.values()),
      nodes,
      packageId,
    };
  }, [messages]);
}
