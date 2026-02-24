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
  personalArc?: {
    want: string;
    need: string;
    arcEncounters: PlanDraftEncounter[];
  };
}

export interface PlanDraftEncounter {
  id: string;
  title: string;
  description: string;
  type: 'discovery' | 'npc_interaction' | 'combat' | 'puzzle' | 'atmospheric';
  pacing: { expectedFrames: number; focus: 'dialogue_and_worldbuilding' | 'standard' | 'tension_and_action' };
  prerequisites?: string[];
  excludeIfFlags?: string[];
  requiredCharacters?: string[];
  givesProgression?: number;
  potentialFlags?: string[];
  findings?: string[];
  interactables?: string[];
  arcCharacterId?: string;
  arcPhase?: 'introduction' | 'development' | 'crisis' | 'resolution';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  repeatable?: boolean;
}

export interface PlanDraftNode {
  id: string;
  title: string;
  location: string;
  requiredCharacters: string[];
  ambientDetail?: string;
  encounters: PlanDraftEncounter[];
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
  globalProgression?: {
    requiredValue: number;
    trackerLabel: string;
  };
  opposingForce?: {
    trackerLabel: string;
    requiredValue: number;
    escalationEvents: { threshold: number; description: string }[];
  };
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
