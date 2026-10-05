import { AppState, Platform, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import { ApiError, NetworkError } from '@condo/shared';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Only transient network failures are worth retrying; API errors are definitive.
      retry: (failureCount, error) => error instanceof NetworkError && failureCount < 3,
      refetchOnWindowFocus: true,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Feed connectivity into TanStack Query: queries pause while offline and resume on reconnect.
 * Phase 4 builds the offline report queue on top of onlineManager.
 */
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(state.isConnected !== false);
  }),
);

/** Refetch stale queries when the app returns to the foreground. */
if (Platform.OS !== 'web') {
  focusManager.setEventListener((handleFocus) => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => handleFocus(status === 'active'));
    return () => sub.remove();
  });
}

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.problem.code === code);
}
