import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

interface Props {
  value: string;
  onChangeQuery: (query: string) => void;
  placeholder?: string;
}

export const SearchBar = React.memo(function SearchBar({
  value,
  onChangeQuery,
  placeholder = 'Search merchant, category, or amount',
}: Props) {
  const [localText, setLocalText] = useState(value);

  // Sync external clear
  useEffect(() => {
    setLocalText(value);
  }, [value]);

  // Debounce 200ms
  useEffect(() => {
    const timer = setTimeout(() => {
      onChangeQuery(localText);
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [localText, onChangeQuery]);

  const handleClear = () => {
    setLocalText('');
    onChangeQuery('');
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={localText}
        onChangeText={setLocalText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityRole="search"
        accessibilityLabel="Search transactions"
      />
      {localText.length > 0 && (
        <Pressable
          style={styles.clearButton}
          onPress={handleClear}
          accessibilityRole="button"
          accessibilityLabel="Clear search text"
        >
          <Text style={styles.clearText}>✕</Text>
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    height: 40,
    fontSize: 14,
    color: '#111827',
  },
  clearButton: {
    padding: 6,
  },
  clearText: {
    fontSize: 14,
    color: '#9ca3af',
    fontWeight: '700',
  },
});
