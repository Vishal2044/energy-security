import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import type { ApiError } from '../../../shared/types';

export const api = axios.create({ baseURL: import.meta.env?.VITE_API_URL ?? '/api', withCredentials: true });
let sessionGeneration = 0;
let refreshPromise: { generation: number; promise: Promise<unknown> } | undefined;
type SessionRequestConfig = InternalAxiosRequestConfig & { dgSessionGeneration?: number; dgRefreshRetry?: boolean };
export const currentApiSession = () => sessionGeneration;
export function advanceApiSession() { sessionGeneration += 1; }
function csrfToken() { if (typeof document === 'undefined') return ''; return document.cookie.split('; ').find((item) => item.startsWith('dg_csrf='))?.slice('dg_csrf='.length) ?? ''; }
function shouldSendCsrf(method?: string) { return ['post', 'put', 'patch', 'delete'].includes(String(method ?? '').toLowerCase()); }

api.interceptors.request.use((config) => {
  const tracked = config as SessionRequestConfig;
  tracked.dgSessionGeneration ??= sessionGeneration;
  if (shouldSendCsrf(config.method)) {
    const token = csrfToken();
    if (token) config.headers.set('X-CSRF-Token', token);
  }
  return config;
});

export class ApiRequestError extends Error {
  constructor(public readonly code: string, public readonly details?: ApiError['details'], public readonly status?: number) { super(code); this.name = 'ApiRequestError'; }
}

api.interceptors.response.use((response) => response, async (error: AxiosError<Partial<ApiError>>) => {
  const data = error.response?.data;
  const config = error.config as SessionRequestConfig | undefined;
  const isAuthEndpoint = config?.url === '/auth/login' || config?.url === '/auth/refresh' || config?.url === '/auth/logout';
  if (error.response?.status === 401 && config && config.dgSessionGeneration === sessionGeneration && !isAuthEndpoint && !config.dgRefreshRetry) {
    config.dgRefreshRetry = true;
    if (!refreshPromise || refreshPromise.generation !== sessionGeneration) {
      const refresh = { generation: sessionGeneration, promise: Promise.resolve<unknown>(undefined) };
      refresh.promise = api.post('/auth/refresh').finally(() => { if (refreshPromise === refresh) refreshPromise = undefined; });
      refreshPromise = refresh;
    }
    try {
      await refreshPromise.promise;
      if (config.dgSessionGeneration === sessionGeneration) return api(config);
    } catch { /* session-expired event below */ }
  }
  // A response from an earlier account must not log out the newly signed-in user.
  if (error.response?.status === 401 && !isAuthEndpoint && config?.dgSessionGeneration === sessionGeneration && typeof window !== 'undefined') window.dispatchEvent(new Event('dg-session-expired'));
  return Promise.reject(new ApiRequestError(data?.error ?? 'SERVER_ERROR', data?.details, error.response?.status));
});
export async function getData<T>(url: string, params?: Record<string, string | number | undefined>, signal?: AbortSignal) { const response = await api.get<{ success: boolean; data: T }>(url, { params, signal }); return response.data.data; }
