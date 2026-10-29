import { ApiError, createApi, SyncTokenExpired } from '../api';

describe('api', () => {
  const fakeSleep = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    fakeSleep.mockClear();
  });

  it('fetches accounts successfully', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ id: 'acc_4821', bank: 'HDFC', type: 'SAVINGS', last4: '4821', nickname: 'Savings' }] }),
    });

    const api = createApi('http://test-api.local', mockFetch, { sleepImpl: fakeSleep });
    const res = await api.getAccounts();

    expect(mockFetch).toHaveBeenCalledWith('http://test-api.local/v1/accounts', expect.anything());
    expect(res.items).toHaveLength(1);
    expect(res.items[0].id).toBe('acc_4821');
  });

  it('fetches transactions page with cursor and limit params', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [], next_cursor: 'cur_2', sync_token: 'st_1' }),
    });

    const api = createApi('http://test-api.local', mockFetch, { sleepImpl: fakeSleep });
    const res = await api.getTransactionsPage('cur_1', 50);

    expect(mockFetch).toHaveBeenCalledWith('http://test-api.local/v1/transactions?limit=50&cursor=cur_1', expect.anything());
    expect(res.next_cursor).toBe('cur_2');
    expect(res.sync_token).toBe('st_1');
  });

  it('retries on 500 internal server error and succeeds', async () => {
    let callCount = 0;
    const mockFetch = jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: 'internal_error' }),
          headers: new Headers(),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [{ id: 't1' }], next_cursor: null, sync_token: 'st_2' }),
      };
    });

    const api = createApi('http://test-api.local', mockFetch, { sleepImpl: fakeSleep, baseDelayMs: 10 });
    const res = await api.getTransactionsPage(null, 100);

    expect(callCount).toBe(2);
    expect(fakeSleep).toHaveBeenCalledTimes(1);
    expect(res.items).toHaveLength(1);
  });

  it('retries on 429 and honours Retry-After header', async () => {
    let callCount = 0;
    const headers = new Map<string, string>();
    headers.set('Retry-After', '3');

    const mockFetch = jest.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: 'rate_limited' }),
          headers: { get: (k: string) => headers.get(k) || null },
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [], next_cursor: null, sync_token: 'st_ok' }),
      };
    });

    const api = createApi('http://test-api.local', mockFetch, { sleepImpl: fakeSleep });
    await api.getTransactionsPage(null, 100);

    expect(callCount).toBe(2);
    expect(fakeSleep).toHaveBeenCalledWith(3000);
  });

  it('throws SyncTokenExpired on 410 without retrying', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 410,
      json: async () => ({ error: 'sync_token_expired', detail: 'Do a full sync.' }),
      headers: new Headers(),
    });

    const api = createApi('http://test-api.local', mockFetch, { sleepImpl: fakeSleep });

    await expect(api.getChangesPage('old_token')).rejects.toThrow(SyncTokenExpired);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(fakeSleep).not.toHaveBeenCalled();
  });

  it('throws ApiError on 400 without retrying', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_cursor' }),
      headers: new Headers(),
    });

    const api = createApi('http://test-api.local', mockFetch, { sleepImpl: fakeSleep });

    await expect(api.getTransactionsPage('bad_cur')).rejects.toThrow(ApiError);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws when retry attempts are exhausted', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ error: 'unavailable' }),
      headers: new Headers(),
    });

    const api = createApi('http://test-api.local', mockFetch, {
      sleepImpl: fakeSleep,
      maxRetries: 2,
      baseDelayMs: 5,
    });

    await expect(api.getChangesPage('token_1')).rejects.toThrow(ApiError);
    // 1 initial + 2 retries = 3 calls
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(fakeSleep).toHaveBeenCalledTimes(2);
  });
});
