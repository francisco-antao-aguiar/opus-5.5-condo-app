import { Stack } from 'expo-router';

/**
 * Building-scoped stack. The space browser pushes one screen per level, so the native back
 * gesture walks up the tree, and `/buildings/{b}/spaces/{s}` deep links straight into a node.
 */
export default function BuildingLayout() {
  return (
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: '' }} />
      <Stack.Screen name="spaces/[spaceId]" options={{ title: '' }} />
      <Stack.Screen name="members" options={{ title: 'Members' }} />
    </Stack>
  );
}
