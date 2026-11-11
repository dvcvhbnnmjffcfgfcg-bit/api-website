/**
 * Auth middleware for the gateway: JWT (Bearer) and API Key (X-API-Key) with
 * optional HMAC-SHA256 request signing (X-Timestamp + X-Signature).
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '@api-website/db';
import { Jwt, hashApiKey, isTimestampValid, verifySignature } from '@api-website/auth';
import type { PublicUser } from '@api-website/shared';

declare module 'fastify' {
  interface FastifyRequest {
    user?: PublicUser & { id: string };
    apiKeyId?: string;
  }
}

export class AuthMiddleware {
  constructor(private readonly jwt: Jwt) {}

  /** Require a valid access token in Authorization: Bearer <token>. */
  async requireJwt(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<{ ok: true; user: PublicUser & { id: string } } | { ok: false; reply: FastifyReply }> {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return {
        ok: false,
        reply: reply.code(401).send({
          success: false,
          data: null,
          error: 'Missing or malformed Authorization header (expected: Bearer <token>)',
          meta: {},
        }),
      };
    }
    const token = header.slice(7).trim();
    let payload;
    try {
      payload = this.jwt.verifyAccess(token);
    } catch (e) {
      return {
        ok: false,
        reply: reply.code(401).send({
          success: false,
          data: null,
          error: (e as Error).message === 'jwt expired' ? 'Access token expired' : 'Invalid access token',
          meta: {},
        }),
      };
    }
    // Load fresh user state (plan/role may have changed since token mint).
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, plan: true, role: true, createdAt: true },
    });
    if (!user || user.role === 'BANNED') {
      return {
        ok: false,
        reply: reply.code(user ? 403 : 401).send({
          success: false,
          data: null,
          error: user ? 'Account is banned' : 'User no longer exists',
          meta: {},
        }),
      };
    }
    request.user = { id: user.id, email: user.email, plan: user.plan as PublicUser['plan'], role: user.role as PublicUser['role'], createdAt: user.createdAt.toISOString() };
    return { ok: true, user: request.user };
  }

  /**
   * Require a valid API key in X-API-Key.
   * If X-Timestamp + X-Signature are present, also verify the HMAC-SHA256 signature.
   */
  async requireApiKey(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<{ ok: true; user: PublicUser & { id: string } } | { ok: false; reply: FastifyReply }> {
    const apiKey = request.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      return {
        ok: false,
        reply: reply.code(401).send({
          success: false,
          data: null,
          error: 'Missing X-API-Key header',
          meta: {},
        }),
      };
    }
    const keyHash = hashApiKey(apiKey);
    const record = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: { user: { select: { id: true, email: true, plan: true, role: true, createdAt: true } } },
    });
    if (!record || record.revokedAt) {
      return {
        ok: false,
        reply: reply.code(401).send({
          success: false,
          data: null,
          error: 'Unknown or revoked API key',
          meta: {},
        }),
      };
    }
    if (record.user.role === 'BANNED') {
      return {
        ok: false,
        reply: reply.code(403).send({
          success: false,
          data: null,
          error: 'Account is banned',
          meta: {},
        }),
      };
    }
    // Optional HMAC signature verification.
    const tsHeader = request.headers['x-timestamp'];
    const sigHeader = request.headers['x-signature'];
    if (tsHeader !== undefined || sigHeader !== undefined) {
      const ts = Number(tsHeader);
      if (!Number.isInteger(ts) || !isTimestampValid(ts)) {
        return {
          ok: false,
          reply: reply.code(401).send({
            success: false,
            data: null,
            error: 'X-Timestamp missing or stale (>5min skew)',
            meta: {},
          }),
        };
      }
      const sig = String(sigHeader ?? '');
      const valid = verifySignature(
        { apiKey, method: request.method, path: request.url.split('?')[0] ?? '/', timestampSec: ts },
        sig
      );
      if (!valid) {
        return {
          ok: false,
          reply: reply.code(401).send({
            success: false,
            data: null,
            error: 'X-Signature verification failed',
            meta: {},
          }),
        };
      }
    }
    // Touch lastUsedAt (fire-and-forget).
    void prisma.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    request.apiKeyId = record.id;
    request.user = {
      id: record.user.id,
      email: record.user.email,
      plan: record.user.plan as PublicUser['plan'],
      role: record.user.role as PublicUser['role'],
      createdAt: record.user.createdAt.toISOString(),
    };
    return { ok: true, user: request.user };
  }
}