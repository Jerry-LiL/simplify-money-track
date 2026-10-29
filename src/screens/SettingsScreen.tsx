import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { useTrack } from '../state/TrackProvider';
import { DEFAULT_API_URL } from '../config';
import { formatISTDate } from '../data/dates';

type Props = NativeStackScreenProps<RootStackParamList, 'Settings'>;

export function SettingsScreen({ navigation }: Props) {
  const {
    apiUrl,
    setApiUrl,
    lastSyncedAt,
    syncToken,
    store,
    unreadable,
    clearData,
    status,
  } = useTrack();

  const [inputUrl, setInputUrl] = useState(apiUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const txnCount = Object.keys(store.byId).length;

  const handleSave = async () => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      return;
    }
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await setApiUrl(trimmed);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefault = () => {
    setInputUrl(DEFAULT_API_URL);
  };

  const handleClearDataConfirm = () => {
    Alert.alert(
      'Clear saved data?',
      'This will remove all cached transactions and snapshots from your device. You will need to sync again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear data',
          style: 'destructive',
          onPress: async () => {
            await clearData();
            navigation.goBack();
          },
        },
      ]
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.keyboardContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* API Server Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>API Server</Text>
          <Text style={styles.sectionSubtitle}>
            Configure the base URL of the Track API mock server.
          </Text>

          <TextInput
            style={styles.urlInput}
            value={inputUrl}
            onChangeText={setInputUrl}
            placeholder="http://10.0.2.2:4010"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={isSaving}
              accessibilityRole="button"
              accessibilityLabel="Save server URL and resync"
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.saveButtonText}>Save and resync</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.resetButton}
              onPress={handleResetDefault}
              accessibilityRole="button"
              accessibilityLabel="Reset server URL to default"
            >
              <Text style={styles.resetButtonText}>Reset default</Text>
            </Pressable>
          </View>

          {saveSuccess && (
            <Text style={styles.successNote}>Saved! Resyncing from server…</Text>
          )}
        </View>

        {/* Sync Info / Diagnostics Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Diagnostics & Sync Info</Text>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Status</Text>
            <Text style={styles.infoValue}>{status}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Last sync time</Text>
            <Text style={styles.infoValue}>
              {lastSyncedAt ? formatISTDate(lastSyncedAt) : 'Never'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Sync token present</Text>
            <Text style={styles.infoValue}>
              {syncToken ? `Yes (${syncToken})` : 'No'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Transactions stored</Text>
            <Text style={styles.infoValue}>{txnCount.toLocaleString()}</Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Unreadable records</Text>
            <Text style={styles.infoValue}>{unreadable}</Text>
          </View>
        </View>

        {/* Danger Zone Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Storage</Text>
          <Text style={styles.sectionSubtitle}>
            Delete local offline cache chunks and manifests.
          </Text>

          <Pressable
            style={styles.clearButton}
            onPress={handleClearDataConfirm}
            accessibilityRole="button"
            accessibilityLabel="Clear saved data"
          >
            <Text style={styles.clearButtonText}>Clear saved data</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 20,
    paddingBottom: 40,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
    lineHeight: 18,
  },
  urlInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#f9fafb',
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#4f46e5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 140,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  resetButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  resetButtonText: {
    color: '#4b5563',
    fontSize: 14,
    fontWeight: '500',
  },
  successNote: {
    marginTop: 8,
    fontSize: 13,
    color: '#059669',
    fontWeight: '500',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f3f4f6',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    maxWidth: '60%',
    textAlign: 'right',
  },
  clearButton: {
    backgroundColor: '#fee2e2',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  clearButtonText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
  },
});
