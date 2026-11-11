/**
 * JWT utilities: access + refresh token signing/verification.
 * Uses HS256 with JWT_SECRET (min 32 chars enforced at boot).
 */
import jwt from 'jsonwebtoken';
import type { Plan, Role } from '@api-website/shared';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  plan: Plan;
  role: Role;
  type: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTtlSec: number;
  refreshTtlSec: number;
}

export class AuthConfigError extends Error {}

export interface JwtOptions {
  secret: string;
  accessTtl?: string;
  refreshTtl?: string;
}

export class Jwt {
  private readonly secret: string;
  private readonly accessTtl: string;
  private readonly refreshTtl: string;

  constructor(opts: JwtOptions) {
    if (!opts.secret || opts.secret.length < 32) {
      throw new AuthConfigError('JWT_SECRET must be at least 32 characters long');
    }
    this.secret = opts.secret;
    this.accessTtl = opts.accessTtl ?? '15m';
    this.refreshTtl = opts.refreshTtl ?? '7d';
  }

  /** Sign a fresh access/refresh pair for a user. */
  signPair(userId: string, email: string, plan: Plan, role: Role): TokenPair {
    const base: Omit<AccessTokenPayload, 'type'> = { sub: userId, email, plan, role };
    const accessToken = jwt.sign({ ...base, type: 'access' as const }, this.secret, {
      expiresIn: this.accessTtl,
    });
    const refreshToken = jwt.sign({ ...base, type: 'refresh' as const }, this.secret, {
      expiresIn: this.refreshTtl,
    });
    return {
      accessToken,
      refreshToken,
      accessTtlSec: jwt.decode(accessToken, { json: true }) && 900,
      refreshTtlSec: 7 * 24 * 3600,
    };
  }

  /** Verify an access token; throws on invalid/expired. */
  verifyAccess(token: string): AccessTokenPayload {
    const payload = jwt.verify(token, this.secret) as AccessTokenPayload;
    if (payload.type !== 'access') {
      throw new AuthConfigError('Not an access token');
    }
    return payload;
  }

  /** Verify a refresh token; throws on invalid/expired. */
  verifyRefresh(token: string): AccessTokenPayload {
    const payload = jwt.verify(token, this.secret) as AccessTokenPayload;
    if (payload.type !== 'refresh') {
      throw new AuthConfigError('Not a refresh token');
    }
    return payload;
  }
}