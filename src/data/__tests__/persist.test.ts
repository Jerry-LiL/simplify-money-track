import { defaultStorage, loadSnapshot, saveSnapshot, STORAGE_KEY, StorageAdapter } from '../persist';
import { PersistedSnapshot } from '../types';

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
  };
}

describe('persist', () => {
  it('saves and loads a valid snapshot', async () => {
    const storage = createInMemoryStorage();
    const snapshot: PersistedSnapshot = {
      version: 1,
      store: {
        byId: {
          t1: {
            id: 't1',
            accountId: 'acc_4821',
            occurredAt: 1760000000000,
            direction: 'debit',
            amountMinor: 5000,
            currency: 'INR',
            inrMinor: 5000,
            merchant: 'Test',
            category: 'FOOD',
            status: 'POSTED',
            updatedAt: 0,
            ownTransfer: false,
            counterpartyAccountId: null,
            raw: {},
          },
        },
        tombstones: { t_old: 1750000000000 },
      },
      syncToken: 'st_saved',
      accounts: [
        { id: 'acc_4821', bank: 'HDFC', type: 'SAVINGS', last4: '4821', nickname: 'HDFC' },
      ],
      lastSyncedAt: 1760100000000,
    };

    await saveSnapshot(snapshot, storage);
    const loaded = await loadSnapshot(storage);

    expect(loaded).toEqual(snapshot);
  });

  it('works with defaultStorage (AsyncStorage)', async () => {
    const snapshot: PersistedSnapshot = {
      version: 1,
      store: { byId: {}, tombstones: {} },
      syncToken: 'st_default',
      accounts: [],
      lastSyncedAt: 123456,
    };

    await saveSnapshot(snapshot, defaultStorage);
    const loaded = await loadSnapshot(defaultStorage);

    expect(loaded).toEqual(snapshot);
  });

  it('returns null on version mismatch', async () => {
    const storage = createInMemoryStorage();
    const futureSnapshot = {
      version: 999,
      store: { byId: {}, tombstones: {} },
      syncToken: 'st_future',
      accounts: [],
      lastSyncedAt: Date.now(),
    };

    await storage.setItem(STORAGE_KEY, JSON.stringify(futureSnapshot));
    const loaded = await loadSnapshot(storage);

    expect(loaded).toBeNull();
  });

  it('returns null on corrupted data or missing fields', async () => {
    const storage = createInMemoryStorage();

    await storage.setItem(STORAGE_KEY, '{ invalid_json ');
    expect(await loadSnapshot(storage)).toBeNull();

    await storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, missingStore: true }));
    expect(await loadSnapshot(storage)).toBeNull();
  });

  it('returns null when no snapshot is saved', async () => {
    const storage = createInMemoryStorage();
    expect(await loadSnapshot(storage)).toBeNull();
  });
});
