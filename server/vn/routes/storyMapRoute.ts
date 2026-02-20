import type { FastifyInstance } from 'fastify';
import { vnPackageStore } from '../state/vnPackageStore.js';
import { db } from '../../db/index.js';
import { vnPackages } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { renderStoryTree } from '../utils/storyVisualizer.js';
import type { VNPackage } from '../types/vnTypes.js';

export async function storyMapRoute(app: FastifyInstance) {
  app.get<{
    Params: { packageId: string };
  }>('/story-map/:packageId', async (req, reply) => {
    const { packageId } = req.params;

    // Load VNPackage from cache or DB
    let vnPackage = vnPackageStore.get(packageId);
    if (!vnPackage) {
      const row = db.select().from(vnPackages).where(eq(vnPackages.id, packageId)).get();
      if (!row) {
        return reply.status(404).send({ error: 'Package not found' });
      }
      vnPackage = JSON.parse(row.metaJson) as VNPackage;
      vnPackageStore.set(packageId, vnPackage);
    }

    reply.type('text/plain').send(renderStoryTree(vnPackage));
  });
}
