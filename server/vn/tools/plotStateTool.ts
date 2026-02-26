import { tool } from 'ai';
import { z } from 'zod';
import { db } from '../../db/index.js';
import { plotStates, vnPackages } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { VNPackage, Act, Location, WorldInfo, Encounter, PlotState, CharacterState, ActiveComplication, OpposingForceState } from '../types/vnTypes.js';
import { runDirector } from '../agents/directorAgent.js';
import { evaluateRules } from '../utils/directorRulesEngine.js';
import { vnPackageStore } from '../state/vnPackageStore.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse a JSON column from the DB, returning a fallback on failure. */
function parseJsonCol<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw || raw === 'null') return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

/** Check if an encounter is eligible given current state. */
function isEncounterEligible(
  enc: Encounter,
  flags: Record<string, unknown>,
  exhausted: string[],
  characterStates: Record<string, CharacterState>,
  locationId: string,
): boolean {
  // Already exhausted?
  if (!enc.repeatable && exhausted.includes(enc.id)) return false;

  // Prerequisites not met?
  if (enc.prerequisites?.some(flag => !flags[flag])) return false;

  // Excluded by flags?
  if (enc.excludeIfFlags?.some(flag => flags[flag])) return false;

  // Required characters not present?
  if (enc.requiredCharacters?.length) {
    for (const charId of enc.requiredCharacters) {
      const charState = characterStates[charId];
      // Character must be at this location (or have no dynamic state = default to static)
      if (charState && charState.currentLocationId && charState.currentLocationId !== locationId) {
        return false;
      }
    }
  }

  return true;
}

/** Build the characters-present list using hybrid static + dynamic overlay. */
function computeCharactersPresent(
  location: Location,
  characterStates: Record<string, CharacterState>,
  pkg: VNPackage,
): Array<{ id: string; name: string; assetKey: string; disposition: string }> {
  const charAssetKeys = Object.keys(pkg.assets.characters);
  const result: Array<{ id: string; name: string; assetKey: string; disposition: string }> = [];
  const seen = new Set<string>();

  // 1. Start with static requiredCharacters
  for (const charId of location.requiredCharacters) {
    const char = pkg.characters.find(c => c.id === charId);
    if (!char) continue;

    const dynamicState = characterStates[charId];
    // If character has been dynamically moved elsewhere, skip
    if (dynamicState?.currentLocationId && dynamicState.currentLocationId !== location.id) continue;

    const assetKey = charAssetKeys.find(k => k === charId) ?? charId;
    result.push({
      id: charId,
      name: char.name,
      assetKey,
      disposition: dynamicState?.disposition ?? char.description,
    });
    seen.add(charId);
  }

  // 2. Overlay dynamically-placed characters at this location
  for (const [charId, state] of Object.entries(characterStates)) {
    if (seen.has(charId)) continue;
    if (state.currentLocationId !== location.id) continue;

    const char = pkg.characters.find(c => c.id === charId);
    if (!char) continue;

    const assetKey = charAssetKeys.find(k => k === charId) ?? charId;
    result.push({
      id: charId,
      name: char.name,
      assetKey,
      disposition: state.disposition ?? char.description,
    });
  }

  return result;
}

/** Load PlotState from DB row, parsing JSON columns. */
function loadPlotState(row: any): PlotState {
  return {
    sessionId: row.sessionId,
    packageId: row.packageId,
    currentActId: row.currentActId,
    currentLocationId: row.currentLocationId,
    currentBeat: row.currentBeat ?? 0,
    offPathTurns: row.offPathTurns ?? 0,
    completedLocations: parseJsonCol(row.completedLocations, []),
    flags: parseJsonCol(row.flagsJson, {}),
    updatedAt: row.updatedAt,
    turnCount: row.turnCount ?? 0,
    globalProgression: row.globalProgression ?? 0,
    opposingForce: {
      currentTick: 0,
      escalationHistory: [],
      ...parseJsonCol<Partial<OpposingForceState>>(row.opposingForceJson, {}),
    },
    characterStates: parseJsonCol<Record<string, CharacterState>>(row.characterStatesJson, {}),
    activeComplication: parseJsonCol<ActiveComplication | null>(row.activeComplicationJson, null),
    exhaustedEncounters: parseJsonCol<string[]>(row.exhaustedEncountersJson, []),
    injectedEncounters: parseJsonCol<Record<string, Encounter[]>>(row.injectedEncountersJson, {}),
    directorNotes: parseJsonCol(row.directorNotesJson, {}),
  };
}

// ─── Cache for Director direction between turns ──────────────────────────────

const directorCache = new Map<string, { brief: string; turn: number }>();

// ─── Dedup lock: prevents parallel Director calls within the same turn ───────
// When the model fires N parallel plotStateTool calls, only the first does real
// work. The rest await the same Promise and return the identical result.
const plotStateLock = new Map<string, Promise<any>>();

// ─── Tool definition ─────────────────────────────────────────────────────────

/**
 * Intelligent context router for the Storyteller Agent.
 * In sandbox mode (encounters present), invokes the Director LLM to produce
 * a Direction Pack with free-form guidance. In legacy mode (beats only),
 * returns beat-based context for backward compatibility.
 */
export const plotStateTool = tool({
  description: 'Read current narrative position, Director guidance, and active state. Call at the start of each turn.',
  inputSchema: z.object({
    sessionId: z.string(),
    playerQuery: z.string().describe('The raw text the player most recently inputted'),
  }),
  execute: async ({ sessionId, playerQuery }) => {
    // Dedup lock: if another parallel call is already running, return its result
    if (plotStateLock.has(sessionId)) {
      return plotStateLock.get(sessionId)!;
    }

    const workPromise = (async () => {
    const row = db.select().from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
    if (!row) {
      return { error: 'No plot state found for session' };
    }

    const state = loadPlotState(row);

    // Load package
    let pkg: VNPackage | undefined;
    if (vnPackageStore.has(state.packageId)) {
      pkg = vnPackageStore.get(state.packageId)!;
    } else {
      const pkgRow = db.select().from(vnPackages).where(eq(vnPackages.id, state.packageId)).get();
      if (pkgRow) {
        pkg = JSON.parse(pkgRow.metaJson) as VNPackage;
        vnPackageStore.set(state.packageId, pkg);
      }
    }

    if (!pkg) return { error: 'VN package not found' };

    const act = pkg.plot.acts.find(a => a.id === state.currentActId);
    const location = act?.sandboxLocations.find(l => l.id === state.currentLocationId);

    if (!act || !location) {
      return { error: 'Current act or location not found in package' };
    }

    // --- Regex Matching for World Info ---
    const triggeredWorldInfo: WorldInfo[] = [];
    const matchingText = `${playerQuery} ${location.ambientDetail ?? ''}`.toLowerCase();

    const checkWorldInfo = (infoArray?: WorldInfo[]) => {
      if (!infoArray) return;
      for (const info of infoArray) {
        const isTriggered = info.keys.some(key => {
          try {
            const regex = new RegExp(`\\b${key}\\b`, 'i');
            return regex.test(matchingText);
          } catch {
            return matchingText.includes(key.toLowerCase());
          }
        });
        if (isTriggered) triggeredWorldInfo.push(info);
      }
    };

    checkWorldInfo(pkg.plot.globalWorldInfo);
    checkWorldInfo(act.scenarioWorldInfo);

    // ─── SANDBOX MODE: Director-powered ──────────────────────────────────
    const isSandboxMode = location.encounters && location.encounters.length > 0;

    if (isSandboxMode) {
      // Merge static encounters with Director-injected ones
      const allEncounters = [
        ...location.encounters!,
        ...(state.injectedEncounters[location.id] ?? []),
      ];

      // Filter by eligibility
      const availableEncounters = allEncounters.filter(enc =>
        isEncounterEligible(enc, state.flags, state.exhaustedEncounters, state.characterStates, location.id)
      );

      // Compute characters present
      const charactersPresent = computeCharactersPresent(location, state.characterStates, pkg);

      // Load story summary for Director context
      const storySummary = row.storySummary ?? '';

      // Run rules engine to determine if Director LLM is needed
      const previousFlags = parseJsonCol(row.flagsJson, {});
      const rules = evaluateRules(state, playerQuery, previousFlags, act);

      // Apply rules-based state updates
      if (rules.stateUpdates.complicationCleared) {
        db.update(plotStates)
          .set({ activeComplicationJson: 'null' })
          .where(eq(plotStates.sessionId, sessionId))
          .run();
        state.activeComplication = null;
      }

      let directorBrief: string;
      let suggestedEncounterId: string | null = null;

      if (rules.needsDirector) {
        console.log(`[PlotState] Director invoked: ${rules.reason}`);
        try {
          const directorResult = await runDirector({
            vnPackage: pkg,
            currentState: state,
            playerQuery,
            storySummary,
            currentAct: act,
            currentLocation: location,
            availableEncounters,
            charactersAtLocation: charactersPresent,
          });

          directorBrief = directorResult.directorBrief;
          suggestedEncounterId = directorResult.suggestedEncounterId;

          // Apply Director's state mutations to DB
          const mutations = directorResult.stateMutations;
          const updates: Record<string, any> = {};

          if (mutations.progressionDelta) {
            const newProg = state.globalProgression + mutations.progressionDelta;
            updates.globalProgression = newProg;
            console.log(`[PlotState] Progression: ${state.globalProgression} → ${newProg} (delta: +${mutations.progressionDelta}, required: ${act.globalProgression?.requiredValue ?? '?'})`);
            state.globalProgression = newProg;
          }

          // No auto-progression — progression comes only from Director awards
          // based on meaningful player choices. When stalled, Director should
          // create events/complications to push the story forward instead.

          if (mutations.doomClockDelta) {
            const newForce = {
              ...state.opposingForce,
              currentTick: state.opposingForce.currentTick + mutations.doomClockDelta,
            };
            updates.opposingForceJson = JSON.stringify(newForce);
            state.opposingForce = newForce;
          }

          if (mutations.characterUpdates?.length) {
            const newStates = { ...state.characterStates };
            for (const upd of mutations.characterUpdates) {
              const existing = newStates[upd.characterId] ?? { disposition: '' };
              if (upd.disposition) existing.disposition = upd.disposition;
              if (upd.newLocationId) existing.currentLocationId = upd.newLocationId;
              newStates[upd.characterId] = existing;
            }
            updates.characterStatesJson = JSON.stringify(newStates);
            state.characterStates = newStates;
          }

          if (mutations.setComplication !== undefined) {
            if (mutations.setComplication === null) {
              updates.activeComplicationJson = 'null';
              state.activeComplication = null;
            } else {
              const comp: ActiveComplication = {
                description: mutations.setComplication.description,
                injectedAtTurn: state.turnCount,
                maxTurns: mutations.setComplication.maxTurns,
              };
              updates.activeComplicationJson = JSON.stringify(comp);
              state.activeComplication = comp;
            }
          }

          if (mutations.exhaustEncounters?.length) {
            const newExhausted = [...new Set([...state.exhaustedEncounters, ...mutations.exhaustEncounters])];
            updates.exhaustedEncountersJson = JSON.stringify(newExhausted);
            state.exhaustedEncounters = newExhausted;
          }

          if (mutations.injectEncounters?.length) {
            const newInjected = { ...state.injectedEncounters };
            for (const inj of mutations.injectEncounters) {
              if (!newInjected[inj.locationId]) newInjected[inj.locationId] = [];
              newInjected[inj.locationId].push(inj.encounter);
            }
            updates.injectedEncountersJson = JSON.stringify(newInjected);
            state.injectedEncounters = newInjected;
          }

          if (mutations.directorNotes && Object.keys(mutations.directorNotes).length > 0) {
            updates.directorNotesJson = JSON.stringify(mutations.directorNotes);
            state.directorNotes = mutations.directorNotes;
          }

          if (Object.keys(updates).length > 0) {
            db.update(plotStates).set(updates).where(eq(plotStates.sessionId, sessionId)).run();
          }

          // ── Auto-advance act when progression threshold is met ────────────
          const requiredProg = act.globalProgression?.requiredValue ?? Infinity;
          if (requiredProg !== Infinity && state.globalProgression >= requiredProg) {
            const actIdx = pkg.plot.acts.findIndex(a => a.id === act.id);
            const nextAct = actIdx >= 0 && actIdx + 1 < pkg.plot.acts.length
              ? pkg.plot.acts[actIdx + 1]
              : null;

            if (nextAct) {
              const nextLoc = nextAct.sandboxLocations?.[0];
              console.log(`[PlotState] ACT COMPLETE: "${act.title}" → advancing to "${nextAct.title}" (${nextAct.id}), location: ${nextLoc?.id ?? 'none'}`);

              const actAdvance: Record<string, any> = {
                currentActId: nextAct.id,
                currentBeat: 0,
                offPathTurns: 0,
                globalProgression: 0,  // Reset for new act
              };

              // Mark current location as completed
              const completedLocs = [...state.completedLocations];
              if (!completedLocs.includes(state.currentLocationId)) {
                completedLocs.push(state.currentLocationId);
              }
              actAdvance.completedLocations = JSON.stringify(completedLocs);

              if (nextLoc) {
                actAdvance.currentLocationId = nextLoc.id;
              }

              db.update(plotStates).set(actAdvance).where(eq(plotStates.sessionId, sessionId)).run();

              // Prepend act transition instructions to directorBrief
              const transitionNote = `\n🔄 ACT TRANSITION: "${act.title}" is COMPLETE (progression ${state.globalProgression}/${requiredProg}). This is the FINAL turn of this act. Narrate a climactic conclusion that naturally bridges to the next phase. The next act is "${nextAct.title}" — objective: ${nextAct.objective}. After your concluding frames, emit a transition frame and a choice frame to let the player process the shift.`;
              directorBrief = transitionNote + '\n\n' + directorBrief;
            } else {
              // Final act completed — game ending
              console.log(`[PlotState] FINAL ACT COMPLETE: "${act.title}" — game should end.`);
              const endNote = `\n🏁 FINAL ACT COMPLETE: "${act.title}" is COMPLETE. This is the ENDING of the story. Narrate a satisfying conclusion based on the player's accumulated choices and flags. End with a choice frame offering 2-3 epilogue reflections.`;
              directorBrief = endNote + '\n\n' + directorBrief;
            }
          }

          // Cache the brief
          directorCache.set(sessionId, { brief: directorBrief, turn: state.turnCount });
        } catch (err) {
          console.error('[PlotState] Director LLM failed, using fallback:', err);
          directorBrief = directorCache.get(sessionId)?.brief
            ?? 'Continue the current scene naturally. Follow the player\'s lead.';
        }
      } else {
        console.log(`[PlotState] Director skipped: ${rules.reason}`);
        // Use cached Director brief or generate a basic one
        directorBrief = directorCache.get(sessionId)?.brief
          ?? 'Continue the current scene naturally. Follow the player\'s lead.';
      }

      // No stale progression fallback — progression comes only from Director
      // awards based on meaningful player choices. When stalled, Director creates
      // events/complications to drive the story forward (original design).

      // Find suggested encounter
      const suggestedEncounter = suggestedEncounterId
        ? availableEncounters.find(e => e.id === suggestedEncounterId) ?? null
        : null;

      // Re-filter available encounters after Director mutations
      const finalAvailable = allEncounters.filter(enc =>
        isEncounterEligible(enc, state.flags, state.exhaustedEncounters, state.characterStates, location.id)
      );

      return {
        // Location context
        currentActId: state.currentActId,
        actObjective: act.objective,
        currentLocationId: state.currentLocationId,
        currentLocationTitle: location.title,
        ambientDetail: location.ambientDetail ?? null,

        // Director's guidance
        directorBrief,
        activeComplication: state.activeComplication?.description ?? null,

        // Characters
        charactersPresent: computeCharactersPresent(location, state.characterStates, pkg),

        // Encounters
        currentEncounter: suggestedEncounter ? {
          id: suggestedEncounter.id,
          title: suggestedEncounter.title,
          description: suggestedEncounter.description,
          type: suggestedEncounter.type,
          pacing: suggestedEncounter.pacing,
          potentialFlags: suggestedEncounter.potentialFlags ?? [],
        } : null,
        availableEncounters: finalAvailable.map(e => ({
          id: e.id,
          title: e.title,
          priority: e.priority,
        })),

        // Progression
        globalProgression: {
          current: state.globalProgression,
          required: act.globalProgression?.requiredValue ?? 0,
          label: act.globalProgression?.trackerLabel ?? 'Progress',
        },
        opposingForce: {
          current: state.opposingForce.currentTick,
          required: act.opposingForce?.requiredValue ?? 0,
          label: act.opposingForce?.trackerLabel ?? 'Threat',
        },

        // Standard fields
        triggeredWorldInfo: triggeredWorldInfo.map(wi => ({ type: wi.type, content: wi.content })),
        activeFlags: state.flags,
        availableConnections: location.connections.map(connId => {
          const connLoc = act.sandboxLocations.find(l => l.id === connId);
          return { id: connId, title: connLoc?.title ?? connId };
        }),
        pendingInevitableEvents: act.inevitableEvents?.map(e => ({
          id: e.id,
          title: e.title,
          triggerCondition: e.triggerCondition,
        })) ?? [],
      };
    }

    // ─── LEGACY MODE: Beat-based (backward compatible) ───────────────────
    const beatIndex = state.currentBeat;
    const currentBeat = location.beats[beatIndex];

    return {
      currentActId: state.currentActId,
      actObjective: act.objective,
      currentLocationId: state.currentLocationId,
      currentLocationTitle: location.title,
      ambientDetail: location.ambientDetail ?? null,

      currentBeatDescription: currentBeat?.description ?? null,
      pacingFocus: currentBeat?.pacing.focus ?? 'standard',
      potentialFlags: currentBeat?.potentialFlags ?? [],

      triggeredWorldInfo: triggeredWorldInfo.map(wi => ({ type: wi.type, content: wi.content })),
      activeFlags: state.flags,

      availableConnections: location.connections,
      pendingInevitableEvents: act.inevitableEvents?.map(e => ({
        id: e.id,
        title: e.title,
        triggerCondition: e.triggerCondition,
      })) ?? [],
    };
    })();

    plotStateLock.set(sessionId, workPromise);
    try {
      return await workPromise;
    } finally {
      plotStateLock.delete(sessionId);
    }
  },
});
