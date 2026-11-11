/**
 * Usage + profile routes (JWT-authenticated):
 *  GET /api/v1/usage?range=day|week|month — grouped call statistics
 *  GET /api/v1/me                         — current user profile
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '@api-website/db';
import type { UsageBucket } from '@api-website/shared';
import type { GatewayContext } from './keys.routes.js';

const RANGE_DAYS: Record<string, number> = { day: 1, week: 7, month: 30 };

export function registerUsageRoutes(app: FastifyInstance, ctx: GatewayContext): void {
  app.get('/api/v1/usage', async (request, reply) => {
    const started = Date.now();
    const result = await ctx.auth.requireJwt(request, reply);
    if (!result.ok) return result.reply;
    const userId = result.user.id;

    const range = String((request.query as { range?: string }).range ?? 'week');
    const days = RANGE_DAYS[range] ?? 7;
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);

    const rows = await prisma.$queryRaw<Array<{ period: string; requests: number; errors: number; avg_latency: number }>>(
      Prisma.raw`
        SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS period,
               COUNT(*)::int AS requests,
               COUNT(*) FILTER (WHERE "statusCode" >= 400)::int AS errors,
               ROUND(AVG("latencyMs")::numeric)::int AS avg_latency
        FROM "ApiUsage"
        WHERE "userId" = ${userId} AND "createdAt" >= ${since}
        GROUP BY date_trunc('day', "createdAt")
        ORDER BY period ASC
      `
    );

    const data: UsageBucket[] = rows.map((r) => ({
      period: r.period,
      requests: r.requests,
      errorRate: r.requests === 0 ? 0 : Number((r.errors / r.requests).toFixed(4)),
      avgLatencyMs: r.avg_latency,
    }));

    const total = data.reduce((acc, b) => acc + b.requests, 0);
    app.metrics.recordRequest('GET /api/v1/usage', 200, Date.now() - started);
    return reply.send({
      success: true,
      data: { buckets: data, total, range },
      error: null,
      meta: { requestId: request.id, range, days },
    });
  });

  app.get('/api/v1/me', async (request, reply) => {
    const started = Date.now();
    const result = await ctx.auth.requireJwt(request, reply);
    if (!result.ok) return result.reply;

    const user = await prisma.user.findUnique({
      where: { id: result.user.id },
      select: {
        id: true,
        email: true,
        githubId: true,
        plan: true,
        role: true,
        createdAt: true,
        _count: { select: { apiKeys: true, subscriptions: true } },
      },
    });
    if (!user) {
      return reply.code(404).send({ success: false, data: null, error: 'User not found', meta: { requestId: request.id } });
    }

    const activeSubs = await prisma.subscription.findMany({
      where: { userId: user.id, status: 'active' },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });

    app.metrics.recordRequest('GET /api/v1/me', 200, Date.now() - started);
    return reply.send({
      success: true,
      data: {
        ...user,
        activeSubscription: activeSubs[0] ?? null,
      },
      error: null,
      meta: { requestId: request.id },
    });
  });
}

// Local import so the raw template literal above compiles under strict TS.
import { Prisma } from '@prisma/client';

declare module 'fastify' {
  interface FastifyInstance {
    metrics: import('../lib/metrics.js').Metrics;
  }
}