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
  currentActId: text('current_act_id').notNull(),
  currentSceneId: text('current_scene_id').notNull(),
  /** Index of the current narrative beat within the current scene. */
  currentBeat: integer('current_beat').notNull().default(0),
  /** Consecutive turns where player ignored scene exit conditions. */
  offPathTurns: integer('off_path_turns').notNull().default(0),
  /** JSON array of completed scene IDs. */
  completedScenes: text('completed_scenes').notNull().default('[]'),
  /** JSON object of story flags set during gameplay. */
  flagsJson: text('flags_json').notNull().default('{}'),
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
