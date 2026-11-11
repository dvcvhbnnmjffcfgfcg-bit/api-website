/**
 * API gateway entrypoint. Boots the Fastify app and listens on PORT (default 8080).
 */
import { loadConfig } from './config.js';
import { buildApp } from './app.js';
import { prisma } from '@api-website/db';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const { app, rateLimiter } = await buildApp(cfg);

  await app.listen({ port: cfg.port, host: '0.0.0.0' });
  app.log.info(`API Gateway listening on :${cfg.port} (rate-limit backend: ${rateLimiter.backend})`);

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    rateLimiter.close();
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[gateway] fatal boot error', err);
  process.exit(1);
});