import { useEffect, useRef } from 'react';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { queryClient } from '../api/queryClient';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { LoadingView } from '../components/StateView';
import { getPendingInvite, isJoinScreenMounted } from '../lib/pendingInvite';
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
  usePendingInviteRedirect(status);
  if (status === 'loading') return <LoadingView />;
  const signedIn = status === 'signedIn';
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" options={{ title: 'Buildings' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      {/* Invitations work in both states (outside the guards): buildingapp://join/{code}, /join/{code}. */}
      <Stack.Screen
        name="join/index"
        options={{ headerShown: true, title: 'Join with a code', headerBackButtonDisplayMode: 'minimal' }}
      />
      <Stack.Screen
        name="join/[code]"
        options={{ headerShown: true, title: 'Invitation', headerBackButtonDisplayMode: 'minimal' }}
      />
    </Stack>
  );
}

/**
 * After signing in or registering, return to the invitation the user opened while signed out.
 * The guard flip itself drops the (auth) screens; this then (re)opens /join/{code}.
 */
function usePendingInviteRedirect(status: 'loading' | 'signedOut' | 'signedIn') {
  const previous = useRef(status);
  useEffect(() => {
    const was = previous.current;
    previous.current = status;
    if (status !== 'signedIn' || was !== 'signedOut') return;
    let cancelled = false;
    void getPendingInvite().then((code) => {
      // Next tick: let the protected-route redirect settle first.
      if (!code || cancelled) return;
      setTimeout(() => {
        // The join screen is still in the stack (the guard flip just popped login off it): nothing to do.
        if (isJoinScreenMounted(code)) return;
        router.navigate(`/join/${code}`);
      }, 0);
    });
    return () => {
      cancelled = true;
    };
  }, [status]);
}
