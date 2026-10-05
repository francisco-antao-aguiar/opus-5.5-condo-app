import { Stack } from 'expo-router';
import { PushRegistrar } from '../../notifications/PushRegistrar';
import { ReportQueueRunner } from '../../reports/ReportQueueRunner';

export const unstable_settings = {
  // Deep links straight into a building still get the tabs underneath for "back".
  anchor: '(tabs)',
};

export default function AppLayout() {
  return (
    <>
      <ReportQueueRunner />
      <PushRegistrar />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="buildings/new"
          options={{ title: 'New building', presentation: 'modal' }}
        />
        <Stack.Screen name="buildings/[buildingId]" options={{ headerShown: false }} />
        <Stack.Screen name="scan" options={{ title: 'Scan a code', presentation: 'fullScreenModal' }} />
      </Stack>
    </>
  );
}
