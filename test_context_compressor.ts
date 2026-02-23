import 'dotenv/config';
import { randomUUID } from 'crypto';
import { db } from './server/db/index.js';
import { plotStates, vnPackages } from './server/db/schema.js';
import { eq } from 'drizzle-orm';
import { summarizeNodeInBackground, compressContext } from './server/vn/utils/contextCompressor.js';
import type { UIMessage } from 'ai';

async function runTest() {
    console.log("--- Testing Context Compressor ---");

    // 1. Create a dummy package + session in SQLite
    const packageId = 'test-pkg-' + randomUUID();
    const sessionId = 'test-session-' + randomUUID();

    console.log(`Setting up DB for session: ${sessionId}`);

    // Insert dummy package
    db.insert(vnPackages).values({
        id: packageId,
        title: 'Test Package',
        genre: 'mystery',
        language: 'en',
        artStyle: 'anime',
        coverImageAssetId: 'placeholder',
        metaJson: '{}',
        assetDir: '/tmp',
        status: 'published',
        charactersJson: '[]',
        assetsJson: '{}',
        status: 'published',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    } as any).run();

    // Insert dummy plot state with no initial summary
    db.insert(plotStates).values({
        sessionId,
        packageId,
        currentActId: 'act-1',
        currentNodeId: 'node-1',
        currentBeat: 0,
        offPathTurns: 0,
        completedNodes: '[]',
        storySummary: '',
        flagsJson: '{}',
        playerStatsJson: '{}',
        updatedAt: new Date().toISOString()
    }).run();

    // 2. Create raw mock messages representing a scene
    const mockMessages: UIMessage[] = [
        { id: '1', role: 'user', content: 'I walk into the tavern and demand a drink.' },
        { id: '2', role: 'assistant', content: 'The bartender, a burly man with a scar over his left eye, slams a dirty mug on the counter. "That\'ll be two silvers," he growls.' },
        { id: '3', role: 'user', content: 'I flip him a gold coin. "Keep the change. Who runs the underground fighting pit here?"' },
        { id: '4', role: 'assistant', content: 'He bites the gold coin, his eyes widening slightly. He leans in close. "You did not hear it from me, but you want to talk to Silas. He hangs out by the docks after midnight."' }
    ];

    // 3. Test `summarizeNodeInBackground`
    console.log("\n[1] Running summarizeNodeInBackground...");
    try {
        await summarizeNodeInBackground(sessionId, mockMessages, "");

        // Fetch from DB to verify
        const state = db.select({ storySummary: plotStates.storySummary }).from(plotStates).where(eq(plotStates.sessionId, sessionId)).get();
        console.log("-> DB Summary Result:\n", state?.storySummary);
    } catch (e) {
        console.error("-> summarizeNodeInBackground Failed:", e);
    }

    // 4. Test `compressContext` array manipulation
    console.log("\n[2] Testing compressContext...");

    // Simulating a long message history (21 messages)
    const longHistory: UIMessage[] = Array.from({ length: 21 }, (_, i) => ({
        id: `old-${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Old message ${i}`
    }));

    const mockSummary = "The player previously gave the bartender a gold coin to learn that Silas runs the fighting pit by the docks.";
    const compressed = compressContext(longHistory, mockSummary, 20);

    console.log(`Original Length: ${longHistory.length}`);
    console.log(`Compressed Length: ${compressed.length}`);
    console.log(`Top Message Role: ${compressed[0].role}`);
    console.log(`Top Message Content: ${compressed[0].content}`);

    console.log("\n--- Test Complete ---");
}

runTest();
