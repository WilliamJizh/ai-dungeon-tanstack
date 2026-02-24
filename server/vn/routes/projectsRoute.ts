import type { FastifyInstance } from 'fastify';
import { db } from '../../db/index.js';
import { vnPackages } from '../../db/schema.js';
import { desc, eq } from 'drizzle-orm';
import { vnPackageStore } from '../state/vnPackageStore.js';
import type { VNPackage } from '../types/vnTypes.js';

interface ProjectSummary {
  id: string;
  title: string;
  genre: string;
  artStyle: string;
  createdAt: string;
  totalScenes: number;
  estimatedDuration: string;
  generationMs: number;
}

function toSummary(pkg: VNPackage): ProjectSummary {
  const totalScenes = (pkg.meta as any).totalScenes ?? (pkg.meta as any).totalNodes ?? 0;
  return {
    id: pkg.id,
    title: pkg.title,
    genre: pkg.genre,
    artStyle: pkg.artStyle,
    createdAt: pkg.createdAt,
    totalScenes,
    estimatedDuration: pkg.meta.estimatedDuration,
    generationMs: pkg.meta.generationMs,
  };
}

export async function projectsRoute(app: FastifyInstance) {
  app.get('/projects', async (_req, reply) => {
    const rows = db.select().from(vnPackages).orderBy(desc(vnPackages.createdAt)).all();
    const projects: ProjectSummary[] = [];

    for (const row of rows) {
      try {
        const pkg = JSON.parse(row.metaJson) as VNPackage;
        projects.push(toSummary(pkg));
      } catch {
        // Skip malformed rows, keep endpoint resilient.
      }
    }

    return reply.send({ projects });
  });

  app.get<{
    Params: { packageId: string };
  }>('/projects/:packageId', async (req, reply) => {
    const { packageId } = req.params;

    let vnPackage = vnPackageStore.get(packageId);
    if (!vnPackage) {
      const row = db.select().from(vnPackages).where(eq(vnPackages.id, packageId)).get();
      if (!row) {
        return reply.status(404).send({ error: 'Package not found' });
      }
      vnPackage = JSON.parse(row.metaJson) as VNPackage;
      vnPackageStore.set(packageId, vnPackage);
    }

    return reply.send({ package: vnPackage });
  });
}

