/**
 * Admin routes (JWT + ADMIN role):
 *  GET    /api/v1/admin/users          — user list with usage totals
 *  PATCH  /api/v1/admin/users/:id      — ban / unban a user
 *  GET    /api/v1/admin/usage          — top users by calls (last 7 days)
 */
import type { FastifyInstance } from 'fastify';
import { Prisma, prisma } from '@api-website/db';
import type { GatewayContext } from './keys.routes.js';

export function registerAdminRoutes(app: FastifyInstance, ctx: GatewayContext): void {
  // Admin guard: require JWT + role === 'admin'.
  async function guardAdmin(request: FastifyInstance['request'], reply: FastifyInstance['reply']) {
    const result = await ctx.auth.requireJwt(request, reply);
    if (!result.ok) return null;
    if (result.user.role !== 'admin') {
      return reply.code(403).send({ success: false, data: null, error: 'Admin access required', meta: { requestId: request.id } });
    }
    return result.user;
  }

  app.get('/api/v1/admin/users', async (request, reply) => {
    const started = Date.now();
    const admin = await guardAdmin(request, reply);
    if (!admin) return;

    const page = Math.max(1, Number((request.query as { page?: string }).page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number((request.query as { pageSize?: string }).pageSize ?? 25)));
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        plan: true,
        role: true,
        createdAt: true,
        _count: { select: { apiKeys: true, usage: true, subscriptions: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    const total = await prisma.user.count();

    app.metrics.recordRequest('GET /api/v1/admin/users', 200, Date.now() - started);
    return reply.send({ success: true, data: { users, total, page, pageSize }, error: null, meta: { requestId: request.id } });
  });

  app.patch('/api/v1/admin/users/:id', async (request, reply) => {
    const started = Date.now();
    const admin = await guardAdmin(request, reply);
    if (!admin) return;

    const id = String((request.params as { id: string }).id);
    const { ban } = (request.body as { ban?: boolean }) ?? {};

    if (id === admin.id) {
      return reply.code(400).send({ success: false, data: null, error: 'Cannot ban yourself', meta: { requestId: request.id } });
    }
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return reply.code(404).send({ success: false, data: null, error: 'User not found', meta: { requestId: request.id } });
    }
    const role = ban ? 'BANNED' : user.role === 'BANNED' ? 'USER' : user.role;
    const updated = await prisma.user.update({ where: { id }, data: { role } });

    app.metrics.recordRequest('PATCH /api/v1/admin/users/:id', 200, Date.now() - started);
    return reply.send({
      success: true,
      data: { id: updated.id, role: updated.role, email: updated.email },
      error: null,
      meta: { requestId: request.id },
    });
  });

  app.get('/api/v1/admin/usage', async (request, reply) => {
    const started = Date.now();
    const admin = await guardAdmin(request, reply);
    if (!admin) return;

    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const rows = await prisma.$queryRaw<Array<{ email: string; calls: number; errors: number; avg_latency: number }>>(
      Prisma.raw`
        SELECT u.email,
               COUNT(x.id)::int AS calls,
               COUNT(x.id) FILTER (WHERE x."statusCode" >= 400)::int AS errors,
               ROUND(AVG(x."latencyMs")::numeric)::int AS avg_latency
        FROM "ApiUsage" x
        JOIN "User" u ON u.id = x."userId"
        WHERE x."createdAt" >= ${since}
        GROUP BY u.email
        ORDER BY calls DESC
        LIMIT 20
      `
    );

    app.metrics.recordRequest('GET /api/v1/admin/usage', 200, Date.now() - started);
    return reply.send({ success: true, data: { topUsers: rows }, error: null, meta: { requestId: request.id, since: since.toISOString() } });
  });
}

declare module 'fastify' {
  interface FastifyInstance {
    metrics: import('../lib/metrics.js').Metrics;
  }
}