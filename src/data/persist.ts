import { Account, PersistedSnapshot, Txn, TxnStore } from './types';

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
  multiGet?(keys: string[]): Promise<readonly [string, string | null][]>;
  multiSet?(keyValuePairs: [string, string][]): Promise<void>;
  multiRemove?(keys: string[]): Promise<void>;
}

export const STORAGE_VERSION = 1;
export const MANIFEST_KEY = 'track:manifest';
export const CHUNK_SIZE = 400;

export interface SnapshotManifest {
  version: number;
  snapshotId: string;
  chunkCount: number;
  syncToken: string | null;
  accounts: Account[];
  lastSyncedAt: number;
  tombstones: Record<string, number>;
}

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
  removeItem: async (key: string) => {
    return getAsyncStorage().removeItem(key);
  },
  multiGet: async (keys: string[]) => {
    return getAsyncStorage().multiGet(keys);
  },
  multiSet: async (pairs: [string, string][]) => {
    return getAsyncStorage().multiSet(pairs);
  },
  multiRemove: async (keys: string[]) => {
    return getAsyncStorage().multiRemove(keys);
  },
};

export async function saveSnapshot(
  snapshot: Omit<PersistedSnapshot, 'version'> & { version?: number },
  storage: StorageAdapter = defaultStorage
): Promise<void> {
  let prevSnapshotId: string | null = null;
  let prevChunkCount = 0;
  try {
    const prevManifestRaw = await storage.getItem(MANIFEST_KEY);
    if (prevManifestRaw) {
      const parsed = JSON.parse(prevManifestRaw);
      if (parsed && typeof parsed.snapshotId === 'string' && typeof parsed.chunkCount === 'number') {
        prevSnapshotId = parsed.snapshotId;
        prevChunkCount = parsed.chunkCount;
      }
    }
  } catch {}

  const snapshotId = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const txns = Object.values(snapshot.store.byId);
  const chunks: Txn[][] = [];

  for (let i = 0; i < txns.length; i += CHUNK_SIZE) {
    chunks.push(txns.slice(i, i + CHUNK_SIZE));
  }

  const pairs: [string, string][] = chunks.map((chunk, i) => [
    `track:snap:${snapshotId}:${i}`,
    JSON.stringify(chunk),
  ]);

  if (pairs.length > 0) {
    if (storage.multiSet) {
      await storage.multiSet(pairs);
    } else {
      for (const [key, value] of pairs) {
        await storage.setItem(key, value);
      }
    }
  }

  const manifest: SnapshotManifest = {
    version: snapshot.version ?? STORAGE_VERSION,
    snapshotId,
    chunkCount: chunks.length,
    syncToken: snapshot.syncToken,
    accounts: snapshot.accounts,
    lastSyncedAt: snapshot.lastSyncedAt,
    tombstones: snapshot.store.tombstones || {},
  };

  await storage.setItem(MANIFEST_KEY, JSON.stringify(manifest));

  if (prevSnapshotId && prevSnapshotId !== snapshotId && prevChunkCount > 0) {
    const oldKeys: string[] = [];
    for (let i = 0; i < prevChunkCount; i++) {
      oldKeys.push(`track:snap:${prevSnapshotId}:${i}`);
    }
    if (storage.multiRemove) {
      await storage.multiRemove(oldKeys);
    } else if (storage.removeItem) {
      for (const key of oldKeys) {
        await storage.removeItem(key);
      }
    }
  }
}

export async function loadSnapshot(
  storage: StorageAdapter = defaultStorage
): Promise<PersistedSnapshot | null> {
  try {
    const raw = await storage.getItem(MANIFEST_KEY);
    if (!raw) {
      return null;
    }

    const manifest: SnapshotManifest = JSON.parse(raw);
    if (!manifest || typeof manifest !== 'object') {
      return null;
    }

    if (manifest.version !== STORAGE_VERSION) {
      return null;
    }

    if (typeof manifest.snapshotId !== 'string' || typeof manifest.chunkCount !== 'number') {
      return null;
    }

    if (!Array.isArray(manifest.accounts) || typeof manifest.lastSyncedAt !== 'number') {
      return null;
    }

    const tombstones = manifest.tombstones && typeof manifest.tombstones === 'object'
      ? manifest.tombstones
      : {};

    const byId: Record<string, Txn> = {};

    if (manifest.chunkCount > 0) {
      const keys: string[] = [];
      for (let i = 0; i < manifest.chunkCount; i++) {
        keys.push(`track:snap:${manifest.snapshotId}:${i}`);
      }

      let rawChunks: (string | null)[] = [];
      if (storage.multiGet) {
        const pairs = await storage.multiGet(keys);
        const map = new Map<string, string | null>();
        for (const [k, v] of pairs) {
          map.set(k, v);
        }
        rawChunks = keys.map((k) => map.get(k) ?? null);
      } else {
        for (const k of keys) {
          rawChunks.push(await storage.getItem(k));
        }
      }

      for (const chunkStr of rawChunks) {
        if (!chunkStr) {
          return null;
        }
        let chunkTxns: unknown;
        try {
          chunkTxns = JSON.parse(chunkStr);
        } catch {
          return null;
        }
        if (!Array.isArray(chunkTxns)) {
          return null;
        }
        for (const txn of chunkTxns) {
          if (!txn || typeof txn !== 'object' || typeof (txn as any).id !== 'string') {
            return null;
          }
          byId[(txn as Txn).id] = txn as Txn;
        }
      }
    }

    return {
      version: manifest.version,
      store: {
        byId,
        tombstones,
      },
      syncToken: manifest.syncToken,
      accounts: manifest.accounts,
      lastSyncedAt: manifest.lastSyncedAt,
    };
  } catch {
    return null;
  }
}

export async function clearSnapshot(
  storage: StorageAdapter = defaultStorage
): Promise<void> {
  try {
    const raw = await storage.getItem(MANIFEST_KEY);
    if (raw) {
      const manifest = JSON.parse(raw);
      if (manifest && typeof manifest.snapshotId === 'string' && typeof manifest.chunkCount === 'number') {
        const keys: string[] = [];
        for (let i = 0; i < manifest.chunkCount; i++) {
          keys.push(`track:snap:${manifest.snapshotId}:${i}`);
        }
        if (storage.multiRemove) {
          await storage.multiRemove(keys);
        } else if (storage.removeItem) {
          for (const k of keys) {
            await storage.removeItem(k);
          }
        }
      }
    }
  } catch {}

  if (storage.removeItem) {
    await storage.removeItem(MANIFEST_KEY);
  } else {
    await storage.setItem(MANIFEST_KEY, '');
  }
}
