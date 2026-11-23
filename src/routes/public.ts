import type { FastifyInstance } from 'fastify';
import { servePublicFile } from '../lib/static.js';
import { renderJob } from '../lib/render-job.js';
import { isSafeJobId } from '../../frontend/job-id.js';
import type { createPublicJobsCache } from '../lib/public-jobs-cache.js';
import { handleJobs } from './jobs.js';
import { handleJobDetail } from './job-detail.js';

export function registerPublicRoutes(
  app: FastifyInstance,
  database?: Parameters<typeof handleJobs>[2],
  readJobDetail?: Parameters<typeof handleJobDetail>[3],
  readListing?: Parameters<typeof handleJobs>[3],
  readVisitorCounts?: ReturnType<
    typeof createPublicJobsCache
  >['readVisitorCounts'],
) {
  app.get('/api/jobs/visitors/counts', async (request, reply) => {
    const ids = new URL(request.url, 'http://localhost').searchParams.getAll(
      'id',
    );
    if (
      ids.length === 0 ||
      ids.length > 30 ||
      ids.some((id) => id !== id.trim() || !isSafeJobId(id))
    ) {
      return reply.code(400).send({ error: 'Provide 1 to 30 valid job IDs' });
    }
    reply.header('Cache-Control', 'no-store');
    const counts = await readVisitorCounts?.([...new Set(ids)]);
    return {
      counts: Object.fromEntries(
        ids.map((id) => [
          id,
          counts && Object.hasOwn(counts, id) ? counts[id] : null,
        ]),
      ),
    };
  });

  app.all<{ Params: { id: string } }>('/api/jobs/:id', {
    onRequest: async (request, reply) => {
      if (request.method !== 'GET') {
        return reply
          .header('Allow', 'GET')
          .code(405)
          .send({ error: 'Method Not Allowed' });
      }
    },
    handler: (request, reply) =>
      handleJobDetail(request.params.id, reply, database, readJobDetail),
  });

  app.all('/api/jobs', {
    onRequest: async (request, reply) => {
      if (request.method !== 'GET') {
        return reply
          .header('Allow', 'GET')
          .code(405)
          .send({ error: 'Method Not Allowed' });
      }
    },
    handler: async (request, reply) => {
      const url = new URL(request.url, 'http://localhost');
      await handleJobs(reply, url.searchParams, database, readListing);
    },
  });

  app.route<{ Params: { id: string } }>({
    method: ['GET', 'HEAD'],
    url: '/jobs/:id',
    handler: async (request, reply) => {
      if (!/^[a-zA-Z0-9_-]{1,128}$/.test(request.params.id)) {
        return reply.code(404).send({ error: 'Not Found' });
      }
      const { status, html } = await renderJob(request.params.id);
      return reply
        .code(status)
        .headers({
          'Content-Type': 'text/html; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
          'Cache-Control': 'no-cache',
        })
        .send(request.method === 'HEAD' ? undefined : html);
    },
  });

  for (const path of ['/', '/css/:filename', '/js/:filename']) {
    app.route({
      method: ['GET', 'HEAD'],
      url: path,
      handler: async (request, reply) => {
        const url = new URL(request.url, 'http://localhost');
        if (
          !(await servePublicFile(
            request,
            reply,
            url.pathname,
            url.searchParams,
          ))
        ) {
          return reply.code(404).send({ error: 'Not Found' });
        }
      },
    });
  }
}
