import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import * as schema from './schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'vn.db');

const sqlite = new Database(dbPath);
// Enable WAL mode for better concurrent read performance
sqlite.pragma('journal_mode = WAL');

/** Drizzle ORM instance. Use this for all database queries. */
export const db = drizzle(sqlite, { schema });

/** Raw better-sqlite3 instance for when Drizzle is unreliable (e.g. trace inserts). */
export { sqlite };

// Create tables if they don't exist (simple migration for dev)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS vn_packages (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    title TEXT NOT NULL,
    genre TEXT NOT NULL,
    art_style TEXT NOT NULL,
    meta_json TEXT NOT NULL,
    asset_dir TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS plot_states (
    session_id TEXT PRIMARY KEY,
    package_id TEXT NOT NULL REFERENCES vn_packages(id),
    current_act_id TEXT NOT NULL,
    current_scene_id TEXT NOT NULL,
    current_beat INTEGER NOT NULL DEFAULT 0,
    off_path_turns INTEGER NOT NULL DEFAULT 0,
    completed_scenes TEXT NOT NULL DEFAULT '[]',
    flags_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ai_traces (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    request_id TEXT,
    session_id TEXT,
    pipeline TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    model_provider TEXT NOT NULL,
    model_id TEXT NOT NULL,
    duration_ms INTEGER,
    status TEXT NOT NULL,
    error_json TEXT,
    input_json TEXT NOT NULL,
    output_json TEXT,
    meta_json TEXT NOT NULL DEFAULT '{}'
  );
  CREATE TABLE IF NOT EXISTS combat_states (
    session_id TEXT PRIMARY KEY,
    combat_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ai_trace_steps (
    id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL REFERENCES ai_traces(id),
    step_index INTEGER NOT NULL,
    finish_reason TEXT,
    raw_finish_reason TEXT,
    usage_json TEXT,
    request_json TEXT,
    response_json TEXT,
    tool_calls_json TEXT,
    tool_results_json TEXT,
    content_json TEXT
  );
`);

// Add player_stats_json column if it doesn't exist (migration)
try { sqlite.exec(`ALTER TABLE plot_states ADD COLUMN player_stats_json TEXT NOT NULL DEFAULT '{}'`); } catch (_) { }

// Add tags/source columns to ai_traces if they don't exist (migration)
try { sqlite.exec(`ALTER TABLE ai_traces ADD COLUMN tags TEXT`); } catch (_) { }
try { sqlite.exec(`ALTER TABLE ai_traces ADD COLUMN source TEXT`); } catch (_) { }

// Sandbox + Director architecture columns (migration)
try { sqlite.exec(`ALTER TABLE plot_states ADD COLUMN turn_count INTEGER NOT NULL DEFAULT 0`); } catch (_) { }
try { sqlite.exec(`ALTER TABLE plot_states ADD COLUMN global_progression INTEGER NOT NULL DEFAULT 0`); } catch (_) { }
try { sqlite.exec(`ALTER TABLE plot_states ADD COLUMN opposing_force_json TEXT NOT NULL DEFAULT '{}'`); } catch (_) { }
try { sqlite.exec(`ALTER TABLE plot_states ADD COLUMN character_states_json TEXT NOT NULL DEFAULT '{}'`); } catch (_) { }
try { sqlite.exec(`ALTER TABLE plot_states ADD COLUMN active_complication_json TEXT NOT NULL DEFAULT 'null'`); } catch (_) { }
try { sqlite.exec(`ALTER TABLE plot_states ADD COLUMN exhausted_encounters_json TEXT NOT NULL DEFAULT '[]'`); } catch (_) { }
try { sqlite.exec(`ALTER TABLE plot_states ADD COLUMN injected_encounters_json TEXT NOT NULL DEFAULT '{}'`); } catch (_) { }
try { sqlite.exec(`ALTER TABLE plot_states ADD COLUMN director_notes_json TEXT NOT NULL DEFAULT '{}'`); } catch (_) { }
