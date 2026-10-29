import { Account, Txn, TxnStore } from './types';
import { normalizeTxn, parseDateMs } from './normalize';

export function createEmptyStore(): TxnStore {
  return {
    byId: {},
    tombstones: {},
  };
}

export function applyRecords(store: TxnStore, txns: Txn[]): TxnStore {
  let byIdChanged = false;
  let tombstonesChanged = false;
  const newById = { ...store.byId };
  const newTombstones = { ...store.tombstones };

  for (const txn of txns) {
    const tombstoneUpdated = newTombstones[txn.id];
    if (tombstoneUpdated !== undefined) {
      if (txn.updatedAt < tombstoneUpdated) {
        continue;
      }
      delete newTombstones[txn.id];
      tombstonesChanged = true;
    }

    const existing = newById[txn.id];
    if (existing) {
      if (txn.updatedAt < existing.updatedAt) {
        continue;
      }
    }

    newById[txn.id] = txn;
    byIdChanged = true;
  }

  if (!byIdChanged && !tombstonesChanged) {
    return store;
  }

  return {
    byId: newById,
    tombstones: newTombstones,
  };
}

export function applyDeletion(store: TxnStore, id: string, updatedAt: number): TxnStore {
  const existing = store.byId[id];
  const tombstone = store.tombstones[id];
  const currentUpdated = existing ? existing.updatedAt : (tombstone ?? -1);

  if (updatedAt < currentUpdated) {
    return store;
  }

  const newById = { ...store.byId };
  delete newById[id];

  const newTombstones = {
    ...store.tombstones,
    [id]: updatedAt,
  };

  return {
    byId: newById,
    tombstones: newTombstones,
  };
}

export interface ApplyChangesResult {
  store: TxnStore;
  appliedCount: number;
  unreadableCount: number;
}

export function applyChangesPage(
  store: TxnStore,
  rawChanges: unknown[],
  accounts?: Account[] | Map<string, string>
): ApplyChangesResult {
  let currentStore = store;
  let appliedCount = 0;
  let unreadableCount = 0;

  for (const raw of rawChanges) {
    if (!raw || typeof raw !== 'object') {
      unreadableCount++;
      continue;
    }

    const item = raw as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id : null;
    if (!id) {
      unreadableCount++;
      continue;
    }

    if (item.deleted === true) {
      const updatedAt = parseDateMs(item.updated_at) ?? 0;
      currentStore = applyDeletion(currentStore, id, updatedAt);
      appliedCount++;
    } else {
      const norm = normalizeTxn(item, accounts);
      if (norm) {
        currentStore = applyRecords(currentStore, [norm]);
        appliedCount++;
      } else {
        unreadableCount++;
      }
    }
  }

  return {
    store: currentStore,
    appliedCount,
    unreadableCount,
  };
}
