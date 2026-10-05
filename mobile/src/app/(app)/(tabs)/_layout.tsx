import { useEffect } from 'react';
import { Pressable, Text, View, type ColorValue } from 'react-native';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useAuth } from '../../../auth/AuthProvider';
import { useUnreadCount } from '../../../hooks/queries';
import { setAppBadge } from '../../../notifications/push';
import { useReportQueue } from '../../../reports/queue';
import { useTheme } from '../../../theme';

function HeaderAction({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hint}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, opacity: pressed ? 0.6 : 1 })}
    >
      <Text style={{ color: colors.primary, fontSize: 17, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

function TabGlyph({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 22, fontWeight: '700' }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const { pending, failed } = useReportQueue(useAuth().me?.user.id);
  const outbox = pending.length + failed.length;
  const unread = useUnreadCount(true).data?.unread ?? 0;
  useEffect(() => setAppBadge(unread), [unread]);
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Buildings',
          headerRight: () => (
            <View style={{ flexDirection: 'row' }}>
              <HeaderAction label="Scan" hint="Scan a QR code on an item or an invitation" onPress={() => router.push('/scan')} />
              <HeaderAction label="Join" hint="Join a building with an invite code" onPress={() => router.push('/join')} />
            </View>
          ),
          tabBarIcon: ({ color }) => <TabGlyph glyph={'⌂'} color={color} />,
        }}
      />
      <Tabs.Screen
        name="issues"
        options={{
          title: 'Issues',
          tabBarIcon: ({ color }) => <TabGlyph glyph={'!'} color={color} />,
          // Reports still in the outbox (offline) or that couldn't be sent.
          tabBarBadge: outbox || undefined,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Notifications',
          tabBarLabel: 'Inbox',
          tabBarIcon: ({ color }) => <TabGlyph glyph={'✉'} color={color} />,
          tabBarBadge: unread ? (unread > 99 ? '99+' : unread) : undefined,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <TabGlyph glyph={'☺'} color={color} />,
        }}
      />
    </Tabs>
  );
}
