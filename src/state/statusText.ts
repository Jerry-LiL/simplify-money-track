import { formatISTDate } from '../data/dates';
import { SyncProgress } from '../data/types';

export interface StatusTextParams {
  status: 'idle' | 'syncing' | 'error' | 'offline';
  lastSyncedAt: number | null;
  progress?: SyncProgress | null;
  lastError?: Error | string | null;
  now?: number;
}

export function formatTimeAgo(ms: number, now: number): string {
  const diffMs = Math.max(0, now - ms);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);

  if (diffMin < 1) {
    return 'Updated just now';
  }
  if (diffMin === 1) {
    return 'Updated 1 min ago';
  }
  if (diffMin < 60) {
    return `Updated ${diffMin} min ago`;
  }
  if (diffHours === 1) {
    return 'Updated 1 hour ago';
  }
  if (diffHours < 24) {
    return `Updated ${diffHours} hours ago`;
  }
  return `Updated on ${formatISTDate(ms)}`;
}

export function buildStatusText(params: StatusTextParams): string {
  const { status, lastSyncedAt, progress, lastError } = params;
  const now = params.now ?? Date.now();

  if (status === 'offline') {
    if (lastSyncedAt) {
      return `Offline - showing data from ${formatISTDate(lastSyncedAt)}`;
    }
    return 'Offline - no saved data';
  }

  if (status === 'syncing') {
    if (progress && progress.recordsLoaded > 0) {
      return `Syncing… ${progress.recordsLoaded.toLocaleString()} loaded`;
    }
    return 'Syncing…';
  }

  if (status === 'error') {
    const errorMsg =
      typeof lastError === 'string'
        ? lastError
        : lastError?.message || 'server error';
    const cleanError = errorMsg.replace(/^Error:\s*/i, '');
    if (lastSyncedAt) {
      return `Couldn't refresh: ${cleanError}. Showing saved data. Retry`;
    }
    return `Couldn't refresh: ${cleanError}. Retry`;
  }

  if (lastSyncedAt) {
    return formatTimeAgo(lastSyncedAt, now);
  }

  return 'Not synced yet';
}
