/**
 * Reproduce a timed-out storyteller call to check if it's a transient Gemini issue
 * or a systematic problem with the prompt/payload size.
 *
 * Usage: npx tsx test_timeout_repro.ts [traceId]
 *   - Default trace: 0a89e134 (0-step timeout, 120s, gemini-3-pro-preview)
 */
import 'dotenv/config';
import Database from 'better-sqlite3';
import { createStorytellerAgent } from './server/vn/agents/storytellerChatAgent.js';
import { getActiveModelInfo } from './server/lib/modelFactory.js';
import { vnPackageStore } from './server/vn/state/vnPackageStore.js';

const DB_PATH = './server/db/vn.db';
const DEFAULT_TRACE_ID = '0a89e134-5618-4d04-9b41-a54e60bd9f9e';

async function main() {
  const traceId = process.argv[2] || DEFAULT_TRACE_ID;
  const db = new Database(DB_PATH, { readonly: true });

  // Load the trace
  const trace = db.prepare('SELECT * FROM ai_traces WHERE id = ?').get(traceId) as any;
  if (!trace) {
    console.error(`Trace ${traceId} not found`);
    process.exit(1);
  }

  console.log(`\n=== Reproducing trace ${traceId} ===`);
  console.log(`  Original: ${trace.model_id} | ${trace.duration_ms}ms | ${trace.status}`);
  console.log(`  Session: ${trace.session_id}`);
  console.log(`  Created: ${trace.created_at}`);

  const input = JSON.parse(trace.input_json);

  // Load the VN package for the session
  const plotRow = db.prepare('SELECT package_id FROM plot_states WHERE session_id = ?').get(trace.session_id) as any;
  if (!plotRow) {
    console.error(`No plot state for session ${trace.session_id}`);
    process.exit(1);
  }

  const pkgRow = db.prepare('SELECT meta_json FROM vn_packages WHERE id = ?').get(plotRow.package_id) as any;
  if (!pkgRow) {
    console.error(`Package ${plotRow.package_id} not found`);
    process.exit(1);
  }

  const vnPackage = JSON.parse(pkgRow.meta_json);
  vnPackageStore.set(vnPackage.id, vnPackage);

  const { provider, modelId } = getActiveModelInfo('storyteller');
  console.log(`  Current model: ${provider}/${modelId}`);
  console.log(`  Input messages: ${input.prompt?.length ?? 0}`);

  // Reconstruct messages from the trace input
  const messages = input.prompt ?? [];
  console.log(`\n--- Sending to ${modelId} with 240s timeout ---\n`);

  const agent = createStorytellerAgent(vnPackage, trace.session_id);
  const startMs = Date.now();

  try {
    const result = await agent.stream({
      messages,
      timeout: 240_000,
    });

    let frameCount = 0;
    let stepCount = 0;
    for await (const event of result.fullStream) {
      if (event.type === 'tool-result') {
        stepCount++;
        if (event.toolName === 'frameBuilderTool') {
          frameCount++;
          const output = event.output as any;
          console.log(`  [${((Date.now() - startMs) / 1000).toFixed(1)}s] Frame ${frameCount}: ${output?.frame?.type ?? 'unknown'} ${output?.ok ? '(ok)' : '(err)'}`);
        } else {
          console.log(`  [${((Date.now() - startMs) / 1000).toFixed(1)}s] Tool: ${event.toolName}`);
        }
      }
    }

    const elapsed = Date.now() - startMs;
    const text = await result.text;
    console.log(`\n=== SUCCESS in ${(elapsed / 1000).toFixed(1)}s ===`);
    console.log(`  Steps: ${stepCount} | Frames: ${frameCount}`);
    if (text?.trim()) console.log(`  Text: ${text.substring(0, 200)}`);
  } catch (err: any) {
    const elapsed = Date.now() - startMs;
    console.log(`\n=== FAILED in ${(elapsed / 1000).toFixed(1)}s ===`);
    console.log(`  Error: ${err?.name}: ${err?.message}`);
  }

  db.close();
}

main().catch(console.error);
