/**
 * Auth routes: register / login / refresh / GitHub OAuth.
 * All responses use the unified { success, data, error, meta } envelope.
 */
import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@api-website/db';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { Jwt } from '@api-website/auth';
import type { PublicUser } from '@api-website/shared';

export interface AuthContext {
  jwt: Jwt;
}

export function registerAuthRoutes(app: FastifyInstance, ctx: AuthContext): void {
  app.post('/api/v1/auth/register', async (request, reply) => {
    const started = Date.now();
    const body = request.body as { email?: string; password?: string };
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return reply.code(400).send({ success: false, data: null, error: 'Invalid email address', meta: { requestId: request.id } });
    }
    if (password.length < 8) {
      return reply.code(400).send({ success: false, data: null, error: 'Password must be at least 8 characters', meta: { requestId: request.id } });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.code(409).send({ success: false, data: null, error: 'Email already registered', meta: { requestId: request.id } });
    }

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, passwordHash },
    });
    const tokens = ctx.jwt.signPair(user.id, user.email, user.plan as PublicUser['plan'], user.role as PublicUser['role']);

    app.metrics.recordRequest('POST /api/v1/auth/register', 201, Date.now() - started);
    return reply.code(201).send({
      success: true,
      data: {
        user: publicUser(user),
        tokens,
      },
      error: null,
      meta: { requestId: request.id, latencyMs: Date.now() - started },
    });
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    const started = Date.now();
    const body = request.body as { email?: string; password?: string };
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '');

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.code(401).send({ success: false, data: null, error: 'Invalid email or password', meta: { requestId: request.id } });
    }
    if (user.role === 'BANNED') {
      return reply.code(403).send({ success: false, data: null, error: 'Account is banned', meta: { requestId: request.id } });
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return reply.code(401).send({ success: false, data: null, error: 'Invalid email or password', meta: { requestId: request.id } });
    }
    const tokens = ctx.jwt.signPair(user.id, user.email, user.plan as PublicUser['plan'], user.role as PublicUser['role']);

    app.metrics.recordRequest('POST /api/v1/auth/login', 200, Date.now() - started);
    return reply.send({
      success: true,
      data: { user: publicUser(user), tokens },
      error: null,
      meta: { requestId: request.id, latencyMs: Date.now() - started },
    });
  });

  app.post('/api/v1/auth/refresh', async (request, reply) => {
    const started = Date.now();
    const body = request.body as { refreshToken?: string };
    const refreshToken = String(body?.refreshToken ?? '');
    try {
      const payload = ctx.jwt.verifyRefresh(refreshToken);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || user.role === 'BANNED') {
        return reply.code(401).send({ success: false, data: null, error: 'User unavailable', meta: { requestId: request.id } });
      }
      const tokens = ctx.jwt.signPair(user.id, user.email, user.plan as PublicUser['plan'], user.role as PublicUser['role']);
      app.metrics.recordRequest('POST /api/v1/auth/refresh', 200, Date.now() - started);
      return reply.send({ success: true, data: { tokens }, error: null, meta: { requestId: request.id } });
    } catch {
      app.metrics.recordRequest('POST /api/v1/auth/refresh', 401, Date.now() - started);
      return reply.code(401).send({ success: false, data: null, error: 'Invalid or expired refresh token', meta: { requestId: request.id } });
    }
  });

  // GitHub OAuth — step 1: build the authorization redirect URL.
  app.get('/api/v1/auth/github/authorize', async (_request, reply) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      return reply.code(501).send({
        success: false,
        data: null,
        error: 'GitHub OAuth not configured (set GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)',
        meta: { requestId: _request.id },
      });
    }
    const url =
      `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}` +
      `&scope=read:user&redirect_uri=${encodeURIComponent(process.env.GITHUB_CALLBACK_URL ?? '')}` +
      `&state=${encodeURIComponent(randomBytes(16).toString('hex'))}`;
    return reply.send({ success: true, data: { url }, error: null, meta: {} });
  });

  // GitHub OAuth — step 2: exchange code for user + tokens (server-to-server).
  app.post('/api/v1/auth/github/callback', async (request, reply) => {
    const started = Date.now();
    const code = String((request.body as { code?: string })?.code ?? '');
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    const callbackUrl = process.env.GITHUB_CALLBACK_URL;
    if (!clientId || !clientSecret || !callbackUrl) {
      return reply.code(501).send({ success: false, data: null, error: 'GitHub OAuth not configured', meta: { requestId: request.id } });
    }
    if (!code) {
      return reply.code(400).send({ success: false, data: null, error: 'Missing code', meta: { requestId: request.id } });
    }
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      return reply.code(401).send({ success: false, data: null, error: 'GitHub token exchange failed', meta: { requestId: request.id } });
    }
    const ghRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
    if (!ghRes.ok) {
      return reply.code(401).send({ success: false, data: null, error: 'GitHub user fetch failed', meta: { requestId: request.id } });
    }
    const gh = (await ghRes.json()) as { id: number; login: string; avatar_url: string; email?: string };

    const user = await prisma.user.upsert({
      where: { githubId: String(gh.id) },
      update: { githubAvatar: gh.avatar_url },
      create: {
        githubId: String(gh.id),
        githubAvatar: gh.avatar_url,
        email: gh.email ?? `${gh.login}@users.noreply.github.com`,
        passwordHash: 'oauth_only',
      },
    });
    const tokens = ctx.jwt.signPair(user.id, user.email, user.plan as PublicUser['plan'], user.role as PublicUser['role']);
    app.metrics.recordRequest('POST /api/v1/auth/github/callback', 200, Date.now() - started);
    return reply.send({
      success: true,
      data: { user: publicUser(user), tokens },
      error: null,
      meta: { requestId: request.id },
    });
  });
}

/** Shape a Prisma user into the public representation. */
function publicUser(user: {
  id: string;
  email: string;
  plan: string;
  role: string;
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    plan: user.plan.toLowerCase() as PublicUser['plan'],
    role: user.role.toLowerCase() as PublicUser['role'],
    createdAt: user.createdAt.toISOString(),
  };
}

declare module 'fastify' {
  interface FastifyInstance {
    metrics: import('../lib/metrics.js').Metrics;
  }
}