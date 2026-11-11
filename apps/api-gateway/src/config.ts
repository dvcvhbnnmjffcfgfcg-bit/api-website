/**
 * Gateway configuration loaded from environment.
 * Fails fast on missing critical secrets.
 */
export interface GatewayConfig {
  port: number;
  jwtSecret: string;
  accessTtl: string;
  refreshTtl: string;
  apiServiceUrl: string;
  redisUrl: string | null;
  allowedOrigins: string[];
  limits: { free: number; pro: number; enterprise: number };
}

export function loadConfig(): GatewayConfig {
  const jwtSecret = process.env.JWT_SECRET ?? '';
  if (jwtSecret.length < 32) {
    console.error(
      '[config] JWT_SECRET missing or shorter than 32 chars. Generate with: openssl rand -hex 32'
    );
    process.exit(1);
  }
  return {
    port: Number(process.env.PORT ?? 8080),
    jwtSecret,
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
    apiServiceUrl: process.env.API_SERVICE_URL ?? 'http://localhost:8081',
    redisUrl: process.env.REDIS_URL || null,
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? process.env.WEB_ORIGIN ?? '*')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    limits: {
      free: Number(process.env.LIMIT_FREE ?? 100),
      pro: Number(process.env.LIMIT_PRO ?? 10000),
      enterprise: Number(process.env.LIMIT_ENTERPRISE ?? 0),
    },
  };
}