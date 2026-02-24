import { db } from './server/db/index.js';
import { aiTraceSteps, aiTraces } from './server/db/schema.js';
import { eq, desc } from 'drizzle-orm';
import * as fs from 'fs';

async function check() {
    const trace = db.select()
        .from(aiTraces)
        .where(eq(aiTraces.sessionId, 'dfc4d678-2a81-4c85-b57d-1e3473275a81'))
        .orderBy(desc(aiTraces.id))
        .limit(1)
        .get();

    if (!trace) return console.log('Trace not found for session');

    console.log(`Found trace: ${trace.id}`);

    const steps = db.select()
        .from(aiTraceSteps)
        .where(eq(aiTraceSteps.traceId, trace.id))
        .orderBy(desc(aiTraceSteps.id))
        .all();

    console.log(`Found ${steps.length} steps.`);
    for (const step of steps) {
        const reqStr = step.requestJson || '';
        console.log(`Step ${step.stepIndex}: Request JSON length: ${reqStr.length} chars (approx ${Math.floor(reqStr.length / 3)} tokens)`);

        let req;
        try {
            req = JSON.parse(reqStr);
            console.log(`  Messages count: ${req.messages?.length}`);
        } catch (e) { }
    }
}
check();
