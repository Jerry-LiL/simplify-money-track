import {
  clearSnapshot,
  defaultStorage,
  loadSnapshot,
  MANIFEST_KEY,
  saveSnapshot,
  StorageAdapter,
} from '../persist';
import { PersistedSnapshot, Txn } from '../types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

function createInMemoryStorage(): StorageAdapter & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: async (key: string) => data[key] ?? null,
    setItem: async (key: string, val: string) => {
      data[key] = val;
    },
    removeItem: async (key: string) => {
      delete data[key];
    },
    multiGet: async (keys: string[]) => {
      return keys.map((k) => [k, data[k] ?? null] as [string, string | null]);
    },
    multiSet: async (pairs: [string, string][]) => {
      for (const [k, v] of pairs) {
        data[k] = v;
      }
    },
    multiRemove: async (keys: string[]) => {
      for (const k of keys) {
        delete data[k];
      }
    },
  };
}

function makeTxn(id: string): Txn {
  return {
    id,
    accountId: 'acc_4821',
    occurredAt: 1760000000000,
    direction: 'debit',
    amountMinor: 5000,
    currency: 'INR',
    inrMinor: 5000,
    merchant: `Merchant ${id}`,
    category: 'FOOD',
    status: 'POSTED',
    updatedAt: 0,
    ownTransfer: false,
    counterpartyAccountId: null,
    raw: { id },
  };
}

describe('persist', () => {
  it('saves and loads a valid snapshot (round trip with chunks)', async () => {
    const storage = createInMemoryStorage();
    const byId: Record<string, Txn> = {};
    for (let i = 0; i < 950; i++) {
      const id = `t_${i}`;
      byId[id] = makeTxn(id);
    }

    const snapshot: PersistedSnapshot = {
      version: 1,
      store: {
        byId,
        tombstones: { t_old: 1750000000000 },
      },
      syncToken: 'st_saved',
      accounts: [
        { id: 'acc_4821', bank: 'HDFC', type: 'SAVINGS', last4: '4821', nickname: 'HDFC' },
      ],
      lastSyncedAt: 1760100000000,
    };

    await saveSnapshot(snapshot, storage);

    // 950 transactions at 400 per chunk = 3 chunks
    const manifestRaw = storage.data[MANIFEST_KEY];
    expect(manifestRaw).toBeDefined();
    const manifest = JSON.parse(manifestRaw);
    expect(manifest.chunkCount).toBe(3);

    const chunk0Key = `track:snap:${manifest.snapshotId}:0`;
    const chunk1Key = `track:snap:${manifest.snapshotId}:1`;
    const chunk2Key = `track:snap:${manifest.snapshotId}:2`;

    expect(storage.data[chunk0Key]).toBeDefined();
    expect(storage.data[chunk1Key]).toBeDefined();
    expect(storage.data[chunk2Key]).toBeDefined();

    const loaded = await loadSnapshot(storage);
    expect(loaded).toEqual(snapshot);
  });

  it('works with fallback sequential setItem and getItem (no multi methods)', async () => {
    const rawData: Record<string, string> = {};
    const minimalStorage: StorageAdapter = {
      getItem: async (key: string) => rawData[key] ?? null,
      setItem: async (key: string, val: string) => {
        rawData[key] = val;
      },
      removeItem: async (key: string) => {
        delete rawData[key];
      },
    };

    const snapshot: PersistedSnapshot = {
      version: 1,
      store: {
        byId: { t1: makeTxn('t1') },
        tombstones: {},
      },
      syncToken: 'st_min',
      accounts: [],
      lastSyncedAt: 123456,
    };

    await saveSnapshot(snapshot, minimalStorage);
    const loaded = await loadSnapshot(minimalStorage);
    expect(loaded).toEqual(snapshot);
  });

  it('works with defaultStorage (AsyncStorage)', async () => {
    const snapshot: PersistedSnapshot = {
      version: 1,
      store: { byId: { t1: makeTxn('t1') }, tombstones: {} },
      syncToken: 'st_default',
      accounts: [],
      lastSyncedAt: 123456,
    };

    await saveSnapshot(snapshot, defaultStorage);
    const loaded = await loadSnapshot(defaultStorage);

    expect(loaded).toEqual(snapshot);
  });

  it('leaves the previous snapshot loadable if a write throws halfway', async () => {
    const storage = createInMemoryStorage();
    const snap1: PersistedSnapshot = {
      version: 1,
      store: { byId: { t1: makeTxn('t1') }, tombstones: {} },
      syncToken: 'st_1',
      accounts: [],
      lastSyncedAt: 1000,
    };

    await saveSnapshot(snap1, storage);
    const loaded1 = await loadSnapshot(storage);
    expect(loaded1).toEqual(snap1);

    // Now attempt a write that fails halfway while writing chunks
    let calls = 0;
    const failingStorage: StorageAdapter = {
      getItem: (k) => storage.getItem(k),
      setItem: async (k, v) => {
        calls++;
        if (calls > 1) {
          throw new Error('Disk full');
        }
        await storage.setItem(k, v);
      },
      multiSet: async () => {
        throw new Error('Write failed mid-write');
      },
    };

    const snap2: PersistedSnapshot = {
      version: 1,
      store: { byId: { t2: makeTxn('t2') }, tombstones: {} },
      syncToken: 'st_2',
      accounts: [],
      lastSyncedAt: 2000,
    };

    await expect(saveSnapshot(snap2, failingStorage)).rejects.toThrow();

    // Previous snapshot is still completely intact and loadable
    const loadedAfterFail = await loadSnapshot(storage);
    expect(loadedAfterFail).toEqual(snap1);
  });

  it('cleans up old chunks after writing a new snapshot', async () => {
    const storage = createInMemoryStorage();

    const snap1: PersistedSnapshot = {
      version: 1,
      store: { byId: { t1: makeTxn('t1') }, tombstones: {} },
      syncToken: 'st_1',
      accounts: [],
      lastSyncedAt: 1000,
    };
    await saveSnapshot(snap1, storage);

    const m1 = JSON.parse(storage.data[MANIFEST_KEY]);
    const snap1ChunkKey = `track:snap:${m1.snapshotId}:0`;
    expect(storage.data[snap1ChunkKey]).toBeDefined();

    const snap2: PersistedSnapshot = {
      version: 1,
      store: { byId: { t2: makeTxn('t2') }, tombstones: {} },
      syncToken: 'st_2',
      accounts: [],
      lastSyncedAt: 2000,
    };
    await saveSnapshot(snap2, storage);

    const m2 = JSON.parse(storage.data[MANIFEST_KEY]);
    const snap2ChunkKey = `track:snap:${m2.snapshotId}:0`;

    expect(storage.data[snap2ChunkKey]).toBeDefined();
    // Old chunk key is removed
    expect(storage.data[snap1ChunkKey]).toBeUndefined();
  });

  it('returns null on corrupted data, version mismatch, or missing chunk', async () => {
    const storage = createInMemoryStorage();

    // No manifest
    expect(await loadSnapshot(storage)).toBeNull();

    // Invalid JSON manifest
    storage.data[MANIFEST_KEY] = 'not-json';
    expect(await loadSnapshot(storage)).toBeNull();

    // Version mismatch
    storage.data[MANIFEST_KEY] = JSON.stringify({ version: 99, snapshotId: 's1', chunkCount: 0 });
    expect(await loadSnapshot(storage)).toBeNull();

    // Missing chunk
    storage.data[MANIFEST_KEY] = JSON.stringify({
      version: 1,
      snapshotId: 's_missing',
      chunkCount: 2,
      syncToken: 'st',
      accounts: [],
      lastSyncedAt: 100,
      tombstones: {},
    });
    storage.data['track:snap:s_missing:0'] = JSON.stringify([makeTxn('t1')]);
    // chunk 1 is missing
    expect(await loadSnapshot(storage)).toBeNull();

    // Corrupted chunk
    storage.data['track:snap:s_missing:1'] = '{corrupt-json';
    expect(await loadSnapshot(storage)).toBeNull();
  });

  it('clears snapshot data completely', async () => {
    const storage = createInMemoryStorage();
    const snap: PersistedSnapshot = {
      version: 1,
      store: { byId: { t1: makeTxn('t1') }, tombstones: {} },
      syncToken: 'st_1',
      accounts: [],
      lastSyncedAt: 1000,
    };
    await saveSnapshot(snap, storage);
    expect(await loadSnapshot(storage)).not.toBeNull();

    await clearSnapshot(storage);
    expect(await loadSnapshot(storage)).toBeNull();
    expect(Object.keys(storage.data).filter((k) => k.startsWith('track:snap:'))).toHaveLength(0);
  });
});
