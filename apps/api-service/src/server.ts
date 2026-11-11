/**
 * api-service: pure business logic (echo / weather / translate).
 * No auth, no rate limits, no DB — those all live in the gateway.
 */
import Fastify from 'fastify';
import { ApiResponse } from '@api-website/shared';

function ok<T>(data: T, meta: ApiResponse<T>['meta'] = {}): ApiResponse<T> {
  return { success: true, data, error: null, meta: { requestId: 'api-service', ...meta } };
}

function fail(code: number, error: string): ApiResponse<never> {
  return { success: false, data: null, error, meta: {} } as ApiResponse<never>;
}

const WEATHER: Record<string, { tempC: number; condition: string }> = {
  beijing: { tempC: 22, condition: 'sunny' },
  shanghai: { tempC: 26, condition: 'cloudy' },
  guangzhou: { tempC: 30, condition: 'rain' },
  default: { tempC: 18, condition: 'unknown' },
};

function buildApp() {
  const app = Fastify({
    logger: { level: process.env.NODE_ENV === 'production' ? 'warn' : 'info' },
  });

  app.get('/health', async (_req, reply) => reply.send({ status: 'ok', service: 'api-service' }));

  app.get('/api/v1/echo', async (request, reply) => {
    const q = request.query as Record<string, string>;
    return reply.send(ok({ message: q.message ?? '' }, { echo: q }));
  });

  app.get('/api/v1/weather', async (request, reply) => {
    const city = String((request.query as { city?: string }).city ?? 'default').toLowerCase();
    const w = WEATHER[city] ?? WEATHER.default;
    return reply.send(ok({ city, tempC: w.tempC, condition: w.condition }));
  });

  app.post('/api/v1/translate', async (request, reply) => {
    const { text, target } = (request.body ?? {}) as { text?: string; target?: string };
    if (!text || !target) {
      return reply.code(400).send(fail(400, 'text and target are required'));
    }
    return reply.send(
      ok({ translated: `[${target}] ${text}`, source: 'mock', target }, { textLength: text.length })
    );
  });

  app.setNotFoundHandler((_req, reply) => reply.code(404).send(fail(404, 'Route not found')));
  app.setErrorHandler((err) => {
    console.error('[api-service] error', err);
  });
  return app;
}

async function main(): Promise<void> {
  const port = Number(process.env.API_SERVICE_PORT ?? 8081);
  const app = buildApp();
  await app.listen({ port, host: '0.0.0.0' });
  app.log.info(`api-service listening on :${port}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});