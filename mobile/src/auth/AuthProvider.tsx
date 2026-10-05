import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LoginRequest, MeResponse, RegisterRequest } from '@condo/shared';
import { api, setSessionExpiredHandler, tokenStore } from '../api/client';
import { queryKeys } from '../api/queryKeys';

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

interface AuthContextValue {
  status: AuthStatus;
  me: MeResponse | undefined;
  meQuery: ReturnType<typeof useMeQuery>;
  login: (req: LoginRequest) => Promise<void>;
  register: (req: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function useMeQuery(enabled: boolean) {
  return useQuery({ queryKey: queryKeys.me, queryFn: api.me, enabled });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');

  // Load persisted tokens once, then follow every change the client makes to them
  // (login/register set them, a failed refresh clears them).
  useEffect(() => {
    let active = true;
    tokenStore.load().then((tokens) => {
      if (active) setStatus(tokens ? 'signedIn' : 'signedOut');
    });
    const unsubscribe = tokenStore.subscribe((tokens) => setStatus(tokens ? 'signedIn' : 'signedOut'));
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout();
    // Protected routes in the root layout redirect to (auth)/login once status flips.
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      void logout();
    });
    return () => setSessionExpiredHandler(null);
  }, [logout]);

  const login = useCallback(
    async (req: LoginRequest) => {
      queryClient.clear();
      await api.auth.login(req);
    },
    [queryClient],
  );

  const register = useCallback(
    async (req: RegisterRequest) => {
      queryClient.clear();
      await api.auth.register(req);
    },
    [queryClient],
  );

  const meQuery = useMeQuery(status === 'signedIn');

  const value = useMemo<AuthContextValue>(
    () => ({ status, me: meQuery.data, meQuery, login, register, logout }),
    [status, meQuery, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
