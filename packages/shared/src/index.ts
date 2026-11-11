/**
 * @api-website/shared — public types, constants, and the `ApiResponse` envelope.
 * Consumed by the web app, the gateway, and api-service.
 */

export type Plan = 'free' | 'pro' | 'enterprise';
export type Role = 'user' | 'admin' | 'banned';

/**
 * Unified API response envelope.
 * Every API route returns this shape so the frontend can destructure
 * `{ success, data, error, meta }` in one place.
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T | null;
  error: string | null;
  meta: {
    /** Correlation id (Fastify request.id) when available. */
    requestId: string;
    /** ISO-8601 timestamp. */
    timestamp: string;
    /** Additional context (latencyMs, rate-limit headers, etc.). */
    [key: string]: unknown;
  };
}

export interface PublicUser {
  id: string;
  email: string;
  plan: Plan;
  role: Role;
  githubAvatar: string | null;
  createdAt: string;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  accessTtlSec: number;
  refreshTtlSec: number;
}

export interface AuthResult {
  user: PublicUser;
  tokens: TokenPair;
}

export interface EchoResult {
  message: string;
  echoedAt: string;
}

export interface WeatherResult {
  city: string;
  tempC: number;
  condition: string;
}

export interface TranslateResult {
  translated: string;
  source: string;
  target: string;
  original: string;
}

export interface UsageBucket {
  /** ISO date string for the bucket. */
  period: string;
  requests: number;
  errors: number;
  /** 0..1 */
  errorRate: number;
  /** milliseconds */
  avgLatencyMs: number;
}

export interface UsageSummary {
  buckets: UsageBucket[];
  total: number;
  range: 'day' | 'week' | 'month';
}

export interface MeProfile {
  user: PublicUser;
  activeSubscription: {
    plan: Plan;
    status: string;
    createdAt: string;
  } | null;
  keyCount: number;
}

export interface AdminUserRow {
  id: string;
  email: string;
  plan: Plan;
  role: Role;
  createdAt: string;
  apiKeys: number;
  usage: number;
  subscriptions: number;
}

export interface TopUsageRow {
  email: string;
  calls: number;
  errors: number;
  avgLatencyMs: number;
}

/** Plans catalog exposed to the marketing site and the admin UI. */
export interface Plan {
  name: Plan;
  priceUsd: number;
  limitPerDay: number; // 0 = unlimited
  features: string[];
}

export const PLANS: Plan[] = [
  {
    name: 'free',
    priceUsd: 0,
    limitPerDay: 100,
    features: ['100 API calls/day', 'Community support', '1 API key'],
  },
  {
    name: 'pro',
    priceUsd: 29,
    limitPerDay: 10000,
    features: ['10,000 API calls/day', 'Priority support', '10 API keys', 'Usage analytics'],
  },
  {
    name: 'enterprise',
    priceUsd: 199,
    limitPerDay: 0,
    features: ['Unlimited API calls', 'Dedicated support', 'SLA 99.9%', 'Custom integrations'],
  },
];

export const PLAN_LIMITS: Record<Plan, number> = {
  free: 100,
  pro: 10000,
  enterprise: 0,
};

export const API_KEY_PREFIX = 'sk_live_';

export const GITHUB_REPO_URL = 'https://github.com/your-org/api-website';

/** Convenience constructor — every route in the gateway should use this. */
export function envelope<T>(
  success: boolean,
  data: T | null,
  error: string | null,
  meta: Record<string, unknown> = {}
): ApiResponse<T> {
  return {
    success,
    data,
    error,
    meta: {
      requestId: (meta.requestId as string) ?? '',
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}