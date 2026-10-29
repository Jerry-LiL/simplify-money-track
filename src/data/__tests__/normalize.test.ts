import { Account } from '../types';
import { normalizeTxn } from '../normalize';

describe('normalizeTxn', () => {
  const accounts: Account[] = [
    { id: 'acc_4821', bank: 'HDFC Bank', type: 'SAVINGS', last4: '4821', nickname: 'HDFC Savings' },
    { id: 'acc_9075', bank: 'ICICI Bank', type: 'SAVINGS', last4: '9075', nickname: 'ICICI Savings' },
    { id: 'acc_3310', bank: 'HDFC Bank', type: 'CREDIT_CARD', last4: '3310', nickname: 'HDFC Millennia' },
  ];

  it('normalizes current shape records', () => {
    const raw = {
      id: 'txn_9B61C2E0',
      account_id: 'acc_4821',
      occurred_at: '2026-10-09T13:42:00Z',
      direction: 'debit',
      amount_minor: 34900,
      currency: 'INR',
      merchant: 'SWIGGY*BANGALORE',
      category: 'FOOD',
      status: 'POSTED',
      updated_at: '2026-10-09T13:51:00Z',
    };

    const txn = normalizeTxn(raw, accounts);
    expect(txn).not.toBeNull();
    expect(txn).toEqual({
      id: 'txn_9B61C2E0',
      accountId: 'acc_4821',
      occurredAt: Date.parse('2026-10-09T13:42:00Z'),
      direction: 'debit',
      amountMinor: 34900,
      currency: 'INR',
      inrMinor: 34900,
      merchant: 'SWIGGY*BANGALORE',
      category: 'FOOD',
      status: 'POSTED',
      updatedAt: Date.parse('2026-10-09T13:51:00Z'),
      ownTransfer: false,
      counterpartyAccountId: null,
      raw,
    });
  });

  it('normalizes legacy shape records using accounts lookup and fallback', () => {
    const raw = {
      id: '115509',
      account: '4821',
      txn_time: 1774981380,
      amount: '516.49',
      type: 'DR',
      merchant_name: 'BLINKIT',
      category: 'GROCERIES',
      status: 'POSTED',
    };

    const txn = normalizeTxn(raw, accounts);
    expect(txn).not.toBeNull();
    expect(txn).toEqual({
      id: '115509',
      accountId: 'acc_4821',
      occurredAt: 1774981380000,
      direction: 'debit',
      amountMinor: 51649,
      currency: 'INR',
      inrMinor: 51649,
      merchant: 'BLINKIT',
      category: 'GROCERIES',
      status: 'POSTED',
      updatedAt: 0,
      ownTransfer: false,
      counterpartyAccountId: null,
      raw,
    });

    // Fallback when account last4 is not in accounts list
    const fallbackRaw = {
      ...raw,
      id: '115510',
      account: '9999',
    };
    const fallbackTxn = normalizeTxn(fallbackRaw, accounts);
    expect(fallbackTxn?.accountId).toBe('acc_9999');
  });

  it('handles foreign currency with fx rate', () => {
    const rawWithFx = {
      id: 'txn_usd_1',
      account_id: 'acc_3310',
      occurred_at: '2026-09-10T10:00:00Z',
      direction: 'debit',
      amount_minor: 1000,
      currency: 'USD',
      merchant: 'GITHUB',
      category: 'TECH',
      status: 'POSTED',
      fx: { inr_minor: 86661 },
    };

    const txn = normalizeTxn(rawWithFx, accounts);
    expect(txn).not.toBeNull();
    expect(txn?.amountMinor).toBe(1000);
    expect(txn?.currency).toBe('USD');
    expect(txn?.inrMinor).toBe(86661);
  });

  it('handles foreign currency without fx rate as null inrMinor', () => {
    const rawNoFx = {
      id: 'txn_usd_2',
      account_id: 'acc_3310',
      occurred_at: '2026-09-10T10:00:00Z',
      direction: 'debit',
      amount_minor: 1000,
      currency: 'EUR',
      merchant: 'OVERSEAS STORE',
      status: 'POSTED',
    };

    const txn = normalizeTxn(rawNoFx, accounts);
    expect(txn).not.toBeNull();
    expect(txn?.inrMinor).toBeNull();
  });

  it('detects own transfers via legacy linked_account', () => {
    const raw = {
      id: '132083',
      account: '3310',
      txn_time: 1773848160,
      amount: '21579.63',
      type: 'CR',
      merchant_name: 'PAYMENT RECEIVED',
      category: 'TRANSFER',
      status: 'POSTED',
      linked_account: '9075',
    };

    const txn = normalizeTxn(raw, accounts);
    expect(txn).not.toBeNull();
    expect(txn?.ownTransfer).toBe(true);
    expect(txn?.counterpartyAccountId).toBe('acc_9075');
  });

  it('detects own transfers via current counterparty', () => {
    const raw = {
      id: 'txn_transfer_1',
      account_id: 'acc_4821',
      occurred_at: '2026-10-03T04:42:00Z',
      direction: 'debit',
      amount_minor: 2500000,
      currency: 'INR',
      merchant: 'SELF TRANSFER TO XX9075',
      category: 'TRANSFER',
      status: 'POSTED',
      counterparty: {
        type: 'OWN_ACCOUNT',
        account_id: 'acc_9075',
      },
    };

    const txn = normalizeTxn(raw, accounts);
    expect(txn).not.toBeNull();
    expect(txn?.ownTransfer).toBe(true);
    expect(txn?.counterpartyAccountId).toBe('acc_9075');
  });

  it('rejects garbage and unparseable records', () => {
    expect(normalizeTxn(null, accounts)).toBeNull();
    expect(normalizeTxn({}, accounts)).toBeNull();
    expect(normalizeTxn({ id: '' }, accounts)).toBeNull();
    expect(normalizeTxn({ id: '1', account_id: 'acc_1', direction: 'debit', amount_minor: 'bad' }, accounts)).toBeNull();
    expect(normalizeTxn({ id: '1', account_id: 'acc_1', occurred_at: 'invalid-date', direction: 'debit', amount_minor: 100 }, accounts)).toBeNull();
    expect(normalizeTxn({ id: '1', account: '4821', txn_time: 'invalid', amount: '100', type: 'DR' }, accounts)).toBeNull();
    expect(normalizeTxn({ id: '1', account: '4821', txn_time: 12345, amount: 'bad-amount', type: 'DR' }, accounts)).toBeNull();
    expect(normalizeTxn({ id: '1', account: '4821', txn_time: 12345, amount: '100', type: 'UNKNOWN' }, accounts)).toBeNull();
  });
});
