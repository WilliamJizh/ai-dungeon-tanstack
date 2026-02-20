import Fastify from 'fastify';
import cors from '@fastify/cors';
import staticFiles from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import { planRoute } from './vn/routes/planRoute.js';
import { planChatRoute } from './vn/routes/planChatRoute.js';
import { tellChatRoute } from './vn/routes/tellChatRoute.js';
import { storyMapRoute } from './vn/routes/storyMapRoute.js';
import { projectsRoute } from './vn/routes/projectsRoute.js';
import { traceRoutes } from './debug/routes/traceRoutes.js';

config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: process.env.VITE_DEV_URL ?? 'http://localhost:5173',
});

await app.register(staticFiles, {
  root: path.join(__dirname, '..', 'public'),
  prefix: '/',
  decorateReply: false,
});

// Health check
app.get('/health', async () => ({ status: 'ok' }));

// VN routes under /api/vn prefix
await app.register(async (vnApp) => {
  await planRoute(vnApp);
  await planChatRoute(vnApp);
  await tellChatRoute(vnApp);
  await storyMapRoute(vnApp);
  await projectsRoute(vnApp);
}, { prefix: '/api/vn' });

await app.register(async (debugApp) => {
  await traceRoutes(debugApp);
}, { prefix: '/api/debug' });

const start = async () => {
  try {
    await app.listen({ port: 3001, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
export default app;
