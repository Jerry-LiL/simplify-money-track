export interface Txn {
  id: string;
  accountId: string;
  occurredAt: number;
  direction: 'debit' | 'credit';
  amountMinor: number;
  currency: string;
  inrMinor: number | null;
  merchant: string;
  category: string | null;
  status: 'POSTED' | 'PENDING' | string;
  updatedAt: number;
  ownTransfer: boolean;
  counterpartyAccountId: string | null;
  raw: unknown;
}

export interface Account {
  id: string;
  bank: string;
  type: string;
  last4: string;
  nickname: string;
}

export interface TxnStore {
  byId: Record<string, Txn>;
  tombstones: Record<string, number>;
}

export interface RawCurrentTxn {
  id: string;
  account_id: string;
  occurred_at: string;
  direction: 'debit' | 'credit';
  amount_minor: number;
  currency?: string;
  merchant?: string;
  category?: string | null;
  status?: 'POSTED' | 'PENDING' | string;
  updated_at?: string;
  fx?: {
    inr_minor?: number;
  };
  counterparty?: {
    type: string;
    account_id?: string;
  };
}

export interface RawLegacyTxn {
  id: string;
  account: string;
  txn_time: number;
  amount: string;
  type: 'DR' | 'CR' | string;
  merchant_name?: string;
  category?: string | null;
  status?: string;
  linked_account?: string;
}

export interface RawChangeDeletion {
  id: string;
  deleted: true;
  updated_at: string;
}

export interface TransactionsPageResponse {
  items: unknown[];
  next_cursor: string | null;
  sync_token: string;
}

export interface ChangesPageResponse {
  items: unknown[];
  next_cursor: string | null;
  sync_token: string;
}

export interface AccountsResponse {
  items: Account[];
}

export interface SyncProgress {
  pagesLoaded: number;
  recordsLoaded: number;
}

export interface SyncState {
  status: 'idle' | 'syncing' | 'error';
  lastSyncedAt: number | null;
  error: Error | null;
}

export interface MonthGroup {
  key: string;
  label: string;
  spendMinor: number;
  incomeMinor: number;
  count: number;
  pendingCount: number;
  unconvertedCount: number;
  txns: Txn[];
}

export type ListRow =
  | { type: 'header'; key: string; id: string; month: MonthGroup }
  | { type: 'txn'; key: string; id: string; txn: Txn };

export interface PersistedSnapshot {
  version: number;
  store: TxnStore;
  syncToken: string | null;
  accounts: Account[];
  lastSyncedAt: number;
}
