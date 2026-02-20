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

export interface DraftAct {
  id: string;
  title: string;
  scenes: DraftScene[];
}

export interface DraftScene {
  id: string;
  actId: string;
  title: string;
  location: string;
  beats: string[];
  exitConditions: string[];
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
  acts: DraftAct[];
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
    const actMap = new Map<string, { id: string; title: string }>();
    const sceneMap = new Map<string, DraftScene>();
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

        if (part.type === 'tool-proposeAct') {
          const input = (part as { input: { id: string; title: string } }).input;
          actMap.set(input.id, input);
        }

        if (part.type === 'tool-proposeScene') {
          const input = (part as { input: DraftScene & { backgroundPrompt: string; musicPrompts: unknown[] } }).input;
          const output = (part as { output: { backgroundUrl?: string; musicUrl?: string } }).output;
          sceneMap.set(input.id, {
            id: input.id,
            actId: input.actId,
            title: input.title,
            location: input.location,
            beats: input.beats,
            exitConditions: input.exitConditions,
            mood: input.mood,
            backgroundUrl: output?.backgroundUrl,
            musicUrl: output?.musicUrl,
          });
        }

        if (part.type === 'tool-updateElement') {
          const input = (part as { input: { type: string; id?: string; changes: Record<string, unknown>; regenerateImage?: boolean } }).input;
          if (input.type === 'character' && input.id) {
            const existing = characterMap.get(input.id);
            if (existing) characterMap.set(input.id, { ...existing, ...input.changes as Partial<DraftCharacter> });
          }
          if (input.type === 'act' && input.id) {
            const existing = actMap.get(input.id);
            if (existing) actMap.set(input.id, { ...existing, ...input.changes as Partial<{ id: string; title: string }> });
          }
          if (input.type === 'scene' && input.id) {
            const existing = sceneMap.get(input.id);
            if (existing) sceneMap.set(input.id, { ...existing, ...input.changes as Partial<DraftScene> });
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

    const acts: DraftAct[] = Array.from(actMap.values()).map(act => ({
      ...act,
      scenes: Array.from(sceneMap.values()).filter(s => s.actId === act.id),
    }));

    return {
      premise: premiseMap.get('premise'),
      characters: Array.from(characterMap.values()),
      acts,
      packageId,
    };
  }, [messages]);
}
