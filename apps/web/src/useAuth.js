/**
 * Simple auth state hook backed by localStorage.
 * Stores accessToken + refreshToken + last known user object.
 */
import { useCallback, useState } from 'react';
import { api } from './apiClient.js';

function readUser() {
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState(readUser);

  const setAuth = useCallback((u) => {
    localStorage.setItem('user', JSON.stringify(u));
    setUser(u);
  }, []);

  const clearAuth = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setUser(null);
  }, []);

  /** Refresh the access token and return the new pair (or null on failure). */
  const refresh = useCallback(async () => {
    const rt = localStorage.getItem('refreshToken');
    if (!rt) return null;
    try {
      const res = await api.post('/auth/refresh', { refreshToken: rt });
      localStorage.setItem('accessToken', res.data.tokens.accessToken);
      localStorage.setItem('refreshToken', res.data.tokens.refreshToken);
      return res.data.tokens;
    } catch {
      clearAuth();
      return null;
    }
  }, [clearAuth]);

  return { user, setAuth, clearAuth, refresh };
}