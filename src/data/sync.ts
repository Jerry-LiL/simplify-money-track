import { Account, SyncProgress, Txn, TxnStore } from './types';
import { ApiClient, SyncTokenExpired } from './api';
import { normalizeTxn } from './normalize';
import { applyChangesPage, applyRecords, createEmptyStore } from './store';

export interface FullSyncResult {
  store: TxnStore;
  syncToken: string;
  unreadable: number;
}

export interface IncrementalSyncResult {
  store: TxnStore;
  syncToken: string;
  unreadable: number;
}

export interface SyncDeps {
  api: ApiClient;
  store: TxnStore;
  syncToken: string | null;
  accounts: Account[];
  onProgress?: (progress: SyncProgress) => void;
  forceFull?: boolean;
  key?: string;
}

export interface SyncResult {
  store: TxnStore;
  syncToken: string;
  accounts: Account[];
  lastSyncedAt: number;
  unreadable: number;
}

let inFlightSync: Promise<SyncResult> | null = null;
let inFlightKey: string | null = null;
let currentGeneration = 0;

export function resetSyncStateForTests(): void {
  inFlightSync = null;
  inFlightKey = null;
  currentGeneration = 0;
}

export async function fullSync(
  api: ApiClient,
  accounts: Account[],
  onProgress?: (progress: SyncProgress) => void
): Promise<FullSyncResult> {
  let stagingStore = createEmptyStore();
  let cursor: string | null = null;
  let listSyncToken: string | null = null;
  let pagesLoaded = 0;
  let recordsLoaded = 0;
  let unreadableCount = 0;

  do {
    const res = await api.getTransactionsPage(cursor, 100);
    pagesLoaded++;
    listSyncToken = res.sync_token;

    const rawItems = res.items || [];
    const normalized: Txn[] = [];
    for (const raw of rawItems) {
      const norm = normalizeTxn(raw, accounts);
      if (norm) {
        normalized.push(norm);
      } else {
        unreadableCount++;
      }
    }

    recordsLoaded += normalized.length;
    stagingStore = applyRecords(stagingStore, normalized);
    cursor = res.next_cursor;

    onProgress?.({ pagesLoaded, recordsLoaded });
  } while (cursor !== null);

  if (!listSyncToken) {
    throw new Error('Full sync completed without sync_token');
  }

  // The list token is older than the change feed; immediately run incremental sync to bring the store to the latest truth
  const incrementalResult = await incrementalSync(
    api,
    stagingStore,
    listSyncToken,
    accounts,
    onProgress,
    { pagesLoaded, recordsLoaded }
  );

  return {
    store: incrementalResult.store,
    syncToken: incrementalResult.syncToken,
    unreadable: unreadableCount + incrementalResult.unreadable,
  };
}

export async function incrementalSync(
  api: ApiClient,
  store: TxnStore,
  token: string,
  accounts?: Account[],
  onProgress?: (progress: SyncProgress) => void,
  initialProgress?: SyncProgress
): Promise<IncrementalSyncResult> {
  let workingStore: TxnStore = {
    byId: { ...store.byId },
    tombstones: { ...store.tombstones },
  };

  let cursor: string | null = null;
  let currentToken = token;
  let pagesLoaded = initialProgress?.pagesLoaded ?? 0;
  let recordsLoaded = initialProgress?.recordsLoaded ?? 0;
  let unreadableCount = 0;

  do {
    const res = await api.getChangesPage(currentToken, cursor, 100);
    pagesLoaded++;
    currentToken = res.sync_token;

    const changeResult = applyChangesPage(workingStore, res.items || [], accounts);
    workingStore = changeResult.store;
    recordsLoaded += changeResult.appliedCount;
    unreadableCount += changeResult.unreadableCount;
    cursor = res.next_cursor;

    onProgress?.({ pagesLoaded, recordsLoaded });
  } while (cursor !== null);

  return {
    store: workingStore,
    syncToken: currentToken,
    unreadable: unreadableCount,
  };
}

export async function syncAll(deps: SyncDeps, key?: string): Promise<SyncResult> {
  const isForced = deps.forceFull ?? (deps.syncToken === null);
  const syncKey = key ?? deps.key ?? `${deps.api.baseUrl}:${isForced}`;

  while (inFlightSync && inFlightKey !== syncKey) {
    try {
      await inFlightSync;
    } catch {
      // ignore error from previous in-flight sync with a different key
    }
  }

  if (inFlightSync && inFlightKey === syncKey) {
    return inFlightSync;
  }

  const gen = ++currentGeneration;
  inFlightKey = syncKey;

  const run = async (): Promise<SyncResult> => {
    let accounts = deps.accounts;
    if (!accounts || accounts.length === 0) {
      const accRes = await deps.api.getAccounts();
      accounts = accRes.items;
    }

    let syncResult: { store: TxnStore; syncToken: string; unreadable: number };

    if (deps.forceFull || !deps.syncToken) {
      syncResult = await fullSync(deps.api, accounts, deps.onProgress);
    } else {
      try {
        syncResult = await incrementalSync(deps.api, deps.store, deps.syncToken, accounts, deps.onProgress);
      } catch (err) {
        if (err instanceof SyncTokenExpired || (err as any)?.status === 410) {
          syncResult = await fullSync(deps.api, accounts, deps.onProgress);
        } else {
          throw err;
        }
      }
    }

    if (gen !== currentGeneration) {
      throw new Error('Sync superseded by newer generation');
    }

    return {
      store: syncResult.store,
      syncToken: syncResult.syncToken,
      accounts,
      lastSyncedAt: Date.now(),
      unreadable: syncResult.unreadable,
    };
  };

  const promise = run().finally(() => {
    if (inFlightSync === promise) {
      inFlightSync = null;
      inFlightKey = null;
    }
  });

  inFlightSync = promise;
  return promise;
}
