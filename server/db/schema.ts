import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Stores VN package metadata. Assets are files on disk at assetDir.
 * The full VNPackage (minus binary assets) is stored as JSON in metaJson.
 */
export const vnPackages = sqliteTable('vn_packages', {
  /** Unique package ID (nanoid). */
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull(),
  title: text('title').notNull(),
  genre: text('genre').notNull(),
  artStyle: text('art_style').notNull(),
  /** Full VNPackage JSON excluding binary asset references. */
  metaJson: text('meta_json').notNull(),
  /** Absolute path to the generated asset directory for this package. */
  assetDir: text('asset_dir').notNull(),
});

/**
 * Tracks player narrative position within a session.
 * Updated on every storyteller turn.
 */
export const plotStates = sqliteTable('plot_states', {
  sessionId: text('session_id').primaryKey(),
  packageId: text('package_id').notNull().references(() => vnPackages.id),
  currentLocationId: text('current_location_id').notNull(),
  currentActId: text('current_act_id').notNull(),
  /** Index of the current narrative beat within the current scene. */
  currentBeat: integer('current_beat').notNull().default(0),
  /** Consecutive turns where player ignored scene exit conditions. */
  offPathTurns: integer('off_path_turns').notNull().default(0),
  /** JSON array of completed location IDs. */
  completedLocations: text('completed_locations').notNull().default('[]'),
  /** Condensed rolling summary of all past Nodes to prevent context window bloat. */
  storySummary: text('story_summary').notNull().default(''),
  /** JSON object of story flags set during gameplay. */
  flagsJson: text('flags_json').notNull().default('{}'),
  /** JSON-serialised PlayerStats for the session. */
  playerStatsJson: text('player_stats_json').notNull().default('{}'),
  /** Turn counter incremented after each storyteller turn. */
  turnCount: integer('turn_count').notNull().default(0),
  /** Global progression value toward the current act's goal. */
  globalProgression: integer('global_progression').notNull().default(0),
  /** JSON object tracking the opposing force / doom clock state. */
  opposingForceJson: text('opposing_force_json').notNull().default('{}'),
  /** JSON map of character ID → { currentLocationId, disposition } for dynamic NPC state. */
  characterStatesJson: text('character_states_json').notNull().default('{}'),
  /** JSON object for active Director-injected complication, or null. */
  activeComplicationJson: text('active_complication_json').notNull().default('null'),
  /** JSON array of encounter IDs that have been completed/exhausted. */
  exhaustedEncountersJson: text('exhausted_encounters_json').notNull().default('[]'),
  /** JSON map of locationId → Encounter[] for Director-injected encounters. */
  injectedEncountersJson: text('injected_encounters_json').notNull().default('{}'),
  /** JSON scratchpad for Director continuity across turns. */
  directorNotesJson: text('director_notes_json').notNull().default('{}'),
  updatedAt: text('updated_at').notNull(),
});

/**
 * Stores active combat state per session for tactical-map encounters.
 */
export const combatStates = sqliteTable('combat_states', {
  sessionId: text('session_id').primaryKey(),
  combatJson: text('combat_json').notNull().default('{}'),
  updatedAt: text('updated_at').notNull(),
});

/**
 * Captures high-level AI SDK request/response traces for debugging.
 */
export const aiTraces = sqliteTable('ai_traces', {
  id: text('id').primaryKey(),
  createdAt: text('created_at').notNull(),
  requestId: text('request_id'),
  sessionId: text('session_id'),
  pipeline: text('pipeline').notNull(),
  agentId: text('agent_id').notNull(),
  modelProvider: text('model_provider').notNull(),
  modelId: text('model_id').notNull(),
  durationMs: integer('duration_ms'),
  status: text('status').notNull(),
  errorJson: text('error_json'),
  inputJson: text('input_json').notNull(),
  outputJson: text('output_json'),
  metaJson: text('meta_json').notNull().default('{}'),
  /** JSON array of category tags e.g. '["image-gen","scene"]' — for filtering. */
  tags: text('tags'),
  /** Call origin e.g. 'imageAgent.generateSceneImage' — for filtering. */
  source: text('source'),
});

/**
 * Per-step details for generateText/generateObject traces.
 */
export const aiTraceSteps = sqliteTable('ai_trace_steps', {
  id: text('id').primaryKey(),
  traceId: text('trace_id').notNull().references(() => aiTraces.id),
  stepIndex: integer('step_index').notNull(),
  finishReason: text('finish_reason'),
  rawFinishReason: text('raw_finish_reason'),
  usageJson: text('usage_json'),
  requestJson: text('request_json'),
  responseJson: text('response_json'),
  toolCallsJson: text('tool_calls_json'),
  toolResultsJson: text('tool_results_json'),
  contentJson: text('content_json'),
});
