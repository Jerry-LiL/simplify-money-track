import { createApi, SyncTokenExpired } from '../api';
import { fullSync, incrementalSync, resetSyncStateForTests, syncAll } from '../sync';
import { Account, TxnStore } from '../types';
import { createEmptyStore } from '../store';

describe('sync', () => {
  const accounts: Account[] = [
    { id: 'acc_4821', bank: 'HDFC', type: 'SAVINGS', last4: '4821', nickname: 'HDFC' },
  ];

  const fakeSleep = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    fakeSleep.mockClear();
    resetSyncStateForTests();
  });

  it('pages through transactions with re-sent boundary record and dedupes', async () => {
    const rawTxn1 = {
      id: 'txn_1',
      account_id: 'acc_4821',
      occurred_at: '2026-10-09T10:00:00Z',
      direction: 'debit',
      amount_minor: 1000,
      currency: 'INR',
      merchant: 'M1',
      status: 'POSTED',
    };
    const rawTxn2 = {
      id: 'txn_2',
      account_id: 'acc_4821',
      occurred_at: '2026-10-09T11:00:00Z',
      direction: 'debit',
      amount_minor: 2000,
      currency: 'INR',
      merchant: 'M2',
      status: 'POSTED',
    };
    const rawTxn3 = {
      id: 'txn_3',
      account_id: 'acc_4821',
      occurred_at: '2026-10-09T12:00:00Z',
      direction: 'debit',
      amount_minor: 3000,
      currency: 'INR',
      merchant: 'M3',
      status: 'POSTED',
    };

    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/v1/transactions?')) {
        if (!url.includes('cursor=')) {
          // Page 1 ends with txn_2
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [rawTxn1, rawTxn2],
              next_cursor: 'cur_page2',
              sync_token: 'st_list',
            }),
          };
        } else {
          // Page 2 re-sends txn_2 (boundary record) and ends with txn_3
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [rawTxn2, rawTxn3],
              next_cursor: null,
              sync_token: 'st_list',
            }),
          };
        }
      }
      if (url.includes('/v1/transactions/changes?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [],
            next_cursor: null,
            sync_token: 'st_final',
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const api = createApi('http://test-api.local', mockFetch, { sleepImpl: fakeSleep });
    const result = await fullSync(api, accounts);

    expect(Object.keys(result.store.byId)).toHaveLength(3);
    expect(result.store.byId['txn_2'].amountMinor).toBe(2000);
    expect(result.syncToken).toBe('st_final');
  });

  it('retries on 500 error during sync and succeeds', async () => {
    let listCall = 0;
    const rawTxn = {
      id: 'txn_retry_500',
      account_id: 'acc_4821',
      occurred_at: '2026-10-09T10:00:00Z',
      direction: 'debit',
      amount_minor: 1500,
      currency: 'INR',
      merchant: 'M',
      status: 'POSTED',
    };

    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/v1/transactions?')) {
        listCall++;
        if (listCall === 1) {
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
          json: async () => ({
            items: [rawTxn],
            next_cursor: null,
            sync_token: 'st_list',
          }),
        };
      }
      if (url.includes('/v1/transactions/changes?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [],
            next_cursor: null,
            sync_token: 'st_final',
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const api = createApi('http://test-api.local', mockFetch, { sleepImpl: fakeSleep, baseDelayMs: 10 });
    const result = await fullSync(api, accounts);

    expect(result.store.byId['txn_retry_500']).toBeDefined();
    expect(fakeSleep).toHaveBeenCalledTimes(1);
  });

  it('retries on 429 with Retry-After during changes sync', async () => {
    let changesCall = 0;
    const headers = new Map<string, string>();
    headers.set('Retry-After', '2');

    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/v1/transactions/changes?')) {
        changesCall++;
        if (changesCall === 1) {
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
          json: async () => ({
            items: [],
            next_cursor: null,
            sync_token: 'st_updated',
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const api = createApi('http://test-api.local', mockFetch, { sleepImpl: fakeSleep });
    const store = createEmptyStore();
    const result = await incrementalSync(api, store, 'st_current', accounts);

    expect(changesCall).toBe(2);
    expect(fakeSleep).toHaveBeenCalledWith(2000);
    expect(result.syncToken).toBe('st_updated');
  });

  it('leaves the previous store untouched if a failure occurs in the middle of a full sync', async () => {
    const existingStore: TxnStore = {
      byId: {
        existing_1: {
          id: 'existing_1',
          accountId: 'acc_4821',
          occurredAt: 1000,
          direction: 'debit',
          amountMinor: 500,
          currency: 'INR',
          inrMinor: 500,
          merchant: 'Existing',
          category: null,
          status: 'POSTED',
          updatedAt: 0,
          ownTransfer: false,
          counterpartyAccountId: null,
          raw: {},
        },
      },
      tombstones: {},
    };

    let page = 0;
    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/v1/transactions?')) {
        page++;
        if (page === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [{ id: 'new_1', account_id: 'acc_4821', occurred_at: '2026-10-09T10:00:00Z', direction: 'debit', amount_minor: 100, status: 'POSTED' }],
              next_cursor: 'cur_fail',
              sync_token: 'st_1',
            }),
          };
        }
        // Second page fails permanently with 400
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: 'invalid_cursor' }),
          headers: new Headers(),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const api = createApi('http://test-api.local', mockFetch, { sleepImpl: fakeSleep });

    let currentStore = existingStore;
    await expect(async () => {
      const res = await fullSync(api, accounts);
      currentStore = res.store;
    }).rejects.toThrow();

    // Previous store is completely intact
    expect(currentStore).toBe(existingStore);
    expect(Object.keys(currentStore.byId)).toHaveLength(1);
    expect(currentStore.byId['existing_1']).toBeDefined();
    expect(currentStore.byId['new_1']).toBeUndefined();
  });

  it('falls back to full sync when incremental sync receives 410 sync_token_expired', async () => {
    let fullSyncCalled = false;

    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/v1/accounts')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: accounts }),
        };
      }
      if (url.includes('/v1/transactions/changes?')) {
        if (url.includes('since=expired_token')) {
          return {
            ok: false,
            status: 410,
            json: async () => ({ error: 'sync_token_expired', detail: 'Do a full sync.' }),
            headers: new Headers(),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [],
            next_cursor: null,
            sync_token: 'st_fresh_after_changes',
          }),
        };
      }
      if (url.includes('/v1/transactions?')) {
        fullSyncCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [{
              id: 'txn_fresh_1',
              account_id: 'acc_4821',
              occurred_at: '2026-10-09T10:00:00Z',
              direction: 'debit',
              amount_minor: 1200,
              currency: 'INR',
              merchant: 'Fresh',
              status: 'POSTED',
            }],
            next_cursor: null,
            sync_token: 'st_fresh_list',
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const api = createApi('http://test-api.local', mockFetch, { sleepImpl: fakeSleep });
    const store = createEmptyStore();

    const result = await syncAll({
      api,
      store,
      syncToken: 'expired_token',
      accounts,
    });

    expect(fullSyncCalled).toBe(true);
    expect(result.syncToken).toBe('st_fresh_after_changes');
    expect(result.store.byId['txn_fresh_1']).toBeDefined();
  });

  it('reuses the in-flight promise when two syncAll calls race, making only one set of requests', async () => {
    let accountsCalls = 0;
    let listCalls = 0;

    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/v1/accounts')) {
        accountsCalls++;
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: accounts }),
        };
      }
      if (url.includes('/v1/transactions?')) {
        listCalls++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [],
            next_cursor: null,
            sync_token: 'st_list_concurrent',
          }),
        };
      }
      if (url.includes('/v1/transactions/changes?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [],
            next_cursor: null,
            sync_token: 'st_final_concurrent',
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const api = createApi('http://test-api.local', mockFetch, { sleepImpl: fakeSleep });
    const store = createEmptyStore();

    const deps = {
      api,
      store,
      syncToken: null,
      accounts: [],
    };

    const [res1, res2] = await Promise.all([
      syncAll(deps),
      syncAll(deps),
    ]);

    expect(res1).toBe(res2);
    expect(accountsCalls).toBe(1);
    expect(listCalls).toBe(1);
  });

  it('counts unreadable records in fullSync and incrementalSync and returns unreadable count in SyncResult', async () => {
    const validTxn = {
      id: 'txn_ok',
      account_id: 'acc_4821',
      occurred_at: '2026-10-09T10:00:00Z',
      direction: 'debit',
      amount_minor: 1000,
      currency: 'INR',
      merchant: 'Valid',
      status: 'POSTED',
    };
    const invalidTxn1 = { id: '', broken: true };
    const invalidTxn2 = { id: 'txn_bad_amount', account_id: 'acc_4821', amount_minor: 'not_a_number' };

    const invalidChange = { id: '', missing_fields: true };

    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/v1/accounts')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: accounts }),
        };
      }
      if (url.includes('/v1/transactions?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [validTxn, invalidTxn1, invalidTxn2],
            next_cursor: null,
            sync_token: 'st_list_unreadable',
          }),
        };
      }
      if (url.includes('/v1/transactions/changes?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [invalidChange],
            next_cursor: null,
            sync_token: 'st_final_unreadable',
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const api = createApi('http://test-api.local', mockFetch, { sleepImpl: fakeSleep });
    const store = createEmptyStore();

    const result = await syncAll({
      api,
      store,
      syncToken: null,
      accounts,
    });

    expect(Object.keys(result.store.byId)).toHaveLength(1);
    expect(result.store.byId['txn_ok']).toBeDefined();
    // 2 unreadable in list + 1 unreadable in changes = 3
    expect(result.unreadable).toBe(3);
  });

  it('proves the store passed in is not mutated when full fallback fails half-way after 410', async () => {
    const existingTxn = {
      id: 'txn_existing',
      accountId: 'acc_4821',
      occurredAt: 1000,
      direction: 'debit' as const,
      amountMinor: 500,
      currency: 'INR',
      inrMinor: 500,
      merchant: 'Existing',
      category: null,
      status: 'POSTED' as const,
      updatedAt: 0,
      ownTransfer: false,
      counterpartyAccountId: null,
      raw: {},
    };

    const initialStore: TxnStore = {
      byId: { txn_existing: existingTxn },
      tombstones: {},
    };

    let fullSyncPage = 0;
    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/v1/accounts')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ items: accounts }),
        };
      }
      if (url.includes('/v1/transactions/changes?')) {
        return {
          ok: false,
          status: 410,
          json: async () => ({ error: 'sync_token_expired' }),
          headers: new Headers(),
        };
      }
      if (url.includes('/v1/transactions?')) {
        fullSyncPage++;
        if (fullSyncPage === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [{
                id: 'txn_new_1',
                account_id: 'acc_4821',
                occurred_at: '2026-10-09T10:00:00Z',
                direction: 'debit',
                amount_minor: 1000,
                status: 'POSTED',
              }],
              next_cursor: 'cur_p2',
              sync_token: 'st_p1',
            }),
          };
        }
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: 'bad_page' }),
          headers: new Headers(),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const api = createApi('http://test-api.local', mockFetch, { sleepImpl: fakeSleep });

    await expect(
      syncAll({
        api,
        store: initialStore,
        syncToken: 'st_expired',
        accounts,
      })
    ).rejects.toThrow();

    expect(initialStore.byId['txn_existing']).toEqual(existingTxn);
    expect(initialStore.byId['txn_new_1']).toBeUndefined();
    expect(Object.keys(initialStore.byId)).toEqual(['txn_existing']);
    expect(initialStore.tombstones).toEqual({});
  });

  it('waits for in-flight sync with a different key to settle and then starts the new one', async () => {
    let resolveFirstSync: () => void = () => {};
    const firstSyncPromise = new Promise<void>((resolve) => {
      resolveFirstSync = resolve;
    });

    const calls: string[] = [];

    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.startsWith('http://server-1')) {
        if (!url.includes('/changes')) {
          calls.push('server-1:start');
          await firstSyncPromise;
          calls.push('server-1:end');
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [],
            next_cursor: null,
            sync_token: 'st_server1',
          }),
        };
      }
      if (url.startsWith('http://server-2')) {
        if (!url.includes('/changes')) {
          calls.push('server-2:run');
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [],
            next_cursor: null,
            sync_token: 'st_server2',
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const api1 = createApi('http://server-1', mockFetch, { sleepImpl: fakeSleep });
    const api2 = createApi('http://server-2', mockFetch, { sleepImpl: fakeSleep });
    const store = createEmptyStore();

    const p1 = syncAll({
      api: api1,
      store,
      syncToken: null,
      accounts,
      key: 'http://server-1:true',
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toEqual(['server-1:start']);

    const p2 = syncAll({
      api: api2,
      store,
      syncToken: null,
      accounts,
      key: 'http://server-2:true',
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toEqual(['server-1:start']);

    resolveFirstSync();

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1.syncToken).toBe('st_server1');
    expect(res2.syncToken).toBe('st_server2');
    expect(calls).toEqual(['server-1:start', 'server-1:end', 'server-2:run']);
  });

  it('waits for in-flight sync with a different key, ignores its error, and starts the new one', async () => {
    let rejectFirstSync: (err: Error) => void = () => {};
    const firstSyncPromise = new Promise<void>((_, reject) => {
      rejectFirstSync = reject;
    });

    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.startsWith('http://server-error')) {
        await firstSyncPromise;
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: 'crashed' }),
          headers: new Headers(),
        };
      }
      if (url.startsWith('http://server-ok')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [],
            next_cursor: null,
            sync_token: 'st_ok',
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const api1 = createApi('http://server-error', mockFetch, { sleepImpl: fakeSleep, maxRetries: 0 });
    const api2 = createApi('http://server-ok', mockFetch, { sleepImpl: fakeSleep });
    const store = createEmptyStore();

    const p1 = syncAll({
      api: api1,
      store,
      syncToken: null,
      accounts,
      key: 'http://server-error:true',
    });

    const p2 = syncAll({
      api: api2,
      store,
      syncToken: null,
      accounts,
      key: 'http://server-ok:true',
    });

    rejectFirstSync(new Error('Server 1 crashed'));

    await expect(p1).rejects.toThrow();

    const res2 = await p2;
    expect(res2.syncToken).toBe('st_ok');
  });

  it('treats forced full sync and incremental sync as different keys and does not return the same promise', async () => {
    let resolveFirst: () => void = () => {};
    const firstPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    const mockFetch = jest.fn().mockImplementation(async (url: string) => {
      if (url.includes('/v1/transactions/changes?')) {
        if (url.includes('since=st_initial')) {
          await firstPromise;
          return {
            ok: true,
            status: 200,
            json: async () => ({
              items: [],
              next_cursor: null,
              sync_token: 'st_inc',
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [],
            next_cursor: null,
            sync_token: 'st_full',
          }),
        };
      }
      if (url.includes('/v1/transactions?')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            items: [],
            next_cursor: null,
            sync_token: 'st_list',
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    });

    const api = createApi('http://test-api.local', mockFetch, { sleepImpl: fakeSleep });
    const store = createEmptyStore();

    const p1 = syncAll({
      api,
      store,
      syncToken: 'st_initial',
      accounts,
      forceFull: false,
    });

    const p2 = syncAll({
      api,
      store,
      syncToken: null,
      accounts,
      forceFull: true,
    });

    expect(p1).not.toBe(p2);

    resolveFirst();
    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1.syncToken).toBe('st_inc');
    expect(res2.syncToken).toBe('st_full');
  });
});
