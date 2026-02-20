import { v4 as uuidv4 } from 'uuid';

export interface PlanDraftPremise {
  title: string;
  artStyle: string;
  setting: { world: string; era: string; tone: string };
  premise: string;
  themes: string[];
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

export interface PlanDraftAct {
  id: string;
  title: string;
}

export interface PlanDraftScene {
  id: string;
  actId: string;
  title: string;
  location: string;
  requiredCharacters: string[];
  beats: string[];
  exitConditions: string[];
  mood: string;
  backgroundUrl?: string;
  backgroundMimeType?: string;
  musicUrl?: string;
}

export interface PlanDraft {
  premise?: PlanDraftPremise;
  characters: PlanDraftCharacter[];
  acts: PlanDraftAct[];
  scenes: PlanDraftScene[];
}

export interface PlanSession {
  sessionId: string;
  packageId: string;
  draft: PlanDraft;
  createdAt: Date;
}

const store = new Map<string, PlanSession>();

export function getOrCreatePlanSession(sessionId: string): PlanSession {
  if (!store.has(sessionId)) {
    store.set(sessionId, {
      sessionId,
      packageId: uuidv4(),
      draft: { characters: [], acts: [], scenes: [] },
      createdAt: new Date(),
    });
  }
  return store.get(sessionId)!;
}

export function clearPlanSession(sessionId: string): void {
  store.delete(sessionId);
}
