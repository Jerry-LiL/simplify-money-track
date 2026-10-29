import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  Account,
  buildListRows,
  buildMonths,
  clearSnapshot,
  createApi,
  createEmptyStore,
  ListRow,
  loadSnapshot,
  MonthGroup,
  saveSnapshot,
  syncAll,
  SyncProgress,
  TxnStore,
} from '../data';
import { DEFAULT_API_URL, getPersistedApiUrl, setPersistedApiUrl } from '../config';

export type TrackStatus = 'idle' | 'syncing' | 'error' | 'offline';

export interface TrackContextValue {
  store: TxnStore;
  months: MonthGroup[];
  rows: ListRow[];
  accounts: Account[];
  status: TrackStatus;
  progress: SyncProgress | null;
  lastSyncedAt: number | null;
  lastError: Error | null;
  unreadable: number;
  apiUrl: string;
  syncToken: string | null;
  hasLoadedSnapshot: boolean;
  setApiUrl: (url: string) => Promise<void>;
  sync: (opts?: { forceFull?: boolean; manual?: boolean }) => Promise<void>;
  clearData: () => Promise<void>;
}

const TrackContext = createContext<TrackContextValue | null>(null);

export function TrackProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<TxnStore>(() => createEmptyStore());
  const [syncToken, setSyncToken] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [unreadable, setUnreadable] = useState<number>(0);
  const [status, setStatus] = useState<TrackStatus>('idle');
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [lastError, setLastError] = useState<Error | null>(null);
  const [apiUrl, setApiUrlState] = useState<string>(DEFAULT_API_URL);
  const [hasLoadedSnapshot, setHasLoadedSnapshot] = useState(false);

  const isOfflineRef = useRef(false);
  const storeRef = useRef(store);
  storeRef.current = store;
  const syncTokenRef = useRef(syncToken);
  syncTokenRef.current = syncToken;
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const lastSyncedAtRef = useRef(lastSyncedAt);
  lastSyncedAtRef.current = lastSyncedAt;
  const apiUrlRef = useRef(apiUrl);
  apiUrlRef.current = apiUrl;
  const appStateRef = useRef<AppStateStatus>((AppState.currentState as AppStateStatus) || 'active');

  const months = useMemo(() => buildMonths(store), [store]);
  const rows = useMemo(() => buildListRows(months), [months]);

  const sync = useCallback(
    async (opts?: { forceFull?: boolean; manual?: boolean }): Promise<void> => {
      if (isOfflineRef.current && opts?.manual === false) {
        setStatus('offline');
        return;
      }

      const requestUrl = apiUrlRef.current;
      setStatus('syncing');
      setLastError(null);
      setProgress({ pagesLoaded: 0, recordsLoaded: 0 });

      try {
        const client = createApi(requestUrl);
        const isForcedFull = Boolean(opts?.forceFull);
        const key = `${requestUrl}:${isForcedFull}`;
        const result = await syncAll(
          {
            api: client,
            store: isForcedFull ? createEmptyStore() : storeRef.current,
            syncToken: isForcedFull ? null : syncTokenRef.current,
            accounts: accountsRef.current,
            onProgress: (p) => setProgress(p),
            forceFull: isForcedFull,
            key,
          },
          key
        );

        if (apiUrlRef.current !== requestUrl) {
          return;
        }

        setStore(result.store);
        setSyncToken(result.syncToken);
        setAccounts(result.accounts);
        setLastSyncedAt(result.lastSyncedAt);
        setUnreadable(result.unreadable);
        setStatus('idle');
        setProgress(null);
        setLastError(null);

        try {
          await saveSnapshot({
            store: result.store,
            syncToken: result.syncToken,
            accounts: result.accounts,
            lastSyncedAt: result.lastSyncedAt,
          });
        } catch (saveErr) {
          console.warn('Failed to save snapshot:', saveErr);
        }
      } catch (err: any) {
        if (apiUrlRef.current !== requestUrl) {
          return;
        }
        setStatus(isOfflineRef.current ? 'offline' : 'error');
        setLastError(err instanceof Error ? err : new Error(String(err)));
        setProgress(null);
      }
    },
    []
  );

  const syncRef = useRef(sync);
  syncRef.current = sync;

  const updateApiUrl = useCallback(
    async (newUrl: string): Promise<void> => {
      await setPersistedApiUrl(newUrl);
      setApiUrlState(newUrl);
      apiUrlRef.current = newUrl;
      await syncRef.current({ forceFull: true, manual: true });
    },
    []
  );

  const clearData = useCallback(async (): Promise<void> => {
    await clearSnapshot();
    setStore(createEmptyStore());
    setSyncToken(null);
    setAccounts([]);
    setLastSyncedAt(null);
    setUnreadable(0);
    setStatus('idle');
    setLastError(null);
    setProgress(null);
  }, []);

  // 1. Initial mount: load snapshot and persisted API URL, then sync
  useEffect(() => {
    let active = true;

    async function init() {
      const persistedUrl = await getPersistedApiUrl();
      if (!active) return;
      setApiUrlState(persistedUrl);
      apiUrlRef.current = persistedUrl;

      const snapshot = await loadSnapshot();
      if (!active) return;

      if (snapshot) {
        setStore(snapshot.store);
        setSyncToken(snapshot.syncToken);
        setAccounts(snapshot.accounts);
        setLastSyncedAt(snapshot.lastSyncedAt);
      }
      setHasLoadedSnapshot(true);

      // Perform background sync
      syncRef.current({ manual: false });
    }

    init();

    return () => {
      active = false;
    };
  }, []);

  // 2. NetInfo listener: track online/offline and sync on reconnect
  useEffect(() => {
    let wasOffline = false;

    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected = state.isConnected;
      const isOfflineNow = isConnected === false;

      isOfflineRef.current = isOfflineNow;

      if (isOfflineNow) {
        setStatus('offline');
        wasOffline = true;
      } else {
        if (wasOffline) {
          wasOffline = false;
          syncRef.current({ manual: false });
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 3. AppState listener: sync on foreground if last sync older than 60s
  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (
          appStateRef.current.match(/inactive|background/) &&
          nextAppState === 'active'
        ) {
          const ageMs = Date.now() - (lastSyncedAtRef.current || 0);
          if (ageMs > 60_000) {
            syncRef.current({ manual: false });
          }
        }
        appStateRef.current = nextAppState;
      }
    );

    return () => {
      subscription.remove();
    };
  }, []);

  const value = useMemo<TrackContextValue>(
    () => ({
      store,
      months,
      rows,
      accounts,
      status,
      progress,
      lastSyncedAt,
      lastError,
      unreadable,
      apiUrl,
      syncToken,
      hasLoadedSnapshot,
      setApiUrl: updateApiUrl,
      sync,
      clearData,
    }),
    [
      store,
      months,
      rows,
      accounts,
      status,
      progress,
      lastSyncedAt,
      lastError,
      unreadable,
      apiUrl,
      syncToken,
      hasLoadedSnapshot,
      updateApiUrl,
      sync,
      clearData,
    ]
  );

  return <TrackContext.Provider value={value}>{children}</TrackContext.Provider>;
}

export function useTrack(): TrackContextValue {
  const ctx = useContext(TrackContext);
  if (!ctx) {
    throw new Error('useTrack must be used within a TrackProvider');
  }
  return ctx;
}
