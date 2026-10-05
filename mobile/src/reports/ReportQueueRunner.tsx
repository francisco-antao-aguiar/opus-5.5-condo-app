import { useEffect } from 'react';
import { AppState } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthProvider';
import { loadQueue, processQueue } from './queue';

/** Sends queued reports on app start, when connectivity returns and when the app comes to the foreground. */
export function ReportQueueRunner() {
  const userId = useAuth().me?.user.id;
  useEffect(() => {
    if (!userId) return;
    const run = () => {
      if (onlineManager.isOnline()) void processQueue(userId);
    };
    void loadQueue().then(run);
    const unsubOnline = onlineManager.subscribe((online) => {
      if (online) run();
    });
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') run();
    });
    return () => {
      unsubOnline();
      sub.remove();
    };
  }, [userId]);
  return null;
}
