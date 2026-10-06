import { useState } from 'react';
import { Linking, Platform, Share, StyleSheet, Text, View } from 'react-native';
import { api } from '../../../api/client';
import { FormError } from '../../../components/Layout';
import { errorMessage } from '../../../lib/errors';
import Constants from 'expo-constants';
import { API_URL } from '../../../api/config';
import { useAuth } from '../../../auth/AuthProvider';
import { Button } from '../../../components/Button';
import { Card, ScrollScreen, SectionTitle } from '../../../components/Layout';
import { QueryGate } from '../../../components/StateView';
import { roleLabel } from '../../../lib/format';
import { registerPush, usePushStatus } from '../../../notifications/push';
import { spacing, useTheme } from '../../../theme';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const { meQuery, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  async function onLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <QueryGate queries={[meQuery]}>
      {() => {
        const me = meQuery.data!;
        return (
          <ScrollScreen>
            <Card style={styles.center}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <Text style={[styles.avatarText, { color: colors.primaryText }]}>
                  {me.user.displayName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <Text style={[styles.name, { color: colors.text }]}>{me.user.displayName}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 16 }}>{me.user.email}</Text>
            </Card>

            <SectionTitle>Memberships</SectionTitle>
            <Card>
              {me.memberships.length === 0 ? (
                <Text style={{ color: colors.textMuted }}>Not a member of any building yet.</Text>
              ) : (
                me.memberships.map((m) => (
                  <View key={m.membershipId} style={styles.line}>
                    <Text style={[styles.lineTitle, { color: colors.text }]}>{m.buildingName}</Text>
                    <Text style={{ color: colors.textMuted }}>
                      {roleLabel(m.role)}
                      {m.unitName ? ' · ' + m.unitName : ''}
                    </Text>
                  </View>
                ))
              )}
            </Card>

            <PushSection userId={me.user.id} />

            <CalendarSection />

            <SectionTitle>About</SectionTitle>
            <Card>
              <Text style={{ color: colors.textMuted }}>Version {Constants.expoConfig?.version ?? '1.0.0'}</Text>
              <Text style={{ color: colors.textMuted }} selectable>
                Server {API_URL}
              </Text>
            </Card>

            <Button title="Sign out" variant="danger" onPress={onLogout} loading={loggingOut} />
          </ScrollScreen>
        );
      }}
    </QueryGate>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 32, fontWeight: '700' },
  name: { fontSize: 22, fontWeight: '700' },
  line: { gap: 2, paddingVertical: spacing.xs },
  lineTitle: { fontSize: 16, fontWeight: '600' },
});

/** Push status + a one-line hint when push can't work here (simulator, no EAS projectId, web). */
function PushSection({ userId }: { userId: string }) {
  const { colors } = useTheme();
  const push = usePushStatus();
  let text: string;
  let action: { label: string; onPress: () => void } | null = null;
  switch (push.kind) {
    case 'registered':
      text = 'On — you’ll get a notification when your reports change.';
      break;
    case 'unsupported':
      text =
        push.reason === 'no-project-id'
          ? 'Push notifications need an EAS project id — see README.'
          : push.reason === 'simulator'
            ? 'Push notifications only work on a physical device.'
            : 'Push notifications are available in the mobile app. Updates still appear in Inbox.';
      break;
    case 'denied':
      text = 'Off — turn notifications on for Condo in your phone’s Settings.';
      if (Platform.OS !== 'web') action = { label: 'Open Settings', onPress: () => void Linking.openSettings() };
      break;
    case 'undetermined':
      text = 'Off.';
      action = { label: 'Turn on notifications', onPress: () => void registerPush(userId, true) };
      break;
    case 'error':
      text = 'Couldn’t set up push on this device (' + push.message + '). Updates still appear in Inbox.';
      break;
    default:
      text = 'Checking…';
  }
  return (
    <>
      <SectionTitle>Notifications</SectionTitle>
      <Card>
        <Text style={{ color: colors.textMuted, fontSize: 15 }}>{text}</Text>
        {action ? <Button title={action.label} variant="secondary" onPress={action.onPress} /> : null}
      </Card>
    </>
  );
}

/** Signed .ics feed of my confirmed bookings, shared to a calendar app. */
function CalendarSection() {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function share() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await api.bookings.calendarLink();
      const nav = typeof navigator !== 'undefined' ? (navigator as Partial<Navigator>) : undefined;
      if (Platform.OS === 'web' && !nav?.share) {
        // Desktop browsers: no share sheet — copy it instead.
        await nav?.clipboard?.writeText(url).catch(() => undefined);
        window.alert('Calendar link (copied to the clipboard):\n\n' + url);
        return;
      }
      await Share.share({ message: url, url, title: 'Condo bookings calendar' });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <SectionTitle>Calendar</SectionTitle>
      <Card>
        <Text style={{ color: colors.textMuted, fontSize: 15 }}>
          Subscribe to your confirmed bookings in Google Calendar, Apple Calendar or Outlook. Keep the link private.
        </Text>
        <FormError message={error ? errorMessage(error) : null} />
        <Button title="Add bookings to my calendar" variant="secondary" onPress={() => void share()} loading={busy} />
      </Card>
    </>
  );
}
