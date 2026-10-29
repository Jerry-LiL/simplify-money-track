import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTrack } from '../state/TrackProvider';
import { formatForeign, formatINR } from '../data/money';
import { formatISTDate } from '../data/dates';

type Props = NativeStackScreenProps<RootStackParamList, 'Detail'>;

export function DetailScreen({ route, navigation }: Props) {
  const { txnId } = route.params;
  const { store, accounts } = useTrack();
  const [showRaw, setShowRaw] = useState(false);

  const txn = store.byId[txnId];

  if (!txn) {
    return (
      <View style={styles.notFoundContainer}>
        <Text style={styles.notFoundText}>Transaction not found</Text>
        <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const isForeign = txn.currency !== 'INR';
  const isOwnTransfer = txn.ownTransfer;
  const account = accounts.find((a) => a.id === txn.accountId);
  const accountDisplay = account
    ? `${account.bank} — ${account.nickname} (••${account.last4})`
    : txn.accountId;

  const counterpartyAccount = txn.counterpartyAccountId
    ? accounts.find((a) => a.id === txn.counterpartyAccountId)
    : null;
  const counterpartyDisplay = counterpartyAccount
    ? `${counterpartyAccount.bank} — ${counterpartyAccount.nickname} (••${counterpartyAccount.last4})`
    : txn.counterpartyAccountId;

  let primaryAmount = '';
  if (isOwnTransfer) {
    primaryAmount = isForeign
      ? formatForeign(txn.amountMinor, txn.currency)
      : formatINR(txn.amountMinor);
  } else if (!isForeign) {
    primaryAmount =
      txn.direction === 'credit'
        ? `+${formatINR(txn.amountMinor)}`
        : `-${formatINR(txn.amountMinor)}`;
  } else {
    const formatted = formatForeign(txn.amountMinor, txn.currency);
    primaryAmount = txn.direction === 'credit' ? `+${formatted}` : `-${formatted}`;
  }

  let inclusionText = '';
  let inclusionColor = styles.inclusionIncluded;
  if (isOwnTransfer) {
    inclusionText = 'Excluded from totals (self transfer between own accounts)';
    inclusionColor = styles.inclusionExcluded;
  } else if (txn.inrMinor === null) {
    inclusionText = 'Excluded from totals (foreign charge without INR conversion rate)';
    inclusionColor = styles.inclusionExcluded;
  } else if (txn.direction === 'debit') {
    inclusionText = "Included in month's spend";
  } else {
    inclusionText = "Included in month's income";
  }

  const updatedTimeDisplay =
    txn.updatedAt > 0
      ? formatISTDate(txn.updatedAt)
      : 'not provided by the bank';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Top Card */}
      <View style={styles.card}>
        <Text style={styles.merchantTitle}>
          {txn.merchant || 'Unknown Merchant'}
        </Text>

        <Text
          style={[
            styles.amountHeadline,
            !isOwnTransfer && txn.direction === 'credit' && styles.creditText,
            isOwnTransfer && styles.ownTransferText,
          ]}
        >
          {primaryAmount}
        </Text>

        {isForeign && txn.inrMinor !== null && (
          <View style={styles.fxContainer}>
            <Text style={styles.fxAmount}>{formatINR(txn.inrMinor)}</Text>
            <Text style={styles.fxNote}>converted at bank's rate</Text>
          </View>
        )}
      </View>

      {/* Details Table Card */}
      <View style={styles.card}>
        <DetailRow label="Direction" value={txn.direction === 'debit' ? 'Debit' : 'Credit'} />
        <DetailRow label="Status" value={txn.status} />
        <DetailRow label="Category" value={txn.category || 'Uncategorised'} />
        <DetailRow label="Date & Time" value={formatISTDate(txn.occurredAt)} />
        <DetailRow label="Account" value={accountDisplay} />

        {isOwnTransfer && counterpartyDisplay && (
          <DetailRow label="Transferred To/From" value={counterpartyDisplay} />
        )}

        <DetailRow label="Transaction ID" value={txn.id} />
        <DetailRow label="Last Updated" value={updatedTimeDisplay} />

        <View style={styles.inclusionRow}>
          <Text style={styles.detailLabel}>Monthly Totals</Text>
          <Text style={[styles.inclusionValue, inclusionColor]}>
            {inclusionText}
          </Text>
        </View>
      </View>

      {/* Collapsible Raw Record */}
      <View style={styles.card}>
        <Pressable
          style={styles.rawHeader}
          onPress={() => setShowRaw(!showRaw)}
          accessibilityRole="button"
          accessibilityLabel="Toggle raw record json"
        >
          <Text style={styles.rawHeaderTitle}>Raw Record</Text>
          <Text style={styles.rawToggleText}>{showRaw ? 'Hide' : 'Show'}</Text>
        </Pressable>

        {showRaw && (
          <View style={styles.rawContent}>
            <ScrollView horizontal style={styles.rawScroll}>
              <Text style={styles.rawText} selectable>
                {JSON.stringify(txn.raw, null, 2)}
              </Text>
            </ScrollView>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} selectable>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  merchantTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  amountHeadline: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  creditText: {
    color: '#059669',
  },
  ownTransferText: {
    color: '#6b7280',
  },
  fxContainer: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  fxAmount: {
    fontSize: 15,
    fontWeight: '600',
    color: '#4b5563',
  },
  fxNote: {
    fontSize: 13,
    color: '#6b7280',
    fontStyle: 'italic',
  },
  detailRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  detailLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '500',
  },
  inclusionRow: {
    paddingTop: 10,
  },
  inclusionValue: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 2,
  },
  inclusionIncluded: {
    color: '#047857',
  },
  inclusionExcluded: {
    color: '#b45309',
  },
  rawHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rawHeaderTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  rawToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4f46e5',
  },
  rawContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f3f4f6',
  },
  rawScroll: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    padding: 12,
  },
  rawText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#f9fafb',
    lineHeight: 18,
  },
  notFoundContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#ffffff',
  },
  notFoundText: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 16,
  },
  backButton: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  backButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
