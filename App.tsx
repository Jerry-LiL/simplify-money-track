import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from './src/navigation/types';
import { TrackProvider } from './src/state/TrackProvider';
import { TrackScreen } from './src/screens/TrackScreen';
import { DetailScreen } from './src/screens/DetailScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <SafeAreaProvider>
      <TrackProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <Stack.Navigator initialRouteName="Track">
            <Stack.Screen
              name="Track"
              component={TrackScreen}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="Detail"
              component={DetailScreen}
              options={{ title: 'Transaction' }}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{
                presentation: 'modal',
                title: 'Settings',
              }}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </TrackProvider>
    </SafeAreaProvider>
  );
}
