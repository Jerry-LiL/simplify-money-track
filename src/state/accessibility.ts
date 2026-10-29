import { Account, Txn } from '../data/types';
import { getISTDate } from '../data/dates';

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function buildTxnAccessibilityLabel(txn: Txn, accounts: Account[]): string {
  const merchant = txn.merchant || 'Unknown merchant';

  // Account
  const account = accounts.find((a) => a.id === txn.accountId);
  const accountName = account ? account.nickname : txn.accountId;

  // Date
  const d = getISTDate(txn.occurredAt);
  const day = d.getUTCDate();
  const month = FULL_MONTHS[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  const dateStr = `${day} ${month} ${year}`;

  // Amount & direction
  let amountDesc = '';
  if (txn.inrMinor !== null) {
    const rupees = Math.floor(Math.abs(txn.inrMinor) / 100);
    const paise = Math.abs(txn.inrMinor) % 100;
    const amountPart = paise > 0 ? `${rupees} rupees ${paise} paise` : `${rupees} rupees`;

    if (txn.ownTransfer) {
      amountDesc = `self transfer of ${amountPart}`;
    } else {
      amountDesc = `${txn.direction} ${amountPart}`;
    }
  } else {
    // Foreign without fx
    const whole = Math.floor(Math.abs(txn.amountMinor) / 100);
    if (txn.ownTransfer) {
      amountDesc = `self transfer of ${whole} ${txn.currency}`;
    } else {
      amountDesc = `${txn.direction} ${whole} ${txn.currency}`;
    }
  }

  const parts = [merchant, amountDesc, dateStr, accountName];

  if (txn.status === 'PENDING') {
    parts.push('pending');
  }

  return parts.join(', ');
}
