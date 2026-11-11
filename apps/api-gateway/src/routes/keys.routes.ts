/**
 * API Key management routes (JWT-authenticated):
 *  GET    /api/v1/keys        — list the user's keys
 *  POST   /api/v1/keys        — create a new key (plaintext returned once)
 *  DELETE /api/v1/keys/:id    — revoke a key
 */
import type { FastifyInstance } from 'fastify';
import { prisma } from '@api-website/db';
import { generateApiKey, hashApiKey } from '@api-website/auth';
import type { ApiKeyInfo } from '@api-website/shared';

export interface GatewayContext {
  auth: import('../lib/authMiddleware.js').AuthMiddleware;
}

const KEY_NAME_MAX = 64;

export function registerKeyRoutes(app: FastifyInstance, ctx: GatewayContext): void {
  app.get('/api/v1/keys', async (request, reply) => {
    const started = Date.now();
    const result = await ctx.auth.requireJwt(request, reply);
    if (!result.ok) return result.reply;
    const userId = result.user.id;

    const keys = await prisma.apiKey.findMany({
      where: { userId, revokedAt: null },
      select: { id: true, keyHash: true, name: true, lastUsedAt: true, revokedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    const data: ApiKeyInfo[] = keys.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: keyDisplay(k.keyHash),
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      revokedAt: k.revokedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    }));

    app.metrics.recordRequest('GET /api/v1/keys', 200, Date.now() - started);
    return reply.send({ success: true, data, error: null, meta: { requestId: request.id, count: data.length } });
  });

  app.post('/api/v1/keys', async (request, reply) => {
    const started = Date.now();
    const result = await ctx.auth.requireJwt(request, reply);
    if (!result.ok) return result.reply;
    const userId = result.user.id;

    const name = String((request.body as { name?: string })?.name ?? 'default').slice(0, KEY_NAME_MAX);
    const plain = generateApiKey();
    const record = await prisma.apiKey.create({
      data: { userId, name, keyHash: hashApiKey(plain) },
    });

    app.metrics.recordRequest('POST /api/v1/keys', 201, Date.now() - started);
    return reply.code(201).send({
      success: true,
      data: {
        id: record.id,
        name: record.name,
        key: plain,
        keyHash: record.keyHash,
        createdAt: record.createdAt.toISOString(),
        note: 'Store the key now — it will not be shown again.',
      },
      error: null,
      meta: { requestId: request.id },
    });
  });

  app.delete('/api/v1/keys/:id', async (request, reply) => {
    const started = Date.now();
    const result = await ctx.auth.requireJwt(request, reply);
    if (!result.ok) return result.reply;
    const userId = result.user.id;
    const id = String((request.params as { id: string }).id);

    const record = await prisma.apiKey.findFirst({ where: { id, userId } });
    if (!record) {
      return reply.code(404).send({ success: false, data: null, error: 'Key not found', meta: { requestId: request.id } });
    }
    await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });

    app.metrics.recordRequest('DELETE /api/v1/keys/:id', 200, Date.now() - started);
    return reply.send({ success: true, data: { id, revokedAt: new Date().toISOString() }, error: null, meta: { requestId: request.id } });
  });
}

/** Show a human-friendly prefix derived from the stored hash (never the plaintext). */
function keyDisplay(keyHash: string): string {
  return 'sk_live_…' + keyHash.slice(0, 8);
}

declare module 'fastify' {
  interface FastifyInstance {
    metrics: import('../lib/metrics.js').Metrics;
  }
}