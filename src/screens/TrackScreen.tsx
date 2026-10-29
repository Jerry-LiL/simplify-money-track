import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { RootStackParamList } from '../navigation/types';
import { useTrack } from '../state/TrackProvider';
import { buildStatusText } from '../state/statusText';
import { ListRow, searchTxns, Txn } from '../data';
import { MonthHeaderRow } from '../components/MonthHeaderRow';
import { TxnRow } from '../components/TxnRow';
import { SearchBar } from '../components/SearchBar';

type Props = NativeStackScreenProps<RootStackParamList, 'Track'>;

export function TrackScreen({ navigation }: Props) {
  const {
    store,
    rows,
    accounts,
    status,
    progress,
    lastSyncedAt,
    lastError,
    sync,
    hasLoadedSnapshot,
  } = useTrack();

  const [searchQuery, setSearchQuery] = useState('');

  const statusText = useMemo(
    () => buildStatusText({ status, lastSyncedAt, progress, lastError }),
    [status, lastSyncedAt, progress, lastError]
  );

  const stickyHeaderIndices = useMemo(() => {
    const indices: number[] = [];
    rows.forEach((row, i) => {
      if (row.type === 'header') {
        indices.push(i);
      }
    });
    return indices;
  }, [rows]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return null;
    }
    return searchTxns(store, searchQuery);
  }, [store, searchQuery]);

  const handleOpenDetail = useCallback(
    (txnId: string) => {
      navigation.navigate('Detail', { txnId });
    },
    [navigation]
  );

  const handleOpenSettings = useCallback(() => {
    navigation.navigate('Settings');
  }, [navigation]);

  const handleRetry = useCallback(() => {
    sync({ manual: true });
  }, [sync]);

  const renderRow = useCallback(
    ({ item }: { item: ListRow }) => {
      if (item.type === 'header') {
        return <MonthHeaderRow month={item.month} />;
      }
      return (
        <TxnRow
          txn={item.txn}
          accounts={accounts}
          onPress={handleOpenDetail}
        />
      );
    },
    [accounts, handleOpenDetail]
  );

  const renderSearchItem = useCallback(
    ({ item }: { item: Txn }) => {
      return (
        <TxnRow
          txn={item}
          accounts={accounts}
          showMonthLabel
          onPress={handleOpenDetail}
        />
      );
    },
    [accounts, handleOpenDetail]
  );

  const getRowItemType = useCallback((item: ListRow) => {
    return item.type;
  }, []);

  const totalTxnCount = Object.keys(store.byId).length;
  const hasNoCachedData = hasLoadedSnapshot && totalTxnCount === 0;

  // Very first sync: show a full progress state, NOT partial rows with partial totals
  if (hasNoCachedData && status === 'syncing') {
    const loadedCount = progress ? progress.recordsLoaded : 0;
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.appTitle}>Track</Text>
          <Pressable
            style={styles.settingsButton}
            onPress={handleOpenSettings}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <Text style={styles.settingsButtonText}>Settings</Text>
          </Pressable>
        </View>

        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color="#4f46e5" />
          <Text style={styles.initialLoadingTitle}>Syncing transactions…</Text>
          <Text style={styles.initialLoadingSubtitle}>
            {loadedCount > 0
              ? `${loadedCount.toLocaleString()} transactions loaded`
              : 'Connecting to server…'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // No cached data and error, offline, or idle with zero rows and lastError
  const shouldShowErrorPanel =
    hasNoCachedData &&
    (status === 'error' ||
      status === 'offline' ||
      (status === 'idle' && rows.length === 0 && lastError !== null));

  if (shouldShowErrorPanel) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.appTitle}>Track</Text>
          <Pressable
            style={styles.settingsButton}
            onPress={handleOpenSettings}
            accessibilityRole="button"
            accessibilityLabel="Open settings"
          >
            <Text style={styles.settingsButtonText}>Settings</Text>
          </Pressable>
        </View>

        <View style={styles.centeredContainer}>
          <Text style={styles.emptyTitle}>Couldn't load transactions</Text>
          <Text style={styles.emptySubtitle}>
            {lastError?.message || 'Server is not responding. Check your connection or server URL.'}
          </Text>
          <View style={styles.errorActionsRow}>
            <Pressable style={styles.primaryButton} onPress={handleRetry}>
              <Text style={styles.primaryButtonText}>Retry</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={handleOpenSettings}>
              <Text style={styles.secondaryButtonText}>Change server</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.appTitle}>Track</Text>
          <Pressable
            onPress={status === 'error' ? handleRetry : undefined}
            disabled={status !== 'error'}
          >
            <Text
              style={[
                styles.statusLine,
                status === 'error' && styles.statusLineError,
                status === 'offline' && styles.statusLineOffline,
              ]}
              numberOfLines={1}
            >
              {statusText}
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.settingsButton}
          onPress={handleOpenSettings}
          accessibilityRole="button"
          accessibilityLabel="Open settings"
        >
          <Text style={styles.settingsButtonText}>Settings</Text>
        </Pressable>
      </View>

      {/* Search Bar */}
      <SearchBar value={searchQuery} onChangeQuery={setSearchQuery} />

      {/* Search Results Mode */}
      {searchResults !== null ? (
        <View style={styles.listContainer}>
          <View style={styles.searchSummaryBar}>
            <Text style={styles.searchSummaryText}>
              {searchResults.length === 1 ? '1 match' : `${searchResults.length} matches`}
            </Text>
          </View>

          {searchResults.length === 0 ? (
            <View style={styles.emptySearchContainer}>
              <Text style={styles.emptySearchText}>
                No transactions match "{searchQuery}"
              </Text>
            </View>
          ) : (
            <FlashList
              data={searchResults}
              keyExtractor={(txn) => txn.id}
              renderItem={renderSearchItem}
            />
          )}
        </View>
      ) : (
        /* Standard Month Grouped Mode */
        <View style={styles.listContainer}>
          {rows.length === 0 && hasLoadedSnapshot && status === 'idle' ? (
            <View style={styles.centeredContainer}>
              <Text style={styles.emptyTitle}>No transactions</Text>
              <Text style={styles.emptySubtitle}>Your transaction list is currently empty.</Text>
            </View>
          ) : (
            <FlashList
              data={rows}
              keyExtractor={(item) => item.key}
              renderItem={renderRow}
              getItemType={getRowItemType}
              stickyHeaderIndices={stickyHeaderIndices}
              refreshControl={
                <RefreshControl
                  refreshing={status === 'syncing' && lastSyncedAt !== null}
                  onRefresh={handleRetry}
                  tintColor="#4f46e5"
                />
              }
            />
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  headerLeft: {
    flex: 1,
    marginRight: 12,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
  },
  statusLine: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  statusLineError: {
    color: '#dc2626',
    fontWeight: '500',
  },
  statusLineOffline: {
    color: '#d97706',
  },
  settingsButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
  },
  settingsButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  listContainer: {
    flex: 1,
  },
  searchSummaryBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f9fafb',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  searchSummaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563',
  },
  emptySearchContainer: {
    paddingTop: 48,
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptySearchText: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
  },
  centeredContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  initialLoadingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 16,
    marginBottom: 6,
  },
  initialLoadingSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  errorActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
  },
  secondaryButtonText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
  },
});
