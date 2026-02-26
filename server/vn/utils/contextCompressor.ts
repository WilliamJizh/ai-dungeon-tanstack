import { generateText } from 'ai';
import { getModel } from '../../lib/modelFactory.js';
import { db } from '../../db/index.js';
import { plotStates } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { UIMessage } from 'ai';

import { TOOL_FLATTENERS } from './toolFlatteners.js';

export function sanitizeHistory(rawMessages: any[]): any[] {
    const sanitized: any[] = [];
    const keptPristineTools = new Set<string>();
    const pristineToolCallIds = new Set<string>();

    // Pass 1: Identify the newest (pristine) tool calls going backward.
    // For the most recent turn (after the last user message), keep ALL
    // frameBuilderTool calls pristine so the model has full context of
    // what was just shown and doesn't repeat scene content.
    let inRecentTurn = true;

    for (let i = rawMessages.length - 1; i >= 0; i--) {
        const msg = rawMessages[i];

        if (msg.role === 'user') {
            inRecentTurn = false;
        }

        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === 'tool-call') {
                    if (inRecentTurn && part.toolName === 'frameBuilderTool') {
                        // Keep ALL frames from the current turn — model needs
                        // full context of what was just shown to avoid repeating.
                        if (part.toolCallId) pristineToolCallIds.add(part.toolCallId.trim());
                        keptPristineTools.add(part.toolName);
                    } else if (!keptPristineTools.has(part.toolName)) {
                        keptPristineTools.add(part.toolName);
                        if (part.toolCallId) pristineToolCallIds.add(part.toolCallId.trim());
                    }
                }
            }
        }
    }

    // Pass 2: Build the sanitized array backward
    for (let i = rawMessages.length - 1; i >= 0; i--) {
        const msg = rawMessages[i];

        if (msg.role === 'tool') {
            const cleanResults: any[] = [];
            const flatTextResults: string[] = [];

            if (Array.isArray(msg.content)) {
                for (const part of msg.content) {
                    const toolName = part.toolName;
                    const rawOutput = part.result ?? part.output;
                    const toolCallId = (part.toolCallId || `legacy_${toolName}`).trim();

                    if (pristineToolCallIds.has(toolCallId)) {
                        // PRISTINE RESULT: Keep it exactly as-is to satisfy the SDK loop
                        cleanResults.push({
                            type: 'tool-result',
                            toolCallId: toolCallId,
                            toolName: toolName,
                            output: rawOutput
                        });
                    } else if (toolName && TOOL_FLATTENERS[toolName]?.flattenResult) {
                        // FLATTENED RESULT: Map it to an Assistant Memory block
                        flatTextResults.push(TOOL_FLATTENERS[toolName].flattenResult!(rawOutput));
                    }
                }
            }

            if (cleanResults.length > 0) {
                sanitized.push({ role: 'tool', content: cleanResults });
            }

            // Textual results from flattened state-reads are mapped to a generic assistant text block.
            // (We will merge consecutive assistant messages at the very end)
            if (flatTextResults.length > 0) {
                sanitized.push({
                    role: 'assistant',
                    content: flatTextResults.map(text => ({ type: 'text', text }))
                });
            }
            continue;
        }

        if (msg.role === 'assistant') {
            const cleanParts: any[] = [];

            if (typeof msg.content === 'string') {
                cleanParts.push({ type: 'text', text: msg.content });
            } else if (Array.isArray(msg.content)) {
                for (const part of msg.content) {
                    if (part.type === 'text') {
                        cleanParts.push(part);
                    } else if (part.type === 'tool-call') {
                        const toolName = part.toolName;
                        const toolCallId = part.toolCallId?.trim();
                        const rawArgs = part.args || part.input;

                        if (pristineToolCallIds.has(toolCallId)) {
                            // THIS IS THE NEWEST INSTANCE! Keep it perfectly pristine as a one-shot example
                            // Optional: Strip pure visual bloat from frame builder even on pristine calls to save *some* tokens,
                            // OR leave it exactly as sent. We'll strip heavy visual stuff from pristine too so it doesn't break limits.
                            const pristineArgs = { ...rawArgs };
                            if (toolName === 'frameBuilderTool' && typeof pristineArgs === 'object') {
                                delete pristineArgs.panels;
                                delete pristineArgs.effects;
                                delete pristineArgs.audio;
                                delete pristineArgs.transition;
                                delete pristineArgs.hud;
                                delete pristineArgs.tacticalMapData;
                                delete pristineArgs.mapData;
                            }

                            cleanParts.push({
                                type: 'tool-call',
                                toolCallId: toolCallId,
                                toolName: toolName,
                                args: pristineArgs
                            });
                        } else {
                            // THIS IS AN OLDER INSTANCE.
                            // Convert it to natural language text instead of a tool call
                            const flattener = TOOL_FLATTENERS[toolName]?.flattenCall;
                            const abstractText = flattener
                                ? flattener(rawArgs)
                                : `[System Evaluated Tool]: ${toolName}`;

                            cleanParts.push({
                                type: 'text',
                                text: abstractText
                            });
                        }
                    }
                }
            }

            if (cleanParts.length > 0) {
                sanitized.push({ role: 'assistant', content: cleanParts });
            }
            continue;
        }

        sanitized.push(msg);
    }

    // Reverse back to chronological order (oldest to newest)
    const chronological = sanitized.reverse();

    // Pass 3: Merge consecutive messages with the same role
    // Dropping intermediate tool results often leaves sequential Assistant messages back-to-back.
    // The Vercel AI SDK strictly forbids `assistant -> assistant`, they must alternate.
    const merged: any[] = [];
    for (const msg of chronological) {
        if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
            const last = merged[merged.length - 1];

            // Normalize content arrays
            if (typeof last.content === 'string') last.content = [{ type: 'text', text: last.content }];
            let incoming = msg.content;
            if (typeof incoming === 'string') incoming = [{ type: 'text', text: incoming }];

            last.content = last.content.concat(incoming);
        } else {
            // Shallow clone to avoid mutating raw input arrays during assignment
            merged.push({ ...msg, content: typeof msg.content === 'string' ? msg.content : [...msg.content] });
        }
    }

    return merged;
}

// ── Watermark thresholds ────────────────────────────────────────────────────
// When messages exceed HIGH_WATER, summarize the oldest batch and cut to LOW_WATER.
// With 2-8 frames/turn, each turn generates ~4-16 messages (tool-call/result pairs).
// Too aggressive compression (old: 10/6) wipes ALL history after 1 turn, causing
// the model to re-narrate scenes and lose continuity. Keep enough for 2-3 turns.
const HIGH_WATER = 24;
const LOW_WATER = 14;

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
${oldSummary || "(This is the very beginning of the story — no previous events.)"}

RECENT EVENTS (${context}):
${rawText}

RULES:
- Write a concise 2-4 sentence summary combining PREVIOUS SUMMARY + RECENT EVENTS.
- Focus ONLY on: plot-advancing actions, discoveries, items obtained, NPCs met, choices made, locations visited, flags/state changes.
- Omit: atmospheric descriptions, combat details, repeated scene re-narrations.
- CRITICAL: Do NOT invent events that aren't in the text above. Do NOT reference other stories.
- Write in the same language as the text provided.
- Return ONLY the combined summary text, nothing else.`;

    const { text: newSummary } = await generateText({
        model: getModel('summarizer'),
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
