import { ListRow, MonthGroup, Txn, TxnStore } from './types';
import { monthKey, monthLabel } from './dates';
import { formatForeign, formatINR } from './money';

export function buildMonths(store: TxnStore): MonthGroup[] {
  const groups: Record<string, {
    key: string;
    label: string;
    spendMinor: number;
    incomeMinor: number;
    count: number;
    pendingCount: number;
    unconvertedCount: number;
    txns: Txn[];
  }> = {};

  for (const txn of Object.values(store.byId)) {
    const key = monthKey(txn.occurredAt);
    if (!groups[key]) {
      groups[key] = {
        key,
        label: monthLabel(key),
        spendMinor: 0,
        incomeMinor: 0,
        count: 0,
        pendingCount: 0,
        unconvertedCount: 0,
        txns: [],
      };
    }

    const g = groups[key];
    g.count++;
    g.txns.push(txn);

    if (txn.status === 'PENDING') {
      g.pendingCount++;
    }

    if (txn.inrMinor === null) {
      g.unconvertedCount++;
    }

    // Own-account transfers and unconvertible foreign txns are excluded from spend/income totals
    if (txn.ownTransfer || txn.inrMinor === null) {
      continue;
    }

    if (txn.direction === 'debit') {
      g.spendMinor += txn.inrMinor;
    } else if (txn.direction === 'credit') {
      g.incomeMinor += txn.inrMinor;
    }
  }

  const result = Object.values(groups);

  for (const group of result) {
    group.txns.sort((a, b) => {
      if (b.occurredAt !== a.occurredAt) {
        return b.occurredAt - a.occurredAt;
      }
      return b.id.localeCompare(a.id);
    });
  }

  result.sort((a, b) => b.key.localeCompare(a.key));

  return result;
}

export function buildListRows(months: MonthGroup[]): ListRow[] {
  const rows: ListRow[] = [];
  for (const month of months) {
    rows.push({
      type: 'header',
      key: `header_${month.key}`,
      id: `header_${month.key}`,
      month,
    });
    for (const txn of month.txns) {
      rows.push({
        type: 'txn',
        key: `txn_${txn.id}`,
        id: `txn_${txn.id}`,
        txn,
      });
    }
  }
  return rows;
}

function normalizeSearchText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\ufe0f/g, '')
    .toLowerCase();
}

export function searchTxns(store: TxnStore, query: string): Txn[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const q = normalizeSearchText(trimmed);

  const digitMatches = trimmed.match(/\d/g);
  const digitCount = digitMatches ? digitMatches.length : 0;
  const cleanNumeric = trimmed
    .replace(/^[+-]?\s*₹?\s*/, '')
    .replace(/^(rs|inr)\.?\s*/i, '')
    .trim();
  const looksNumeric = /^\d[\d,]*(\.\d+)?$/.test(cleanNumeric) && digitCount >= 2;
  const queryNumberClean = cleanNumeric.replace(/,/g, '');

  const matched: Txn[] = [];

  for (const txn of Object.values(store.byId)) {
    const merchantNorm = normalizeSearchText(txn.merchant);
    if (merchantNorm.includes(q)) {
      matched.push(txn);
      continue;
    }

    if (txn.category) {
      const catNorm = normalizeSearchText(txn.category);
      if (catNorm.includes(q)) {
        matched.push(txn);
        continue;
      }
    }

    if (looksNumeric && txn.inrMinor !== null) {
      const absInrMinor = Math.abs(txn.inrMinor);
      const rupees = Math.floor(absInrMinor / 100);
      const paise = absInrMinor % 100;
      const rupeeStr = String(rupees);
      const fullDecimal = `${rupeeStr}.${String(paise).padStart(2, '0')}`;

      if (queryNumberClean.includes('.')) {
        if (fullDecimal === queryNumberClean || fullDecimal.startsWith(queryNumberClean)) {
          matched.push(txn);
          continue;
        }
      } else {
        if (rupeeStr === queryNumberClean) {
          matched.push(txn);
          continue;
        }
      }
    }
  }

  matched.sort((a, b) => {
    if (b.occurredAt !== a.occurredAt) {
      return b.occurredAt - a.occurredAt;
    }
    return b.id.localeCompare(a.id);
  });

  return matched;
}
