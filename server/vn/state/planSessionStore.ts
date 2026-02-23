import { v4 as uuidv4 } from 'uuid';

export interface PlanDraftPremise {
  title: string;
  artStyle: string;
  language: string;
  setting: { world: string; era: string; tone: string };
  premise: string;
  themes: string[];
  globalMaterials: string[];
  possibleEndings: string[];
}

export interface PlanDraftCharacter {
  id: string;
  name: string;
  role: 'protagonist' | 'ally' | 'antagonist' | 'npc';
  description: string;
  imagePrompt: string;
  imageUrl?: string;
  imageMimeType?: string;
}

export interface PlanDraftBeat {
  description: string;
  pacing: string;
  findings?: string[];
  interactables?: string[];
  foreshadowing?: string;
  objective?: string;
  nextBeatIfFailed?: string;
}

export interface PlanDraftNode {
  id: string;
  title: string;
  location: string;
  requiredCharacters: string[];
  beats: PlanDraftBeat[];
  callbacks?: string[];
  exitConditions: { condition: string; nextNodeId?: string }[];
  mood: string;
  backgroundUrl?: string;
  backgroundMimeType?: string;
  musicUrl?: string;
}

export interface PlanDraftAct {
  id: string;
  title: string;
  objective: string;
  nodes: PlanDraftNode[];
}

export interface PlanDraftReferenceImage {
  url: string;       // data URL from AI SDK FileUIPart
  mediaType: string; // e.g. 'image/png'
}

export interface PlanDraft {
  premise?: PlanDraftPremise;
  characters: PlanDraftCharacter[];
  acts: PlanDraftAct[];
  referenceImages: PlanDraftReferenceImage[];
}

export interface PlanSession {
  sessionId: string;
  packageId: string;
  language: string;
  bypassAssets?: boolean;
  draft: PlanDraft;
  createdAt: Date;
}

const store = new Map<string, PlanSession>();

export function getOrCreatePlanSession(sessionId: string, language = 'en', bypassAssets = false): PlanSession {
  if (!store.has(sessionId)) {
    store.set(sessionId, {
      sessionId,
      packageId: uuidv4(),
      language,
      bypassAssets,
      draft: { characters: [], acts: [], referenceImages: [] },
      createdAt: new Date(),
    });
  }
  return store.get(sessionId)!;
}

export function clearPlanSession(sessionId: string): void {
  store.delete(sessionId);
}
