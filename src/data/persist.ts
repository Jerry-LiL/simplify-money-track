import { PersistedSnapshot } from './types';

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const STORAGE_KEY = 'simplify_track_snapshot_v1';
export const STORAGE_VERSION = 1;

function getAsyncStorage(): any {
  const mod = require('@react-native-async-storage/async-storage');
  return mod.default || mod;
}

export const defaultStorage: StorageAdapter = {
  getItem: async (key: string) => {
    return getAsyncStorage().getItem(key);
  },
  setItem: async (key: string, value: string) => {
    return getAsyncStorage().setItem(key, value);
  },
};

export async function saveSnapshot(
  snapshot: Omit<PersistedSnapshot, 'version'> & { version?: number },
  storage: StorageAdapter = defaultStorage
): Promise<void> {
  const fullSnapshot: PersistedSnapshot = {
    version: snapshot.version ?? STORAGE_VERSION,
    store: snapshot.store,
    syncToken: snapshot.syncToken,
    accounts: snapshot.accounts,
    lastSyncedAt: snapshot.lastSyncedAt,
  };
  await storage.setItem(STORAGE_KEY, JSON.stringify(fullSnapshot));
}

export async function loadSnapshot(
  storage: StorageAdapter = defaultStorage
): Promise<PersistedSnapshot | null> {
  try {
    const raw = await storage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    if (parsed.version !== STORAGE_VERSION) {
      return null;
    }

    if (!parsed.store || typeof parsed.store !== 'object') {
      return null;
    }

    if (!parsed.store.byId || !parsed.store.tombstones) {
      return null;
    }

    if (!Array.isArray(parsed.accounts)) {
      return null;
    }

    if (typeof parsed.lastSyncedAt !== 'number') {
      return null;
    }

    return parsed as PersistedSnapshot;
  } catch {
    return null;
  }
}
