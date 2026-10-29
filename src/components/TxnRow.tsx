import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Account, Txn } from '../data/types';
import { formatForeign, formatINR } from '../data/money';
import { formatISTDate, monthKey, monthLabel } from '../data/dates';
import { buildTxnAccessibilityLabel } from '../state/accessibility';

interface Props {
  txn: Txn;
  accounts: Account[];
  showMonthLabel?: boolean;
  onPress: (txnId: string) => void;
}

export const TxnRow = React.memo(function TxnRow({
  txn,
  accounts,
  showMonthLabel = false,
  onPress,
}: Props) {
  const account = accounts.find((a) => a.id === txn.accountId);
  const accountName = account ? account.nickname : txn.accountId;
  const dateStr = formatISTDate(txn.occurredAt);

  const monthTag = showMonthLabel ? monthLabel(monthKey(txn.occurredAt)) : null;

  const handlePress = () => {
    onPress(txn.id);
  };

  const isPending = txn.status === 'PENDING';
  const isOwnTransfer = txn.ownTransfer;
  const isForeign = txn.currency !== 'INR';

  let primaryAmountText = '';
  let secondaryAmountText: string | null = null;
  let amountStyle = styles.debitAmount;

  if (isOwnTransfer) {
    primaryAmountText = isForeign
      ? formatForeign(txn.amountMinor, txn.currency)
      : formatINR(txn.amountMinor);
    amountStyle = styles.ownTransferAmount;
  } else if (!isForeign) {
    if (txn.direction === 'credit') {
      primaryAmountText = `+${formatINR(txn.amountMinor)}`;
      amountStyle = styles.creditAmount;
    } else {
      primaryAmountText = `-${formatINR(txn.amountMinor)}`;
      amountStyle = styles.debitAmount;
    }
  } else {
    // Foreign
    const foreignBase = formatForeign(txn.amountMinor, txn.currency);
    if (txn.direction === 'credit') {
      primaryAmountText = `+${foreignBase}`;
      amountStyle = styles.creditAmount;
    } else {
      primaryAmountText = `-${foreignBase}`;
      amountStyle = styles.debitAmount;
    }

    if (txn.inrMinor !== null) {
      secondaryAmountText = formatINR(txn.inrMinor);
    }
  }

  const accessibilityLabel = buildTxnAccessibilityLabel(txn, accounts);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.leftCol}>
        {monthTag && <Text style={styles.monthBadge}>{monthTag}</Text>}

        <Text style={styles.merchantText} numberOfLines={1}>
          {txn.merchant || 'Unknown Merchant'}
        </Text>

        <View style={styles.metaRow}>
          <Text style={styles.metaText}>{dateStr}</Text>
          <Text style={styles.dotSeparator}>•</Text>
          <Text style={styles.metaText} numberOfLines={1}>
            {accountName}
          </Text>
        </View>

        {(isOwnTransfer || isPending) && (
          <View style={styles.tagsContainer}>
            {isOwnTransfer && (
              <View style={styles.selfTransferBadge}>
                <Text style={styles.selfTransferText}>Self transfer</Text>
              </View>
            )}
            {isPending && (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingText}>Pending</Text>
              </View>
            )}
          </View>
        )}
      </View>

      <View style={styles.rightCol}>
        <Text style={[styles.amountText, amountStyle]} numberOfLines={1}>
          {primaryAmountText}
        </Text>
        {secondaryAmountText && (
          <Text style={styles.secondaryAmountText} numberOfLines={1}>
            {secondaryAmountText}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  pressed: {
    backgroundColor: '#f9fafb',
  },
  leftCol: {
    flex: 1,
    paddingRight: 12,
  },
  monthBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6366f1',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  merchantText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: 12,
    color: '#6b7280',
  },
  dotSeparator: {
    fontSize: 12,
    color: '#9ca3af',
    marginHorizontal: 4,
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 6,
  },
  selfTransferBadge: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  selfTransferText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
  },
  pendingBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  pendingText: {
    fontSize: 11,
    color: '#d97706',
    fontWeight: '500',
  },
  rightCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  amountText: {
    fontSize: 15,
    fontWeight: '600',
  },
  debitAmount: {
    color: '#111827',
  },
  creditAmount: {
    color: '#059669',
  },
  ownTransferAmount: {
    color: '#9ca3af',
  },
  secondaryAmountText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
});
