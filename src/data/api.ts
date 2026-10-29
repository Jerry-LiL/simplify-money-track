import {
  AccountsResponse,
  ChangesPageResponse,
  TransactionsPageResponse,
} from './types';

export class ApiError extends Error {
  status: number;
  code?: string;
  detail?: string;

  constructor(status: number, message: string, code?: string, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export class SyncTokenExpired extends ApiError {
  constructor(message = 'Sync token expired', detail?: string) {
    super(410, message, 'sync_token_expired', detail);
    this.name = 'SyncTokenExpired';
  }
}

export interface ApiOptions {
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  maxRetries?: number;
  baseDelayMs?: number;
}

export interface ApiClient {
  baseUrl: string;
  getAccounts(): Promise<AccountsResponse>;
  getTransactionsPage(cursor?: string | null, limit?: number): Promise<TransactionsPageResponse>;
  getChangesPage(since: string, cursor?: string | null, limit?: number): Promise<ChangesPageResponse>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createApi(
  baseUrl: string,
  fetchImplOrOptions?: typeof fetch | ApiOptions,
  extraOptions?: ApiOptions
): ApiClient {
  let fetchImpl: typeof fetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : (fetch as any);
  let options: ApiOptions = {};

  if (typeof fetchImplOrOptions === 'function') {
    fetchImpl = fetchImplOrOptions;
    if (extraOptions) {
      options = extraOptions;
    }
  } else if (fetchImplOrOptions && typeof fetchImplOrOptions === 'object') {
    options = fetchImplOrOptions;
    if (options.fetchImpl) {
      fetchImpl = options.fetchImpl;
    }
  }

  const sleepImpl = options.sleepImpl || defaultSleep;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxRetries = options.maxRetries ?? 4;
  const baseDelayMs = options.baseDelayMs ?? 200;

  const cleanBaseUrl = baseUrl.replace(/\/+$/, '');

  async function request<T>(path: string): Promise<T> {
    const url = `${cleanBaseUrl}${path}`;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      let timeoutTriggered = false;
      const timeoutId = setTimeout(() => {
        timeoutTriggered = true;
        controller.abort();
      }, timeoutMs);

      try {
        const res = await fetchImpl(url, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          return (await res.json()) as T;
        }

        let body: any = null;
        try {
          body = await res.json();
        } catch {}

        const status = res.status;
        const code = body && typeof body.error === 'string' ? body.error : undefined;
        const detail = body && typeof body.detail === 'string' ? body.detail : undefined;

        if (status === 410 || code === 'sync_token_expired') {
          throw new SyncTokenExpired(code || 'Sync token expired', detail);
        }

        const isRetryable = status === 429 || (status >= 500 && status < 600);

        if (isRetryable && attempt < maxRetries) {
          let delayMs = baseDelayMs * Math.pow(2, attempt);
          const retryAfterHeader = res.headers ? res.headers.get('Retry-After') : null;
          if (retryAfterHeader) {
            const seconds = parseInt(retryAfterHeader, 10);
            if (Number.isFinite(seconds) && seconds > 0) {
              delayMs = seconds * 1000;
            }
          }
          await sleepImpl(delayMs);
          continue;
        }

        throw new ApiError(status, `HTTP ${status}: ${code || 'Request failed'}`, code, detail);
      } catch (err: any) {
        clearTimeout(timeoutId);

        if (err instanceof SyncTokenExpired) {
          throw err;
        }

        if (err instanceof ApiError) {
          throw err;
        }

        if (attempt < maxRetries) {
          const delayMs = baseDelayMs * Math.pow(2, attempt);
          await sleepImpl(delayMs);
          continue;
        }

        if (timeoutTriggered) {
          throw new ApiError(408, `Request timeout after ${timeoutMs}ms`, 'timeout');
        }

        throw err;
      }
    }

    throw new ApiError(500, 'Request retry limit reached');
  }

  return {
    baseUrl: cleanBaseUrl,
    getAccounts(): Promise<AccountsResponse> {
      return request<AccountsResponse>('/v1/accounts');
    },
    getTransactionsPage(cursor?: string | null, limit = 100): Promise<TransactionsPageResponse> {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      if (cursor) {
        params.set('cursor', cursor);
      }
      return request<TransactionsPageResponse>(`/v1/transactions?${params.toString()}`);
    },
    getChangesPage(since: string, cursor?: string | null, limit = 100): Promise<ChangesPageResponse> {
      const params = new URLSearchParams();
      params.set('since', since);
      params.set('limit', String(limit));
      if (cursor) {
        params.set('cursor', cursor);
      }
      return request<ChangesPageResponse>(`/v1/transactions/changes?${params.toString()}`);
    },
  };
}
