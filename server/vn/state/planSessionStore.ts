import { v4 as uuidv4 } from 'uuid';

export interface PlanDraftPremise {
  title: string;
  artStyle: string;
  language: string;
  globalContext: { setting: string; tone: string; overarchingTruths: string[] };
  premise: string;
  themes: string[];
  globalMaterials: string[];
  globalWorldInfo?: { id: string; keys: string[]; content: string; type: 'lore' | 'entity' | 'atmosphere' }[];
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
  id?: string;
  description: string;
  pacing: { expectedFrames: number; focus: 'dialogue_and_worldbuilding' | 'standard' | 'tension_and_action' };
  findings?: string[];
  interactables?: string[];
  potentialFlags?: string[];
  foreshadowing?: string;
}

export interface PlanDraftNode {
  id: string;
  title: string;
  location: string;
  requiredCharacters: string[];
  ambientDetail?: string;
  beats: PlanDraftBeat[];
  callbacks?: string[];
  connections: string[];
  mood: string;
  backgroundUrl?: string;
  backgroundMimeType?: string;
  musicUrl?: string;
}

export interface PlanDraftAct {
  id: string;
  title: string;
  objective: string;
  scenarioContext?: string;
  narrativeGuidelines?: string;
  inevitableEvents?: {
    id: string;
    title: string;
    triggerCondition: string;
    description: string;
    forcesClimax?: boolean;
    conditionalBranches?: { condition: string; effect: string }[];
  }[];
  scenarioWorldInfo?: { id: string; keys: string[]; content: string; type: 'lore' | 'entity' | 'atmosphere' }[];
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
