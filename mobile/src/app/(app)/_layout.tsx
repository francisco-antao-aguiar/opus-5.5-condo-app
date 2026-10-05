import { Stack } from 'expo-router';

export const unstable_settings = {
  // Deep links straight into a building still get the tabs underneath for "back".
  anchor: '(tabs)',
};

export default function AppLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="buildings/new"
        options={{ title: 'New building', presentation: 'modal' }}
      />
      <Stack.Screen name="buildings/[buildingId]" options={{ headerShown: false }} />
    </Stack>
  );
}
