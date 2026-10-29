import { Txn } from '../types';
import { applyChangesPage, applyDeletion, applyRecords, createEmptyStore } from '../store';

function createMockTxn(overrides: Partial<Txn> & { id: string }): Txn {
  return {
    accountId: 'acc_4821',
    occurredAt: 1760000000000,
    direction: 'debit',
    amountMinor: 5000,
    currency: 'INR',
    inrMinor: 5000,
    merchant: 'Test Merchant',
    category: 'FOOD',
    status: 'POSTED',
    updatedAt: 0,
    ownTransfer: false,
    counterpartyAccountId: null,
    raw: {},
    ...overrides,
  };
}

describe('store', () => {
  it('deduplicates boundary duplicates with same id', () => {
    let store = createEmptyStore();
    const txn1 = createMockTxn({ id: 'txn_1', amountMinor: 1000 });
    const txn2 = createMockTxn({ id: 'txn_2', amountMinor: 2000 });

    // Page 1 ends with txn_2
    store = applyRecords(store, [txn1, txn2]);
    expect(Object.keys(store.byId).length).toBe(2);

    // Page 2 starts with txn_2 (boundary re-send) and txn_3
    const txn3 = createMockTxn({ id: 'txn_3', amountMinor: 3000 });
    store = applyRecords(store, [txn2, txn3]);

    expect(Object.keys(store.byId).length).toBe(3);
    expect(store.byId['txn_2'].amountMinor).toBe(2000);
  });

  it('ignores stale updates (txn_DAFC2853 case: newer change amount 8900 then stale 3900)', () => {
    let store = createEmptyStore();

    // Initial / earlier change record with newer updatedAt
    const newerChange = createMockTxn({
      id: 'txn_DAFC2853',
      amountMinor: 8900,
      inrMinor: 8900,
      status: 'POSTED',
      updatedAt: Date.parse('2026-10-10T19:53:33Z'),
    });

    store = applyRecords(store, [newerChange]);
    expect(store.byId['txn_DAFC2853'].amountMinor).toBe(8900);

    // Stale change record with older updatedAt
    const staleChange = createMockTxn({
      id: 'txn_DAFC2853',
      amountMinor: 3900,
      inrMinor: 3900,
      status: 'PENDING',
      updatedAt: Date.parse('2026-10-10T19:23:33Z'), // 30 minutes earlier
    });

    store = applyRecords(store, [staleChange]);
    expect(store.byId['txn_DAFC2853'].amountMinor).toBe(8900);
    expect(store.byId['txn_DAFC2853'].status).toBe('POSTED');
  });

  it('removes records on deletion and sets tombstone', () => {
    let store = createEmptyStore();
    const txn = createMockTxn({
      id: 'txn_del_1',
      updatedAt: Date.parse('2026-10-09T10:00:00Z'),
    });

    store = applyRecords(store, [txn]);
    expect(store.byId['txn_del_1']).toBeDefined();

    const deletionTime = Date.parse('2026-10-10T12:00:00Z');
    store = applyDeletion(store, 'txn_del_1', deletionTime);

    expect(store.byId['txn_del_1']).toBeUndefined();
    expect(store.tombstones['txn_del_1']).toBe(deletionTime);
  });

  it('ignores stale re-add after deletion', () => {
    let store = createEmptyStore();
    const deletionTime = Date.parse('2026-10-10T12:00:00Z');
    store = applyDeletion(store, 'txn_del_2', deletionTime);

    // Re-send of old record with updatedAt older than tombstone
    const oldTxn = createMockTxn({
      id: 'txn_del_2',
      updatedAt: Date.parse('2026-10-10T10:00:00Z'),
    });

    store = applyRecords(store, [oldTxn]);
    expect(store.byId['txn_del_2']).toBeUndefined();
    expect(store.tombstones['txn_del_2']).toBe(deletionTime);

    // Legacy record with updatedAt 0 is also ignored by tombstone
    const legacyTxn = createMockTxn({
      id: 'txn_del_2',
      updatedAt: 0,
    });

    store = applyRecords(store, [legacyTxn]);
    expect(store.byId['txn_del_2']).toBeUndefined();
  });

  it('ignores stale deletion older than stored record', () => {
    let store = createEmptyStore();
    const txn = createMockTxn({
      id: 'txn_del_3',
      updatedAt: Date.parse('2026-10-10T15:00:00Z'),
    });

    store = applyRecords(store, [txn]);

    // Deletion older than stored record
    store = applyDeletion(store, 'txn_del_3', Date.parse('2026-10-10T14:00:00Z'));
    expect(store.byId['txn_del_3']).toBeDefined();
  });

  it('replaces legacy record with current-shape record having same id', () => {
    let store = createEmptyStore();

    // Legacy record has updatedAt 0
    const legacyTxn = createMockTxn({
      id: '104535',
      amountMinor: 45000,
      merchant: 'Old Third Wave',
      updatedAt: 0,
    });

    store = applyRecords(store, [legacyTxn]);
    expect(store.byId['104535'].merchant).toBe('Old Third Wave');

    // Current shape re-send of same id with updatedAt > 0
    const currentTxn = createMockTxn({
      id: '104535',
      amountMinor: 47039,
      merchant: '☕ Third Wave Coffee',
      updatedAt: Date.parse('2026-10-10T21:19:49Z'),
    });

    store = applyRecords(store, [currentTxn]);
    expect(store.byId['104535'].amountMinor).toBe(47039);
    expect(store.byId['104535'].merchant).toBe('☕ Third Wave Coffee');
    expect(store.byId['104535'].updatedAt).toBe(Date.parse('2026-10-10T21:19:49Z'));
  });

  it('processes raw changes page through applyChangesPage', () => {
    let store = createEmptyStore();

    const changes = [
      {
        id: 'txn_chg_1',
        account_id: 'acc_4821',
        occurred_at: '2026-10-09T10:00:00Z',
        direction: 'debit',
        amount_minor: 1500,
        currency: 'INR',
        merchant: 'CAFE',
        status: 'POSTED',
        updated_at: '2026-10-10T10:00:00Z',
      },
      {
        id: 'txn_chg_1',
        deleted: true,
        updated_at: '2026-10-10T12:00:00Z',
      },
      {
        id: 'bad_record',
      },
    ];

    const result = applyChangesPage(store, changes);
    expect(result.appliedCount).toBe(2);
    expect(result.unreadableCount).toBe(1);
    expect(result.store.byId['txn_chg_1']).toBeUndefined();
    expect(result.store.tombstones['txn_chg_1']).toBe(Date.parse('2026-10-10T12:00:00Z'));
  });
});
