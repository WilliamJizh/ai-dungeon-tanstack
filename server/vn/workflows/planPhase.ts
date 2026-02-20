import type { ServerResponse } from 'http';
import { runPlanningAgent, type PlanInput } from '../agents/planningAgent.js';
import { vnPackageStore } from '../state/vnPackageStore.js';

interface PhaseLogger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
}

interface RunPlanPhaseOptions {
  requestId?: string;
  log?: PhaseLogger;
}

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return {
    name: 'UnknownError',
    message: String(err),
    stack: undefined,
  };
}

/**
 * Orchestrates the planning agent with SSE emission.
 * Emits progress events via reply.raw.write for real-time client updates.
 */
export async function runPlanPhase(
  input: PlanInput,
  res: ServerResponse,
  options: RunPlanPhaseOptions = {},
): Promise<void> {
  const requestId = options.requestId ?? 'unknown';
  const log = options.log ?? {
    info: (obj: Record<string, unknown>, msg?: string) => {
      console.log(msg ?? '[VN plan][info]', obj);
    },
    warn: (obj: Record<string, unknown>, msg?: string) => {
      console.warn(msg ?? '[VN plan][warn]', obj);
    },
    error: (obj: Record<string, unknown>, msg?: string) => {
      console.error(msg ?? '[VN plan][error]', obj);
    },
  };

  let eventSeq = 0;
  const startedAt = Date.now();

  const emit = (eventName: string, data: object) => {
    const payload = JSON.stringify(data);
    eventSeq += 1;
    log.info({
      requestId,
      eventName,
      eventSeq,
      payloadBytes: Buffer.byteLength(payload),
      elapsedMs: Date.now() - startedAt,
    }, '[VN plan] SSE emit');
    res.write(`event: ${eventName}\ndata: ${payload}\n\n`);
  };

  try {
    log.info({
      requestId,
      genre: input.genre,
      hasContext: Boolean(input.additionalContext && input.additionalContext.trim().length > 0),
    }, '[VN plan] phase start');

    emit('progress', { message: 'Researching story world...' });

    const pkg = await runPlanningAgent(
      input,
      (message) => {
        log.info({ requestId, message, elapsedMs: Date.now() - startedAt }, '[VN plan] progress callback');
        emit('progress', { message });
      },
      (message, meta) => {
        log.info({ requestId, ...meta, elapsedMs: Date.now() - startedAt }, `[VN plan] ${message}`);
      },
      { requestId },
    );

    vnPackageStore.set(pkg.id, pkg);
    log.info({
      requestId,
      packageId: pkg.id,
      totalScenes: pkg.meta.totalScenes,
      generationMs: pkg.meta.generationMs,
      elapsedMs: Date.now() - startedAt,
    }, '[VN plan] package assembled');
    emit('complete', { packageId: pkg.id, package: pkg });
  } catch (err) {
    const error = serializeError(err);
    log.error({ requestId, ...error, elapsedMs: Date.now() - startedAt }, '[VN plan] phase failed');
    emit('error', { message: error.message, name: error.name });
  } finally {
    if (res.writableEnded) {
      log.warn({ requestId, elapsedMs: Date.now() - startedAt }, '[VN plan] response already ended before finalizer');
      return;
    }
    log.info({ requestId, eventSeq, elapsedMs: Date.now() - startedAt }, '[VN plan] ending SSE stream');
    res.end();
  }
}
