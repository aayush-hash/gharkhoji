// The one place the app talks to the backend.
// - Adds the access token to every request
// - When the access token expires (401), silently uses the refresh token once and retries
// - Turns FastAPI error bodies into readable messages
import type { TokenPair } from './types';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// These are set by the auth store (src/lib/auth.ts) so this file has no circular import.
type TokenHandlers = {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  onTokensRefreshed: (tokens: TokenPair) => Promise<void>;
  onSessionExpired: () => Promise<void>;
};
let handlers: TokenHandlers | null = null;
export function registerTokenHandlers(h: TokenHandlers) {
  handlers = h;
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return detail;
    // Pydantic validation errors: [{loc: [...], msg: "..."}]
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string };
      return (first.msg ?? 'Invalid input').replace(/^Value error, /, '');
    }
  }
  if (status >= 500) return 'Server error. Please try again.';
  return `Request failed (${status})`;
}

// Only one refresh at a time, even if many requests fail together.
let refreshing: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = handlers?.getRefreshToken();
  if (!handlers || !refreshToken) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      await handlers.onSessionExpired();
      return false;
    }
    await handlers.onTokensRefreshed((await res.json()) as TokenPair);
    return true;
  } catch {
    return false; // network problem: keep the session, just fail this request
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | (string | number)[] | undefined | null>;
  auth?: boolean; // default true: send the token if we have one
};

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const params: string[] = [];
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    const values = Array.isArray(value) ? value : [value];
    for (const v of values) params.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return `${API_URL}${path}${params.length ? `?${params.join('&')}` : ''}`;
}

export async function api<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const { method = 'GET', body, query, auth = true } = options;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth ? handlers?.getAccessToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network');
  }

  if (res.status === 401 && token && !isRetry) {
    refreshing ??= refreshTokens().finally(() => {
      refreshing = null;
    });
    if (await refreshing) return api<T>(path, options, true);
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, errorMessage(data, res.status));
  return data as T;
}
