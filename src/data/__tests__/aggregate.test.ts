import { buildListRows, buildMonths, searchTxns } from '../aggregate';
import { Txn, TxnStore } from '../types';

function createTxn(overrides: Partial<Txn> & { id: string }): Txn {
  return {
    accountId: 'acc_4821',
    occurredAt: 1760000000000,
    direction: 'debit',
    amountMinor: 1000,
    currency: 'INR',
    inrMinor: 1000,
    merchant: 'Merchant',
    category: 'GENERAL',
    status: 'POSTED',
    updatedAt: 0,
    ownTransfer: false,
    counterpartyAccountId: null,
    raw: {},
    ...overrides,
  };
}

describe('aggregate', () => {
  describe('buildMonths', () => {
    it('excludes own transfers from both spend and income', () => {
      const store: TxnStore = {
        byId: {
          t1: createTxn({ id: 't1', direction: 'debit', inrMinor: 5000, ownTransfer: false }),
          t2: createTxn({ id: 't2', direction: 'debit', inrMinor: 25000, ownTransfer: true }),
          t3: createTxn({ id: 't3', direction: 'credit', inrMinor: 10000, ownTransfer: false }),
          t4: createTxn({ id: 't4', direction: 'credit', inrMinor: 25000, ownTransfer: true }),
        },
        tombstones: {},
      };

      const months = buildMonths(store);
      expect(months.length).toBe(1);
      expect(months[0].spendMinor).toBe(5000);
      expect(months[0].incomeMinor).toBe(10000);
      expect(months[0].count).toBe(4);
    });

    it('counts refunds as income', () => {
      const store: TxnStore = {
        byId: {
          t1: createTxn({ id: 't1', direction: 'credit', inrMinor: 4500, category: 'REFUND' }),
        },
        tombstones: {},
      };

      const months = buildMonths(store);
      expect(months[0].incomeMinor).toBe(4500);
      expect(months[0].spendMinor).toBe(0);
    });

    it('counts TRANSFERS_OUT to others as spend', () => {
      const store: TxnStore = {
        byId: {
          t1: createTxn({
            id: 't1',
            direction: 'debit',
            inrMinor: 3000,
            category: 'TRANSFERS_OUT',
            ownTransfer: false,
          }),
        },
        tombstones: {},
      };

      const months = buildMonths(store);
      expect(months[0].spendMinor).toBe(3000);
    });

    it('buckets transactions into calendar months in IST', () => {
      // 2026-03-31T18:40:00Z is 00:10 on 2026-04-01 in IST
      const aprilIst = Date.parse('2026-03-31T18:40:00Z');
      // 2026-03-31T18:00:00Z is 23:30 on 2026-03-31 in IST
      const marchIst = Date.parse('2026-03-31T18:00:00Z');

      const store: TxnStore = {
        byId: {
          t1: createTxn({ id: 't1', occurredAt: aprilIst, inrMinor: 1000 }),
          t2: createTxn({ id: 't2', occurredAt: marchIst, inrMinor: 2000 }),
        },
        tombstones: {},
      };

      const months = buildMonths(store);
      expect(months.length).toBe(2);
      expect(months[0].key).toBe('2026-04');
      expect(months[0].label).toBe('April 2026');
      expect(months[0].spendMinor).toBe(1000);

      expect(months[1].key).toBe('2026-03');
      expect(months[1].label).toBe('March 2026');
      expect(months[1].spendMinor).toBe(2000);
    });

    it('flags pending transactions and includes them in totals', () => {
      const store: TxnStore = {
        byId: {
          t1: createTxn({ id: 't1', status: 'PENDING', direction: 'debit', inrMinor: 1500 }),
          t2: createTxn({ id: 't2', status: 'POSTED', direction: 'debit', inrMinor: 2000 }),
        },
        tombstones: {},
      };

      const months = buildMonths(store);
      expect(months[0].spendMinor).toBe(3500);
      expect(months[0].pendingCount).toBe(1);
      expect(months[0].count).toBe(2);
    });

    it('counts unconverted foreign transactions and excludes them from totals', () => {
      const store: TxnStore = {
        byId: {
          t1: createTxn({ id: 't1', currency: 'EUR', inrMinor: null, amountMinor: 2000 }),
          t2: createTxn({ id: 't2', currency: 'INR', inrMinor: 3000, amountMinor: 3000 }),
        },
        tombstones: {},
      };

      const months = buildMonths(store);
      expect(months[0].spendMinor).toBe(3000);
      expect(months[0].unconvertedCount).toBe(1);
      expect(months[0].count).toBe(2);
    });

    it('sorts transactions within a month newest-first with stable id tie-break', () => {
      const store: TxnStore = {
        byId: {
          t1: createTxn({ id: 'b_id', occurredAt: 1000 }),
          t2: createTxn({ id: 'a_id', occurredAt: 2000 }),
          t3: createTxn({ id: 'c_id', occurredAt: 2000 }),
        },
        tombstones: {},
      };

      const months = buildMonths(store);
      expect(months[0].txns.map((t) => t.id)).toEqual(['c_id', 'a_id', 'b_id']);
    });
  });

  describe('buildListRows', () => {
    it('produces a flat array of header and txn rows with stable keys', () => {
      const store: TxnStore = {
        byId: {
          t1: createTxn({ id: 't1', occurredAt: 1760000000000 }),
        },
        tombstones: {},
      };

      const months = buildMonths(store);
      const rows = buildListRows(months);

      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({
        type: 'header',
        key: `header_${months[0].key}`,
        id: `header_${months[0].key}`,
        month: months[0],
      });
      expect(rows[1]).toEqual({
        type: 'txn',
        key: 'txn_t1',
        id: 'txn_t1',
        txn: months[0].txns[0],
      });
    });
  });

  describe('searchTxns', () => {
    const store: TxnStore = {
      byId: {
        t1: createTxn({
          id: 't1',
          occurredAt: 2000,
          merchant: '☕ Third Wave Coffee',
          category: 'DINING_OUT',
          amountMinor: 47039,
        }),
        t2: createTxn({
          id: 't2',
          occurredAt: 1500,
          merchant: 'राम किराना स्टोर',
          category: 'GROCERIES',
          amountMinor: 35000,
        }),
        t3: createTxn({
          id: 't3',
          occurredAt: 1000,
          merchant: 'Café de Flore',
          category: 'COFFEE',
          amountMinor: 8900,
        }),
      },
      tombstones: {},
    };

    it('searches by emoji and case-insensitive merchant name', () => {
      expect(searchTxns(store, 'coffee').map((t) => t.id)).toEqual(['t1', 't3']);
      expect(searchTxns(store, '☕').map((t) => t.id)).toEqual(['t1']);
      expect(searchTxns(store, 'third wave').map((t) => t.id)).toEqual(['t1']);
    });

    it('searches Devanagari text correctly', () => {
      expect(searchTxns(store, 'राम').map((t) => t.id)).toEqual(['t2']);
      expect(searchTxns(store, 'किराना').map((t) => t.id)).toEqual(['t2']);
    });

    it('strips Latin diacritics using NFKD', () => {
      expect(searchTxns(store, 'cafe').map((t) => t.id)).toEqual(['t3']);
      expect(searchTxns(store, 'café').map((t) => t.id)).toEqual(['t3']);
    });

    it('searches by category', () => {
      expect(searchTxns(store, 'groceries').map((t) => t.id)).toEqual(['t2']);
      expect(searchTxns(store, 'dining').map((t) => t.id)).toEqual(['t1']);
    });

    it('searches by amount text', () => {
      expect(searchTxns(store, '470.39').map((t) => t.id)).toEqual(['t1']);
      expect(searchTxns(store, '470').map((t) => t.id)).toEqual(['t1']);
      expect(searchTxns(store, '89').map((t) => t.id)).toEqual(['t3']);
    });

    it('returns empty array for empty or whitespace query', () => {
      expect(searchTxns(store, '')).toEqual([]);
      expect(searchTxns(store, '   ')).toEqual([]);
    });
  });
});
