import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:4010';
export const API_URL_STORAGE_KEY = 'track:apiUrl';

export async function getPersistedApiUrl(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(API_URL_STORAGE_KEY);
    if (stored && stored.trim()) {
      return stored.trim();
    }
  } catch {}
  return DEFAULT_API_URL;
}

export async function setPersistedApiUrl(url: string): Promise<void> {
  try {
    const trimmed = url.trim();
    if (!trimmed || trimmed === DEFAULT_API_URL) {
      await AsyncStorage.removeItem(API_URL_STORAGE_KEY);
    } else {
      await AsyncStorage.setItem(API_URL_STORAGE_KEY, trimmed);
    }
  } catch {}
}
