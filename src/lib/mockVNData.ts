import type { VNFrame } from '../../server/vn/types/vnFrame';
import type { VNPackage } from '../../server/vn/types/vnTypes';

// ── Mock VNPackage — uses real public + generated assets ──────────────────────

export const MOCK_PACK: VNPackage = {
  id: 'preview',
  createdAt: new Date().toISOString(),
  title: 'Frame Preview',
  genre: 'noir',
  artStyle: 'Dark atmospheric',
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
];
