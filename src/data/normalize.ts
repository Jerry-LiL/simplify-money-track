import { Account, Txn } from './types';
import { parseDecimalToMinor } from './money';

export function parseDateMs(raw: unknown): number | null {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return null;
    }
    return raw > 1e12 ? Math.round(raw) : Math.round(raw * 1000);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d+(\.\d+)?$/.test(trimmed)) {
      const num = Number(trimmed);
      if (!Number.isFinite(num)) {
        return null;
      }
      return num > 1e12 ? Math.round(num) : Math.round(num * 1000);
    }
    const ms = Date.parse(trimmed);
    if (Number.isNaN(ms)) {
      return null;
    }
    return ms;
  }
  return null;
}

export function buildAccountMap(
  accounts?: Account[] | Map<string, string> | Record<string, string>
): Map<string, string> {
  if (!accounts) {
    return new Map();
  }
  if (accounts instanceof Map) {
    return accounts;
  }
  const map = new Map<string, string>();
  if (Array.isArray(accounts)) {
    for (const acc of accounts) {
      if (acc && acc.last4 !== undefined && acc.last4 !== null && acc.id) {
        map.set(String(acc.last4), acc.id);
      }
    }
  } else if (typeof accounts === 'object') {
    for (const [k, v] of Object.entries(accounts)) {
      if (typeof v === 'string') {
        map.set(String(k), v);
      }
    }
  }
  return map;
}

export function normalizeTxn(
  raw: unknown,
  accounts?: Account[] | Map<string, string> | Record<string, string>
): Txn | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const rec = raw as Record<string, any>;
  if (rec.id === null || rec.id === undefined) {
    return null;
  }
  const id = String(rec.id).trim();
  if (!id) {
    return null;
  }

  const accountMap = buildAccountMap(accounts);

  let accountId: string;
  let occurredAt: number | null = null;
  let direction: 'debit' | 'credit' | null = null;
  let amountMinor: number | null = null;
  let currency = 'INR';
  let inrMinor: number | null = null;
  let merchant = '';
  let category: string | null = null;
  let status = 'POSTED';
  let updatedAt = 0;
  let ownTransfer = false;
  let counterpartyAccountId: string | null = null;

  if ('occurred_at' in rec) {
    if (typeof rec.account_id !== 'string' || !rec.account_id.trim()) {
      return null;
    }
    accountId = rec.account_id;
    occurredAt = parseDateMs(rec.occurred_at);

    if (rec.direction === 'debit' || rec.direction === 'credit') {
      direction = rec.direction;
    } else {
      return null;
    }

    if (typeof rec.amount_minor !== 'number' || !Number.isInteger(rec.amount_minor)) {
      return null;
    }
    amountMinor = rec.amount_minor;

    if (typeof rec.currency === 'string' && rec.currency.trim()) {
      currency = rec.currency.trim().toUpperCase();
    }

    if (currency === 'INR') {
      inrMinor = amountMinor;
    } else if (rec.fx && typeof rec.fx.inr_minor === 'number' && Number.isInteger(rec.fx.inr_minor)) {
      inrMinor = rec.fx.inr_minor;
    } else {
      inrMinor = null;
    }

    merchant = typeof rec.merchant === 'string' ? rec.merchant : '';
    category = typeof rec.category === 'string' ? rec.category : null;
    status = typeof rec.status === 'string' ? rec.status : 'POSTED';

    if (rec.updated_at) {
      const u = parseDateMs(rec.updated_at);
      if (u !== null) {
        updatedAt = u;
      }
    }

    if (rec.counterparty && rec.counterparty.type === 'OWN_ACCOUNT') {
      ownTransfer = true;
      counterpartyAccountId =
        typeof rec.counterparty.account_id === 'string' ? rec.counterparty.account_id : null;
    }
  } else if ('txn_time' in rec) {
    let rawAccount = '';
    if (typeof rec.account === 'string') {
      rawAccount = rec.account.trim();
    } else if (typeof rec.account === 'number') {
      rawAccount = String(rec.account);
    }
    if (!rawAccount) {
      return null;
    }
    accountId = accountMap.get(rawAccount) || `acc_${rawAccount}`;
    occurredAt = parseDateMs(rec.txn_time);

    if (rec.type === 'DR') {
      direction = 'debit';
    } else if (rec.type === 'CR') {
      direction = 'credit';
    } else {
      return null;
    }

    amountMinor = parseDecimalToMinor(rec.amount);
    if (amountMinor === null) {
      return null;
    }

    currency = 'INR';
    inrMinor = amountMinor;
    merchant = typeof rec.merchant_name === 'string' ? rec.merchant_name : '';
    category = typeof rec.category === 'string' ? rec.category : null;
    status = typeof rec.status === 'string' ? rec.status : 'POSTED';
    updatedAt = 0;

    if (rec.linked_account !== undefined && rec.linked_account !== null) {
      let rawLinked = '';
      if (typeof rec.linked_account === 'string') {
        rawLinked = rec.linked_account.trim();
      } else if (typeof rec.linked_account === 'number') {
        rawLinked = String(rec.linked_account);
      }
      if (rawLinked) {
        ownTransfer = true;
        counterpartyAccountId = accountMap.get(rawLinked) || `acc_${rawLinked}`;
      }
    }
  } else {
    return null;
  }

  if (occurredAt === null || direction === null || amountMinor === null) {
    return null;
  }

  return {
    id,
    accountId,
    occurredAt,
    direction,
    amountMinor,
    currency,
    inrMinor,
    merchant,
    category,
    status,
    updatedAt,
    ownTransfer,
    counterpartyAccountId,
    raw,
  };
}
