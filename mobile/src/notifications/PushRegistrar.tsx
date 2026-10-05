import { useEffect, useState } from 'react';
import { AppState, Text } from 'react-native';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/Button';
import { Sheet } from '../components/Sheet';
import { useTheme } from '../theme';
import {
  markExplained,
  onPushTokenChange,
  pushPermission,
  pushUnsupportedReason,
  registerPush,
  wasExplained,
} from './push';

/**
 * After sign-in: explain push once, then ask; re-register on app start / foreground (the token or
 * the signed-in user may have changed). Renders the one-time explanation sheet.
 */
export function PushRegistrar() {
  const { colors } = useTheme();
  const userId = useAuth().me?.user.id;
  const [explain, setExplain] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    const sync = async () => {
      if (pushUnsupportedReason()) {
        await registerPush(userId); // records why, for the Profile hint
        return;
      }
      const perm = await pushPermission();
      if (perm === 'granted') await registerPush(userId);
      else if (perm === 'undetermined' && !(await wasExplained()) && active) setExplain(true);
      else await registerPush(userId); // records 'denied' / 'undetermined'
    };
    void sync();
    const unsubToken = onPushTokenChange(userId);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void sync();
    });
    return () => {
      active = false;
      unsubToken();
      sub.remove();
    };
  }, [userId]);

  if (!userId) return null;

  const close = () => {
    void markExplained();
    setExplain(false);
  };

  return (
    <Sheet visible={explain} title="Stay in the loop" onClose={close}>
      <Text style={{ color: colors.text, fontSize: 16, lineHeight: 22 }}>
        Get a notification when a problem you reported (or said “me too” to) is acknowledged, fixed or
        gets a reply. Nothing else — no marketing.
      </Text>
      <Button
        title="Turn on notifications"
        onPress={() => {
          close();
          void registerPush(userId, true);
        }}
      />
      <Button title="Not now" variant="ghost" onPress={close} />
    </Sheet>
  );
}
