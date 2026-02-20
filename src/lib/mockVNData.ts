import type { VNFrame } from '../../server/vn/types/vnFrame';
import type { VNPackage } from '../../server/vn/types/vnTypes';

// ── Mock VNPackage — uses real public + generated assets ──────────────────────

export const MOCK_PACK: VNPackage = {
  id: 'preview',
  createdAt: new Date().toISOString(),
  title: 'Frame Preview',
  genre: 'noir',
  artStyle: 'Dark atmospheric',
  language: 'en',
  setting: { world: 'Neo-Tokyo', era: '2077', tone: 'noir' },
  characters: [
    { id: 'char_detective', name: 'Detective', role: 'protagonist', description: 'A weary investigator', imagePrompt: '' },
    { id: 'char_kim',       name: 'Kim',       role: 'ally',        description: 'A sharp-witted partner', imagePrompt: '' },
    { id: 'char_jax',       name: 'Jax',       role: 'protagonist', description: 'Frontier pilot',        imagePrompt: '' },
    { id: 'char_echo',      name: 'E.C.H.O.',  role: 'ally',        description: 'AI companion',          imagePrompt: '' },
    { id: 'char_elara',     name: 'Elara',     role: 'npc',         description: 'Station medic',         imagePrompt: '' },
  ],
  plot: {
    premise: 'Preview',
    themes: ['preview'],
    acts: [{
      id: 'act_1', title: 'Act I',
      scenes: [{ id: 'scene_1', title: 'Preview', location: 'bg_city', requiredCharacters: ['char_detective'], beats: ['preview'], exitConditions: ['exit'], mood: 'ambient' }],
    }],
    possibleEndings: ['preview end'],
  },
  assets: {
    backgrounds: {
      bg_city:    { url: '/assets/background-city.png',                                                                mimeType: 'image/png' },
      bg_fight:   { url: '/assets/background-fight.png',                                                               mimeType: 'image/png' },
      bg_cockpit: { url: '/generated/bee1db66-55c1-43da-8969-de76caee89fd/bg_cockpit.png',                             mimeType: 'image/png' },
      bg_outpost: { url: '/generated/bee1db66-55c1-43da-8969-de76caee89fd/bg_outpost.png',                             mimeType: 'image/png' },
      bg_hangar:  { url: '/generated/bee1db66-55c1-43da-8969-de76caee89fd/bg_station_hangar.png',                      mimeType: 'image/png' },
    },
    characters: {
      char_detective: { url: '/assets/character-detective.png',                                                        mimeType: 'image/png' },
      char_kim:       { url: '/assets/character-kim.png',                                                              mimeType: 'image/png' },
      char_jax:       { url: '/generated/bee1db66-55c1-43da-8969-de76caee89fd/char_jax_neutral.png',                   mimeType: 'image/png' },
      char_echo:      { url: '/generated/bee1db66-55c1-43da-8969-de76caee89fd/char_echo_flicker.png',                  mimeType: 'image/png' },
      char_elara:     { url: '/generated/bee1db66-55c1-43da-8969-de76caee89fd/char_elara_scared.png',                  mimeType: 'image/png' },
      portrait_detective: { url: '/assets/portrait-detective.png',                                                     mimeType: 'image/png' },
    },
    music: {},
  },
  meta: { totalScenes: 1, estimatedDuration: '1 min', generationMs: 0 },
};

// ── Frame group types ─────────────────────────────────────────────────────────

export interface PreviewVariant { label: string; frame: VNFrame }
export interface PreviewGroup   { label: string; variants: PreviewVariant[] }

// ── Shared HUD ────────────────────────────────────────────────────────────────

const HUD = { chapter: 'CH.1  THE OLD CITY', scene: 'HARBOR DISTRICT', showNav: true };
const HUD2 = { chapter: 'CH.2  OUTER RIM', scene: 'FRONTIER STATION', showNav: true };

// ── Frame catalog ─────────────────────────────────────────────────────────────

export const PREVIEW_GROUPS: PreviewGroup[] = [

  // ── 01  Full Screen ──────────────────────────────────────────────────────────
  {
    label: 'FULL SCREEN',
    variants: [
      {
        label: 'Narration',
        frame: {
          id: 'fs-narr', type: 'full-screen', hud: HUD,
          panels: [{ id: 'center', backgroundAsset: 'bg_city' }],
          narration: { text: 'The city never sleeps. It breathes, it watches, it remembers. And somewhere between the neon and the fog — the truth is waiting for someone brave enough to look.' },
        },
      },
      {
        label: 'With Character',
        frame: {
          id: 'fs-char', type: 'full-screen', hud: HUD,
          panels: [{ id: 'center', backgroundAsset: 'bg_city', characterAsset: 'char_detective', dimmed: false }],
          narration: { text: 'Three days without sleep. The case keeps circling back to the same name — a name that opens every door and closes every witness.' },
          effects: [{ type: 'fade-in', durationMs: 800, intensity: 0.6 }],
        },
      },
      {
        label: 'Sci-fi Scene',
        frame: {
          id: 'fs-scifi', type: 'full-screen', hud: HUD2,
          panels: [{ id: 'center', backgroundAsset: 'bg_cockpit', characterAsset: 'char_jax', dimmed: false }],
          narration: { text: 'The jump drive spins up. Outside the viewport, stars become lines become nothing. Another system, another set of problems waiting to be solved.' },
        },
      },
    ],
  },

  // ── 02  Dialogue ─────────────────────────────────────────────────────────────
  {
    label: 'DIALOGUE',
    variants: [
      {
        label: 'Right Active',
        frame: {
          id: 'dial-right', type: 'dialogue', hud: HUD,
          panels: [
            { id: 'left',  backgroundAsset: 'bg_city', characterAsset: 'char_detective', dimmed: true,  panelWeight: 38 },
            { id: 'right', backgroundAsset: 'bg_city', characterAsset: 'char_kim', characterFlipped: true, dimmed: false, panelWeight: 62 },
          ],
          dialogue: { speaker: 'DETECTIVE KIM', text: '"So, you finally decided to show up. We have a situation at the old docks — and you\'re not going to like what we found."', targetPanel: 'right' },
        },
      },
      {
        label: 'Left Active',
        frame: {
          id: 'dial-left', type: 'dialogue', hud: HUD,
          panels: [
            { id: 'left',  backgroundAsset: 'bg_city', characterAsset: 'char_detective', dimmed: false, panelWeight: 62 },
            { id: 'right', backgroundAsset: 'bg_city', characterAsset: 'char_kim', characterFlipped: true, dimmed: true, panelWeight: 38 },
          ],
          dialogue: { speaker: 'DETECTIVE', text: '"The evidence is right here. You can\'t deny it — unless you\'re telling me you\'ve never seen this man before in your life."', targetPanel: 'left' },
        },
      },
      {
        label: 'Narrator Bar',
        frame: {
          id: 'dial-narr', type: 'dialogue', hud: HUD,
          panels: [
            { id: 'left',  backgroundAsset: 'bg_city', characterAsset: 'char_detective', dimmed: true,  panelWeight: 38 },
            { id: 'right', backgroundAsset: 'bg_city', characterAsset: 'char_kim', characterFlipped: true, dimmed: false, panelWeight: 62 },
          ],
          narration: { text: 'The rain hasn\'t stopped in three days. Someone wants us here before the evidence washes away.' },
        },
      },
      {
        label: 'Sci-fi Dialogue',
        frame: {
          id: 'dial-scifi', type: 'dialogue', hud: HUD2,
          panels: [
            { id: 'left',  backgroundAsset: 'bg_cockpit', characterAsset: 'char_echo', dimmed: true,  panelWeight: 38 },
            { id: 'right', backgroundAsset: 'bg_cockpit', characterAsset: 'char_jax', characterFlipped: true, dimmed: false, panelWeight: 62 },
          ],
          dialogue: { speaker: 'JAX', text: '"E.C.H.O., how long until the station comes back online?" "Seventeen minutes. Assuming they haven\'t changed the access codes again."', targetPanel: 'right' },
        },
      },
    ],
  },

  // ── 03  Three Panel ──────────────────────────────────────────────────────────
  {
    label: 'THREE PANEL',
    variants: [
      {
        label: 'Multi-char',
        frame: {
          id: 'tp-multi', type: 'three-panel', hud: HUD,
          panels: [
            { id: 'left',   backgroundAsset: 'bg_city', characterAsset: 'char_detective', dimmed: true },
            { id: 'center', backgroundAsset: 'bg_city' },
            { id: 'right',  backgroundAsset: 'bg_city', characterAsset: 'char_kim', characterFlipped: true, dimmed: false },
          ],
          narration: { text: 'She slides the photograph across the table without looking up. The fluorescent light flickers once, then holds.' },
          dialogue: { speaker: 'DETECTIVE KIM', text: '"Look at the photo."', targetPanel: 'right' },
        },
      },
      {
        label: 'Narrator Only',
        frame: {
          id: 'tp-narr', type: 'three-panel', hud: HUD,
          panels: [
            { id: 'left',   backgroundAsset: 'bg_city', characterAsset: 'char_detective', dimmed: true },
            { id: 'center', backgroundAsset: 'bg_city' },
            { id: 'right',  backgroundAsset: 'bg_city', dimmed: true },
          ],
          narration: { text: 'An hour passes. Then another. Outside, the city hums its endless frequency — indifferent as always to whatever happens in rooms like this.' },
        },
      },
      {
        label: 'Sci-fi Three',
        frame: {
          id: 'tp-scifi', type: 'three-panel', hud: HUD2,
          panels: [
            { id: 'left',   backgroundAsset: 'bg_hangar', characterAsset: 'char_jax',   dimmed: false },
            { id: 'center', backgroundAsset: 'bg_hangar' },
            { id: 'right',  backgroundAsset: 'bg_hangar', characterAsset: 'char_elara', characterFlipped: true, dimmed: true },
          ],
          narration: { text: 'The hangar bay is quiet. Too quiet for a station that should be running at full capacity.' },
          dialogue: { speaker: 'JAX', text: '"Where is everyone?"', targetPanel: 'left' },
        },
      },
    ],
  },

  // ── 04  Choice ───────────────────────────────────────────────────────────────
  {
    label: 'CHOICE',
    variants: [
      {
        label: 'With Free Text',
        frame: {
          id: 'choice-full', type: 'choice', hud: HUD,
          panels: [
            { id: 'left',  backgroundAsset: 'bg_city', characterAsset: 'char_detective', dimmed: true },
            { id: 'right', backgroundAsset: 'bg_city', characterAsset: 'char_kim', characterFlipped: true, dimmed: false },
          ],
          choices: [
            { id: 'a', text: 'Ask about the murder' },
            { id: 'b', text: 'Show the evidence' },
            { id: 'c', text: 'Ask about the old docks' },
            { id: 'd', text: 'Leave' },
          ],
          showFreeTextInput: true,
        },
      },
      {
        label: 'Choice Only',
        frame: {
          id: 'choice-only', type: 'choice', hud: HUD,
          panels: [
            { id: 'left',  backgroundAsset: 'bg_city', characterAsset: 'char_detective', dimmed: true },
            { id: 'right', backgroundAsset: 'bg_city', dimmed: false },
          ],
          choices: [
            { id: 'a', text: 'Follow the suspect into the alley' },
            { id: 'b', text: 'Call for backup — this feels wrong' },
            { id: 'c', text: 'Search the abandoned vehicle' },
          ],
          showFreeTextInput: false,
        },
      },
      {
        label: 'Sci-fi Choice',
        frame: {
          id: 'choice-scifi', type: 'choice', hud: HUD2,
          panels: [
            { id: 'left',  backgroundAsset: 'bg_outpost', characterAsset: 'char_jax',  dimmed: true },
            { id: 'right', backgroundAsset: 'bg_outpost', characterAsset: 'char_echo', characterFlipped: true, dimmed: false },
          ],
          choices: [
            { id: 'a', text: 'Override the airlock manually' },
            { id: 'b', text: 'Let E.C.H.O. crack the system' },
            { id: 'c', text: 'Find another way in' },
            { id: 'd', text: 'Retreat to the ship' },
          ],
          showFreeTextInput: true,
        },
      },
    ],
  },

  // ── 05  Battle ───────────────────────────────────────────────────────────────
  {
    label: 'BATTLE',
    variants: [
      {
        label: 'Mid-combat',
        frame: {
          id: 'battle-mid', type: 'battle', hud: HUD,
          panels: [{ id: 'center', backgroundAsset: 'bg_fight' }],
          battle: {
            player: { name: 'DETECTIVE', level: 12, hp: 68, maxHp: 100, portraitAsset: 'portrait_detective' },
            enemies: [
              { name: 'ENFORCER', hp: 74, maxHp: 100 },
              { name: 'FIXER',    hp: 51, maxHp: 80  },
            ],
            combatLog: [
              'ROUND 1 — COMBAT BEGINS',
              'ENFORCER moves forward.',
              'FIXER flanks from the left.',
              'Your move.',
            ],
            skills: [
              { icon: '⚔', label: 'STRIKE',     active: true  },
              { icon: '⊙', label: 'ANALYSE',    active: false },
              { icon: '◆', label: 'INTIMIDATE', active: false },
              { icon: '▷', label: 'FLEE',       active: false },
            ],
            round: 1,
          },
        },
      },
      {
        label: 'Critical HP',
        frame: {
          id: 'battle-low', type: 'battle', hud: HUD,
          panels: [{ id: 'center', backgroundAsset: 'bg_fight' }],
          battle: {
            player: { name: 'DETECTIVE', level: 12, hp: 18, maxHp: 100, portraitAsset: 'portrait_detective' },
            enemies: [
              { name: 'ENFORCER', hp: 12, maxHp: 100 },
            ],
            combatLog: [
              'ENFORCER: "You\'re finished."',
              'Critical hit — 42 damage!',
              'DETECTIVE staggers.',
              'Low HP — fight or flee.',
            ],
            skills: [
              { icon: '⚔', label: 'STRIKE',     active: false },
              { icon: '⊙', label: 'ANALYSE',    active: false },
              { icon: '◆', label: 'INTIMIDATE', active: false },
              { icon: '▷', label: 'FLEE',       active: true  },
            ],
            round: 5,
          },
        },
      },
    ],
  },

  // ── SKILL CHECK ───────────────────────────────────────────────────────────────
  {
    label: 'SKILL CHECK',
    variants: [
      {
        label: 'Success',
        frame: {
          id: 'sc-success', type: 'skill-check' as const, hud: HUD,
          panels: [{ id: 'center' as const, backgroundAsset: 'bg_city' }],
          skillCheck: {
            stat: 'intelligence', statValue: 12, difficulty: 10,
            roll: 7, modifier: 1, total: 8, succeeded: true,
            description: 'Perception check — spotting the hidden switch behind the bookcase',
          },
        },
      },
      {
        label: 'Failure',
        frame: {
          id: 'sc-fail', type: 'skill-check' as const, hud: HUD,
          panels: [{ id: 'center' as const, backgroundAsset: 'bg_fight' }],
          skillCheck: {
            stat: 'luck', statValue: 6, difficulty: 14,
            roll: 3, modifier: -2, total: 1, succeeded: false,
            description: 'Luck check — attempting to bluff your way past the guard',
          },
        },
      },
      {
        label: 'High Roll',
        frame: {
          id: 'sc-crit', type: 'skill-check' as const, hud: HUD,
          panels: [{ id: 'center' as const, backgroundAsset: 'bg_city' }],
          skillCheck: {
            stat: 'charisma', statValue: 16, difficulty: 15,
            roll: 18, modifier: 3, total: 21, succeeded: true,
            description: 'Persuasion check — convincing the informant to talk',
          },
        },
      },
    ],
  },

  // ── INVENTORY ─────────────────────────────────────────────────────────────────
  {
    label: 'INVENTORY',
    variants: [
      {
        label: 'View Mode',
        frame: {
          id: 'inv-view', type: 'inventory' as const, hud: HUD,
          panels: [{ id: 'center' as const, backgroundAsset: 'bg_city' }],
          inventoryData: {
            mode: 'view' as const,
            items: [
              { id: 'badge', name: 'Detective Badge', description: 'Your official badge. Opens some doors that money cannot.', icon: '🔰', quantity: 1, equipped: true },
              { id: 'revolver', name: 'Revolver', description: '5 rounds remaining. Use with caution.', icon: '🔫', quantity: 1, equipped: false },
              { id: 'flask', name: 'Whiskey Flask', description: 'Half-empty. Or half-full. Restores 5 HP when used.', icon: '🧪', quantity: 1, effect: '+5 HP on use' },
              { id: 'note', name: 'Encrypted Note', description: 'A crumpled note with what appear to be coordinates. Undeciphered.', icon: '📝', quantity: 1 },
              { id: 'key', name: 'Skeleton Key', description: 'Opens basic locks. Acquired from the pawnbroker.', icon: '🗝️', quantity: 1 },
              { id: 'coins', name: 'Cash', description: 'Enough for a meal, a bribe, or a one-way ticket out.', icon: '💰', quantity: 3 },
            ],
          },
        },
      },
      {
        label: 'Select Mode',
        frame: {
          id: 'inv-select', type: 'inventory' as const, hud: HUD,
          panels: [{ id: 'center' as const, backgroundAsset: 'bg_city' }],
          inventoryData: {
            mode: 'select' as const,
            prompt: 'The lock requires a tool. Choose an item to use:',
            items: [
              { id: 'key', name: 'Skeleton Key', description: 'Opens basic locks.', icon: '🗝️', quantity: 1 },
              { id: 'revolver', name: 'Revolver', description: 'Force it open. Noisy.', icon: '🔫', quantity: 1 },
              { id: 'badge', name: 'Detective Badge', description: 'Show authority. Might work.', icon: '🔰', quantity: 1 },
            ],
          },
        },
      },
    ],
  },

  // ── TACTICAL MAP ─────────────────────────────────────────────────────────────
  {
    label: 'TACTICAL MAP',
    variants: [
      {
        label: 'Forest Battle',
        frame: {
          id: 'tactical-1', type: 'tactical-map' as const, hud: HUD,
          panels: [],
          tacticalMapData: {
            mapImageUrl: '',
            gridCols: 10,
            gridRows: 7,
            tokens: [
              { id: 'player', type: 'player' as const, label: 'Hero', icon: '\uD83E\uDDD9', col: 1, row: 3, hp: 20, maxHp: 20, attack: 14, defense: 12, moveRange: 4, attackRange: 1, hasActed: false, hasMoved: false, statusEffects: [] },
              { id: 'enemy1', type: 'enemy' as const, label: 'Guard', icon: '\u2694\uFE0F', col: 7, row: 2, hp: 15, maxHp: 15, attack: 12, defense: 11, moveRange: 3, attackRange: 1, aiPattern: 'aggressive' as const, hasActed: false, hasMoved: false, statusEffects: [] },
              { id: 'enemy2', type: 'enemy' as const, label: 'Archer', icon: '\uD83C\uDFF9', col: 8, row: 5, hp: 10, maxHp: 10, attack: 10, defense: 10, moveRange: 2, attackRange: 3, aiPattern: 'defensive' as const, hasActed: false, hasMoved: false, statusEffects: [] },
              { id: 'obj1', type: 'objective' as const, label: 'Chest', icon: '\uD83D\uDCE6', col: 9, row: 3, hp: 1, maxHp: 1, attack: 0, defense: 0, moveRange: 0, attackRange: 0, hasActed: false, hasMoved: false, statusEffects: [] },
            ],
            terrain: [
              { col: 3, row: 1, type: 'blocked' as const, icon: '\uD83C\uDF32' },
              { col: 3, row: 2, type: 'blocked' as const, icon: '\uD83C\uDF32' },
              { col: 5, row: 4, type: 'cover' as const, icon: '\uD83E\uDEA8' },
              { col: 6, row: 3, type: 'difficult' as const, icon: '\uD83D\uDCA7' },
            ],
            combat: { round: 1, phase: 'player' as const, turnOrder: ['player', 'enemy1', 'enemy2'], activeTokenId: 'player', log: ['Combat begins!', 'Your turn.'], isComplete: false },
            rules: { playerMoveRange: 4, playerAttackRange: 1, showGrid: true },
          },
        },
      },
      {
        label: 'Near Victory',
        frame: {
          id: 'tactical-2', type: 'tactical-map' as const, hud: HUD,
          panels: [],
          tacticalMapData: {
            mapImageUrl: '',
            gridCols: 10,
            gridRows: 7,
            tokens: [
              { id: 'player', type: 'player' as const, label: 'Hero', icon: '\uD83E\uDDD9', col: 1, row: 3, hp: 20, maxHp: 20, attack: 14, defense: 12, moveRange: 4, attackRange: 1, hasActed: false, hasMoved: false, statusEffects: [] },
              { id: 'enemy1', type: 'enemy' as const, label: 'Guard', icon: '\u2694\uFE0F', col: 7, row: 2, hp: 2, maxHp: 15, attack: 12, defense: 11, moveRange: 3, attackRange: 1, aiPattern: 'aggressive' as const, hasActed: false, hasMoved: false, statusEffects: [] },
              { id: 'enemy2', type: 'enemy' as const, label: 'Archer', icon: '\uD83C\uDFF9', col: 8, row: 5, hp: 1, maxHp: 10, attack: 10, defense: 10, moveRange: 2, attackRange: 3, aiPattern: 'defensive' as const, hasActed: false, hasMoved: false, statusEffects: [] },
              { id: 'obj1', type: 'objective' as const, label: 'Chest', icon: '\uD83D\uDCE6', col: 9, row: 3, hp: 1, maxHp: 1, attack: 0, defense: 0, moveRange: 0, attackRange: 0, hasActed: false, hasMoved: false, statusEffects: [] },
            ],
            terrain: [
              { col: 3, row: 1, type: 'blocked' as const, icon: '\uD83C\uDF32' },
              { col: 3, row: 2, type: 'blocked' as const, icon: '\uD83C\uDF32' },
              { col: 5, row: 4, type: 'cover' as const, icon: '\uD83E\uDEA8' },
              { col: 6, row: 3, type: 'difficult' as const, icon: '\uD83D\uDCA7' },
            ],
            combat: { round: 3, phase: 'player' as const, turnOrder: ['player', 'enemy1', 'enemy2'], activeTokenId: 'player', log: ['Round 3 begins.', 'Guard is barely standing.', 'Archer is on their last legs.', 'Finish them!'], isComplete: false },
            rules: { playerMoveRange: 4, playerAttackRange: 1, showGrid: true },
          },
        },
      },
    ],
  },

  // ── MAP ───────────────────────────────────────────────────────────────────────
  {
    label: 'MAP',
    variants: [
      {
        label: 'City Map',
        frame: {
          id: 'map-city', type: 'map' as const, hud: HUD,
          panels: [{ id: 'center' as const, backgroundAsset: 'bg_city' }],
          mapData: {
            backgroundAsset: 'bg_city',
            currentLocationId: 'harbor',
            level: 'region' as const,
            locations: [
              { id: 'harbor', label: 'Harbor District', x: 22, y: 68, accessible: true, visited: true, description: 'Where your investigation began.' },
              { id: 'downtown', label: 'Downtown', x: 52, y: 28, accessible: true, visited: false, description: 'Corporate towers and dirty money.' },
              { id: 'market', label: 'Night Market', x: 72, y: 55, accessible: true, visited: false, description: 'Information for sale — if you know who to ask.' },
              { id: 'factory', label: 'Old Factory', x: 80, y: 78, accessible: false, visited: false, description: 'Locked down. Need a warehouse key.' },
              { id: 'precinct', label: 'Police Precinct', x: 38, y: 44, accessible: true, visited: false, description: 'Your old colleagues. Not all friendly.' },
            ],
          },
        },
      },
      {
        label: 'Station Map',
        frame: {
          id: 'map-station', type: 'map' as const, hud: HUD2,
          panels: [{ id: 'center' as const, backgroundAsset: 'bg_hangar' }],
          mapData: {
            backgroundAsset: 'bg_hangar',
            currentLocationId: 'hangar',
            level: 'region' as const,
            locations: [
              { id: 'hangar', label: 'Hangar Bay', x: 50, y: 72, accessible: true, visited: true },
              { id: 'bridge', label: 'Bridge', x: 50, y: 20, accessible: true, visited: false },
              { id: 'medbay', label: 'Med Bay', x: 22, y: 45, accessible: true, visited: true, description: 'Elara is here.' },
              { id: 'cargo', label: 'Cargo Hold', x: 78, y: 45, accessible: false, visited: false, description: 'Sealed — power failure.' },
            ],
          },
        },
      },
    ],
  },

  // ── LAYERED MAP ─────────────────────────────────────────────────────────────
  {
    label: 'LAYERED MAP',
    variants: [
      {
        label: 'Region Map',
        frame: {
          id: 'layered-region', type: 'map' as const, hud: HUD,
          panels: [{ id: 'center' as const, backgroundAsset: 'bg_city' }],
          mapData: {
            backgroundAsset: 'bg_city',
            currentLocationId: 'town',
            level: 'region' as const,
            locations: [
              { id: 'town', label: 'Town', x: 20, y: 40, accessible: true, visited: true, description: 'A quiet trading town on the river.' },
              { id: 'forest', label: 'Dark Forest', x: 50, y: 30, accessible: true, visited: false, description: 'Ancient woods teeming with creatures.' },
              { id: 'dungeon', label: 'Dungeon Entrance', x: 72, y: 60, accessible: true, visited: false, description: 'A crumbling stairway leading underground.' },
              { id: 'castle', label: 'Ruined Castle', x: 85, y: 20, accessible: false, visited: false, description: 'Sealed by dark magic. A key is needed.' },
            ],
          },
        },
      },
      {
        label: 'Area Map',
        frame: {
          id: 'layered-area', type: 'map' as const, hud: HUD,
          panels: [{ id: 'center' as const, backgroundAsset: 'bg_city' }],
          mapData: {
            backgroundAsset: 'bg_city',
            currentLocationId: 'entrance',
            level: 'area' as const,
            locations: [
              { id: 'entrance', label: 'Dungeon Entrance', x: 15, y: 50, accessible: true, visited: true, description: 'You stand at the threshold.' },
              { id: 'guard_post', label: 'Guard Post', x: 35, y: 35, accessible: true, visited: false, description: 'Goblin guards block the path.', encounterType: 'combat' as const },
              { id: 'shrine', label: 'Old Shrine', x: 50, y: 65, accessible: true, visited: false, description: 'A crumbling shrine hums with energy.', encounterType: 'explore' as const },
              { id: 'prisoner', label: 'Prison Cell', x: 70, y: 40, accessible: true, visited: false, description: 'Someone is calling for help.', encounterType: 'dialogue' as const },
              { id: 'boss_room', label: 'Boss Chamber', x: 88, y: 50, accessible: false, visited: false, description: 'Sealed. Defeat the guards first.', encounterType: 'combat' as const },
            ],
          },
        },
      },
    ],
  },
];
