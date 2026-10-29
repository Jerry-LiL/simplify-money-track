import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MonthGroup } from '../data/types';
import { formatINR } from '../data/money';

interface Props {
  month: MonthGroup;
}

export const MonthHeaderRow = React.memo(function MonthHeaderRow({ month }: Props) {
  const countLabel = month.count === 1 ? '1 transaction' : `${month.count} transactions`;

  const pendingNote =
    month.pendingCount > 0
      ? `${month.pendingCount} pending included`
      : null;

  const unconvertedNote =
    month.unconvertedCount > 0
      ? `${month.unconvertedCount} ${month.unconvertedCount === 1 ? 'foreign charge' : 'foreign charges'} not counted`
      : null;

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.monthLabel}>{month.label}</Text>
        <Text style={styles.countText}>{countLabel}</Text>
      </View>

      <View style={styles.totalsRow}>
        <View style={styles.totalBlock}>
          <Text style={styles.totalLabel}>Spent</Text>
          <Text style={styles.spendValue}>{formatINR(month.spendMinor)}</Text>
        </View>

        <View style={styles.totalBlock}>
          <Text style={styles.totalLabel}>Earned</Text>
          <Text style={styles.incomeValue}>{formatINR(month.incomeMinor)}</Text>
        </View>
      </View>

      {(pendingNote || unconvertedNote) && (
        <View style={styles.notesRow}>
          {pendingNote && <Text style={styles.noteText}>{pendingNote}</Text>}
          {unconvertedNote && <Text style={styles.noteText}>{unconvertedNote}</Text>}
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e5e7eb',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  countText: {
    fontSize: 12,
    color: '#6b7280',
  },
  totalsRow: {
    flexDirection: 'row',
    gap: 24,
  },
  totalBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  totalLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  spendValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
  },
  incomeValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#047857',
  },
  notesRow: {
    marginTop: 6,
    flexDirection: 'column',
    gap: 2,
  },
  noteText: {
    fontSize: 11,
    color: '#9ca3af',
  },
});
