import { Pressable, Text, type ColorValue } from 'react-native';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useTheme } from '../../../theme';

function TabGlyph({ glyph, color }: { glyph: string; color: ColorValue }) {
  return <Text style={{ color, fontSize: 22, fontWeight: '700' }}>{glyph}</Text>;
}

export default function TabsLayout() {
  const { colors } = useTheme();
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
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Join a building with an invite code"
              onPress={() => router.push('/join')}
              hitSlop={8}
              style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ color: colors.primary, fontSize: 17, fontWeight: '600' }}>Join</Text>
            </Pressable>
          ),
          tabBarIcon: ({ color }) => <TabGlyph glyph={'⌂'} color={color} />,
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
