import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '../api/queryClient';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { LoadingView } from '../components/StateView';
import { useTheme } from '../theme';

export default function RootLayout() {
  const { isDark, colors } = useTheme();
  const navTheme = isDark ? DarkTheme : DefaultTheme;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ThemeProvider
            value={{
              ...navTheme,
              colors: {
                ...navTheme.colors,
                primary: colors.primary,
                background: colors.background,
                card: colors.surface,
                text: colors.text,
                border: colors.border,
              },
            }}
          >
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <RootNavigator />
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/**
 * Auth gating via protected routes: when signed out, (app) is unreachable and the router
 * falls back to (auth)/login; signing in (or a session expiry) flips the guards and the
 * router redirects automatically.
 */
function RootNavigator() {
  const { status } = useAuth();
  if (status === 'loading') return <LoadingView />;
  const signedIn = status === 'signedIn';
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}
