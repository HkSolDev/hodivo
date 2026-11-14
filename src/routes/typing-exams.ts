import type { FastifyInstance } from 'fastify';
import {
  createExamCatalogue,
  ExamCatalogueError,
  type ExamCatalogue,
} from '../lib/typing-exam-catalogue.js';

const identifier = /^[a-z0-9]{1,64}$/;
const messages = {
  INVALID_REQUEST: 'Invalid exam request.',
  NOT_FOUND: 'Exam content not found.',
  EXAM_NOT_READY: 'This exam is not ready to start.',
  SERVICE_UNAVAILABLE: 'Exam content is temporarily unavailable.',
};

export function registerTypingExamRoutes(
  app: FastifyInstance,
  catalogue: ExamCatalogue = createExamCatalogue(),
) {
  const paths = [
    '/api/typing/exams',
    '/api/typing/exams/:examId/versions',
    '/api/typing/exam-versions/:versionId',
    '/api/typing/exam-versions/:versionId/passage',
    '/api/typing/exam-versions/:versionId/passages',
  ];
  for (const [index, path] of paths.entries()) {
    app.all<{ Params: { examId?: string; versionId?: string } }>(
      path,
      {
        onRequest: async (request, reply) => {
          reply.header('cache-control', 'no-store');
          if (request.method !== 'GET')
            return reply.code(404).send({ error: 'Not Found' });
        },
      },
      async (request, reply) => {
        try {
          const query = new URL(request.raw.url ?? '', 'http://localhost')
            .searchParams;
          const allowedKeys =
            index < 2 ? ['limit', 'cursor'] : index === 3 ? ['passageId'] : [];
          for (const key of query.keys()) {
            if (!allowedKeys.includes(key) || query.getAll(key).length !== 1)
              throw new ExamCatalogueError('INVALID_REQUEST');
          }
          const id = request.params.examId ?? request.params.versionId;
          if (id !== undefined && !identifier.test(id))
            throw new ExamCatalogueError('INVALID_REQUEST');
          const limitText = query.get('limit');
          if (
            limitText !== null &&
            !/^(?:[1-9]|[1-4][0-9]|50)$/.test(limitText)
          )
            throw new ExamCatalogueError('INVALID_REQUEST');
          const limit = limitText === null ? 20 : Number(limitText);
          const cursor = query.get('cursor');
          if (cursor !== null && !identifier.test(cursor))
            throw new ExamCatalogueError('INVALID_REQUEST');
          const passageId = query.get('passageId');
          if (passageId !== null && !identifier.test(passageId))
            throw new ExamCatalogueError('INVALID_REQUEST');
          if (index === 0) {
            const page = await catalogue.listExams(limit, cursor ?? undefined);
            return { exams: page.items, nextCursor: page.nextCursor };
          }
          if (index === 1 && id) {
            const page = await catalogue.listVersions(
              id,
              limit,
              cursor ?? undefined,
            );
            return { versions: page.items, nextCursor: page.nextCursor };
          }
          if (index === 2 && id)
            return { version: await catalogue.getVersion(id) };
          if (index === 3 && id)
            return {
              snapshot: await catalogue.getSnapshot(id, passageId ?? undefined),
            };
          if (index === 4 && id)
            return { passages: await catalogue.listPassages(id) };
          throw new ExamCatalogueError('INVALID_REQUEST');
        } catch (error) {
          if (error instanceof ExamCatalogueError) {
            const status =
              error.code === 'INVALID_REQUEST'
                ? 400
                : error.code === 'NOT_FOUND'
                  ? 404
                  : 409;
            return reply.code(status).send({
              error: {
                code: error.code,
                message: messages[error.code],
                ...(status === 409 ? { reasons: error.reasons } : {}),
              },
            });
          }
          return reply.code(503).send({
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: messages.SERVICE_UNAVAILABLE,
            },
          });
        }
      },
    );
  }
}
