import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Constants from 'expo-constants';
import { API_URL } from '../../../api/config';
import { useAuth } from '../../../auth/AuthProvider';
import { Button } from '../../../components/Button';
import { Card, ScrollScreen, SectionTitle } from '../../../components/Layout';
import { QueryGate } from '../../../components/StateView';
import { roleLabel } from '../../../lib/format';
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
