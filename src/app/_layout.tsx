import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SetupNotice } from '@/components/SetupNotice';
import { AuthProvider } from '@/lib/auth-context';
import { isConfigured } from '@/lib/env';
import { colors } from '@/lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {isConfigured ? (
        <AuthProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
            }}
          />
        </AuthProvider>
      ) : (
        <SetupNotice />
      )}
    </SafeAreaProvider>
  );
}
