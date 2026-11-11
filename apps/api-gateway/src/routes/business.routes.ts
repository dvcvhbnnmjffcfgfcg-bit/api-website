/**
 * Business API proxy routes: the gateway enforces auth + rate limits,
 * then forwards to the api-service (echo / weather / translate).
 * Each call is logged to PostgreSQL (ApiUsage) — this is the "request log" layer.
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '@api-website/db';
import type { RateLimiter } from '../lib/rateLimit.js';
import type { GatewayContext } from './keys.routes.js';

interface BusinessRouteCtx extends GatewayContext {
  rateLimiter: RateLimiter;
}

const ROUTES: Array<{
  method: 'GET' | 'POST';
  pattern: string;
  endpoint: string;
}> = [
  { method: 'GET', pattern: '/api/v1/echo', endpoint: 'GET /api/v1/echo' },
  { method: 'GET', pattern: '/api/v1/weather', endpoint: 'GET /api/v1/weather' },
  { method: 'POST', pattern: '/api/v1/translate', endpoint: 'POST /api/v1/translate' },
];

export function registerBusinessRoutes(app: FastifyInstance, ctx: BusinessRouteCtx): void {
  for (const route of ROUTES) {
    const handler = async (request: FastifyInstance['request'], reply: FastifyInstance['reply']) => {
      const started = Date.now();

      // 1) API-key auth.
      const authResult = await ctx.auth.requireApiKey(request, reply);
      if (!authResult.ok) {
        app.metrics.recordRequest(route.endpoint, 401, Date.now() - started);
        return authResult.reply;
      }
      const user = authResult.user;

      // 2) Rate limit (per-plan daily quota, Redis sliding window w/ memory fallback).
      const rl = await ctx.rateLimiter.record(user.id, user.plan);
      if (!rl.allowed) {
        reply.header('Retry-After', String(Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000)));
        reply.header('X-RateLimit-Limit', String(rl.limit));
        reply.header('X-RateLimit-Remaining', '0');
        app.metrics.recordRequest(route.endpoint, 429, Date.now() - started);
        return reply.code(429).send({
          success: false,
          data: null,
          error: `Daily request limit reached for plan "${user.plan}" (resets at ${rl.resetAt.toISOString()})`,
          meta: { requestId: request.id, plan: user.plan },
        });
      }

      // 3) Forward to the business service.
      const target = new URL(route.pattern, process.env.API_SERVICE_URL ?? 'http://localhost:8081');
      if (route.method === 'GET' && request.url.includes('?')) {
        target.search = request.url.slice(request.url.indexOf('?'));
      }
      const up = await fetch(target.toString(), {
        method: route.method,
        headers: { 'Content-Type': 'application/json' },
        body: route.method === 'POST' ? JSON.stringify(request.body ?? {}) : undefined,
      });
      const latencyMs = Date.now() - started;
      const text = await up.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }

      // 4) Log the call to PostgreSQL (fire-and-forget keeps the response fast).
      void prisma.apiUsage
        .create({
          data: { userId: user.id, endpoint: route.endpoint, statusCode: up.status, latencyMs },
        })
        .catch((e) => console.error('[usage-log] failed to persist', e));

      app.metrics.recordRequest(route.endpoint, up.status, latencyMs);
      reply.header('X-RateLimit-Remaining', String(rl.remaining));
      reply.status(up.status);
      return reply.send(parsed);
    };

    if (route.method === 'GET') {
      app.get(route.pattern, handler);
    } else {
      app.post(route.pattern, handler);
    }
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    metrics: import('../lib/metrics.js').Metrics;
  }
}