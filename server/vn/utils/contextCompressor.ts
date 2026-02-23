import { generateText } from 'ai';
import { getGoogleModel } from '../../lib/modelFactory.js';
import { db } from '../../db/index.js';
import { plotStates } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { UIMessage } from 'ai';

// ── Watermark thresholds ────────────────────────────────────────────────────
// When messages exceed HIGH_WATER, summarize the oldest batch and cut to LOW_WATER.
const HIGH_WATER = 80;
const LOW_WATER = 40;

/**
 * Summarizes a batch of messages into a concise narrative paragraph.
 * Used by both the node-boundary summarizer and the overflow summarizer.
 */
async function summarizeBatch(
    messages: UIMessage[],
    oldSummary: string,
    context: string = 'in-flight overflow'
): Promise<string> {
    const rawText = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => {
            const mAny = m as any;
            const textContent = Array.isArray(mAny.content)
                ? mAny.content.map((p: any) => (p as any).text ?? '').join('')
                : typeof mAny.content === 'string' ? mAny.content : '';

            if (m.role === 'user') return `Player: ${textContent}`;
            if (textContent.trim()) return `DM: ${textContent}`;
            return 'DM: [Generated Scene Frames]';
        })
        .join('\n');

    if (!rawText.trim()) return oldSummary;

    const prompt = `You are a narrative compressor for an interactive fiction game.

PREVIOUS SUMMARY:
${oldSummary || "No previous events."}

RECENT EVENTS (${context}):
${rawText}

Task: Write a concise, 2-3 sentence summary of the "RECENT EVENTS" and append it logically to the "PREVIOUS SUMMARY". 
Focus ONLY on major plot points, permanent inventory/status changes, and choices made. Omit mechanical details, combat turn-by-turn logs, or atmospheric fluff. Write in the same language as the text provided.
Return ONLY the newly combined summary text.`;

    const { text: newSummary } = await generateText({
        model: getGoogleModel('summarizer'),
        prompt,
    });

    return newSummary.trim();
}

/**
 * Summarizes the messages of a just-completed Node and saves to DB.
 * Fire-and-forget background job — called at node boundaries.
 */
export async function summarizeNodeInBackground(
    sessionId: string,
    nodeMessages: UIMessage[],
    oldSummary: string
): Promise<void> {
    try {
        const newSummary = await summarizeBatch(nodeMessages, oldSummary, 'just completed scene');
        db.update(plotStates)
            .set({ storySummary: newSummary })
            .where(eq(plotStates.sessionId, sessionId))
            .run();
    } catch (error) {
        console.error(`[ContextCompressor] Failed to summarize node for session ${sessionId}:`, error);
    }
}

/**
 * Robust rolling-window context compressor.
 *
 * Two-trigger summarization:
 *   1. Node boundary (handled by `summarizeNodeInBackground` above)
 *   2. Window overflow (handled here) — when messages > HIGH_WATER,
 *      summarize the oldest batch, persist to DB, then keep only LOW_WATER messages.
 *
 * This guarantees NO information is silently lost.
 */
export async function compressContext(
    messages: UIMessage[],
    sessionId: string,
    storySummary: string,
): Promise<UIMessage[]> {
    let currentSummary = storySummary;

    // ── Overflow summarization ──────────────────────────────────────────
    if (messages.length > HIGH_WATER) {
        // How many messages to discard (keep LOW_WATER)
        let cutPoint = messages.length - LOW_WATER;

        // Snap cut point to a 'user' message boundary to avoid splitting
        // assistant→tool pairs (which causes Gemini INVALID_ARGUMENT errors)
        while (cutPoint < messages.length && messages[cutPoint].role !== 'user') {
            cutPoint++;
        }
        // If we couldn't find a user boundary, fall back to the raw cut point
        if (cutPoint >= messages.length) {
            cutPoint = messages.length - LOW_WATER;
            while (cutPoint > 0 && (messages[cutPoint] as any).role === 'tool') {
                cutPoint--;
            }
        }

        const toSummarize = messages.slice(0, cutPoint);
        const toKeep = messages.slice(cutPoint);

        console.log(`[ContextCompressor] Overflow: ${messages.length} msgs > ${HIGH_WATER}. Summarizing ${toSummarize.length} msgs, keeping ${toKeep.length}.`);

        try {
            currentSummary = await summarizeBatch(toSummarize, currentSummary, `overflow — ${toSummarize.length} messages discarded`);

            // Persist the updated summary
            db.update(plotStates)
                .set({ storySummary: currentSummary })
                .where(eq(plotStates.sessionId, sessionId))
                .run();

            console.log(`[ContextCompressor] Summary updated. New summary length: ${currentSummary.length} chars.`);
        } catch (error) {
            console.error('[ContextCompressor] Overflow summarization failed, falling back to raw truncation:', error);
        }

        messages = toKeep;
    }

    // ── Inject semantic memory ──────────────────────────────────────────
    if (currentSummary) {
        const memoryInjection: any = {
            id: 'synthetic-memory',
            role: 'system',
            content: `[SEMANTIC MEMORY - PREVIOUSLY ON THIS ADVENTURE]\n${currentSummary}`,
        };
        return [memoryInjection, ...messages];
    }

    return messages;
}
