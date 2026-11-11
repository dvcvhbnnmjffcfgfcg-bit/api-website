/**
 * Web API client.
 * Base URL is configurable via VITE_API_GATEWAY (default same-origin /api).
 * Automatically retries once with a refresh token when access token expires.
 */
import { ApiResponse, PublicUser } from '@api-website/shared';

const BASE = import.meta.env.VITE_API_GATEWAY ?? '/api/v1';

async function request(path, method, body, auth) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth?.accessToken) headers.Authorization = `Bearer ${auth.accessToken}`;
  if (auth?.apiKey) headers['X-API-Key'] = auth.apiKey;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Invalid JSON response (HTTP ${res.status})`);
  }

  // 401 + refresh token available → try refresh and retry once.
  if (res.status === 401 && auth?.refreshToken && auth.onRefresh) {
    const refreshed = await auth.onRefresh();
    if (refreshed?.accessToken) {
      headers.Authorization = `Bearer ${refreshed.accessToken}`;
      const retry = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const retryJson = await retry.json();
      if (!retryJson.success) {
        throw new Error(retryJson.error ?? `HTTP ${retry.status}`);
      }
      return retryJson;
    }
  }

  if (!json.success) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }
  return json;
}

export const api = {
  get: (path) => request(path, 'GET'),
  post: (path, body) => request(path, 'POST', body),
  delete: (path) => request(path, 'DELETE'),

  /**
   * Call a business endpoint (echo/weather/translate) with an API key.
   * The gateway proxies these to the api-service and logs usage.
   */
  callBusiness: (path, method = 'GET', body, apiKey) =>
    request(path, method, body, { apiKey }),
};

export const AuthApi = {
  login: (email, password) => request('/auth/login', 'POST', { email, password }),
  register: (email, password) => request('/auth/register', 'POST', { email, password }),
};