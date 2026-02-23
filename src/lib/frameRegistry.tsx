/**
 * Client-side frame registry.
 *
 * Maps every FrameType to a React component + optional prop transformer.
 * Using Record<FrameType, ClientFrameEntry> means TypeScript will error if
 * any FrameType is missing — adding a new type to FrameTypeSchema forces an
 * entry here.
 *
 * Usage in renderers:
 *   const entry = resolveFrameEntry(frame);
 *   const props = entry.makeProps ? entry.makeProps(baseProps) : baseProps;
 *   return <entry.component {...props} />;
 *
 * tactical-map is kept as an explicit branch in renderers because its props
 * require closures (setCurrentIndex, frames.length) that don't fit BaseFrameProps.
 */
import type { ComponentType } from 'react';
import type { FrameType, VNFrame } from '../../server/vn/types/vnFrame';
import type { VNPackage } from '../../server/vn/types/vnTypes';

import { FullScreenFrame }  from '../components/vn/frames/FullScreenFrame';
import { DialogueFrame }    from '../components/vn/frames/DialogueFrame';
import { ThreePanelFrame }  from '../components/vn/frames/ThreePanelFrame';
import { ChoiceFrame }      from '../components/vn/frames/ChoiceFrame';
import { BattleFrame }      from '../components/vn/frames/BattleFrame';
import { DiceRollFrame }    from '../components/vn/frames/DiceRollFrame';
import { SkillCheckFrame }  from '../components/vn/frames/SkillCheckFrame';
import { InventoryFrame }   from '../components/vn/frames/InventoryFrame';
import { MapFrame }         from '../components/vn/frames/MapFrame';
import { TacticalMapFrame } from '../components/vn/frames/TacticalMapFrame';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BaseFrameProps {
  frame: VNFrame;
  pack: VNPackage;
  onAdvance: () => void;
  onChoiceSelect?: (id: string) => void;
  onFreeTextSubmit?: (text: string) => void;
  onDiceResult?: (value: number) => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

export interface ClientFrameEntry {
  component: ComponentType<any>;
  /** Optional prop transformer — return a modified props object for this frame type. */
  makeProps?: (base: BaseFrameProps) => Record<string, unknown>;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/** TypeScript errors if any FrameType is missing from this Record. */
export const CLIENT_FRAME_REGISTRY: Record<FrameType, ClientFrameEntry> = {
  'full-screen':     { component: FullScreenFrame },
  'dialogue':        { component: DialogueFrame },   // fallback to FullScreenFrame handled in resolveFrameEntry
  'three-panel':     { component: ThreePanelFrame },
  'choice':          { component: ChoiceFrame },
  'battle':          { component: BattleFrame },
  'transition':      { component: FullScreenFrame }, // no dedicated TransitionFrame component
  'skill-check':     { component: SkillCheckFrame },
  'dice-roll':       { component: DiceRollFrame },
  'inventory':       { component: InventoryFrame },
  'map':             { component: MapFrame },
  'character-sheet': { component: FullScreenFrame }, // no dedicated CharacterSheetFrame component
  'tactical-map':    { component: TacticalMapFrame }, // always handled by explicit branch in renderers
};

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Returns the appropriate ClientFrameEntry for a frame.
 * Handles the dialogue → FullScreenFrame fallback for center-target dialogue.
 * Use this instead of direct CLIENT_FRAME_REGISTRY lookup.
 */
export function resolveFrameEntry(frame: VNFrame): ClientFrameEntry {
  if (frame.type === 'dialogue') {
    const hasLeftRight = frame.panels.some(p => p.id === 'left' || p.id === 'right');
    if (!hasLeftRight || frame.dialogue?.targetPanel === 'center') {
      return CLIENT_FRAME_REGISTRY['full-screen'];
    }
  }
  return CLIENT_FRAME_REGISTRY[frame.type] ?? CLIENT_FRAME_REGISTRY['full-screen'];
}
