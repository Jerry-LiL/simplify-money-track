import { buildTxnAccessibilityLabel } from '../accessibility';
import { Account, Txn } from '../../data/types';

describe('buildTxnAccessibilityLabel', () => {
  const accounts: Account[] = [
    { id: 'acc_4821', bank: 'HDFC Bank', type: 'SAVINGS', last4: '4821', nickname: 'HDFC Savings' },
  ];

  it('formats standard debit transaction correctly', () => {
    // 2026-10-09T13:42:00Z is 19:12 IST on 9 October 2026
    const txn: Txn = {
      id: 't1',
      accountId: 'acc_4821',
      occurredAt: Date.parse('2026-10-09T13:42:00Z'),
      direction: 'debit',
      amountMinor: 34900,
      currency: 'INR',
      inrMinor: 34900,
      merchant: 'Swiggy',
      category: 'FOOD',
      status: 'POSTED',
      updatedAt: 0,
      ownTransfer: false,
      counterpartyAccountId: null,
      raw: {},
    };

    expect(buildTxnAccessibilityLabel(txn, accounts)).toBe(
      'Swiggy, debit 349 rupees, 9 October 2026, HDFC Savings'
    );
  });

  it('includes pending tag and paise when present', () => {
    const txn: Txn = {
      id: 't2',
      accountId: 'acc_4821',
      occurredAt: Date.parse('2026-10-09T13:42:00Z'),
      direction: 'debit',
      amountMinor: 34950,
      currency: 'INR',
      inrMinor: 34950,
      merchant: 'Swiggy',
      category: 'FOOD',
      status: 'PENDING',
      updatedAt: 0,
      ownTransfer: false,
      counterpartyAccountId: null,
      raw: {},
    };

    expect(buildTxnAccessibilityLabel(txn, accounts)).toBe(
      'Swiggy, debit 349 rupees 50 paise, 9 October 2026, HDFC Savings, pending'
    );
  });

  it('formats self transfer correctly', () => {
    const txn: Txn = {
      id: 't3',
      accountId: 'acc_4821',
      occurredAt: Date.parse('2026-10-09T13:42:00Z'),
      direction: 'debit',
      amountMinor: 2500000,
      currency: 'INR',
      inrMinor: 2500000,
      merchant: 'Self Transfer',
      category: 'TRANSFER',
      status: 'POSTED',
      updatedAt: 0,
      ownTransfer: true,
      counterpartyAccountId: 'acc_9075',
      raw: {},
    };

    expect(buildTxnAccessibilityLabel(txn, accounts)).toBe(
      'Self Transfer, self transfer of 25000 rupees, 9 October 2026, HDFC Savings'
    );
  });
});
