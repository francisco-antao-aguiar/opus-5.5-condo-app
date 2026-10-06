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
      <Stack.Screen name="invite" options={{ title: 'Invite people', presentation: 'modal' }} />
      <Stack.Screen name="assets/[assetId]" options={{ title: '' }} />
      <Stack.Screen name="report" options={{ title: 'Report a problem', presentation: 'modal' }} />
      <Stack.Screen name="issues/index" options={{ title: 'Issues' }} />
      {/* Deep-link target for phase 5 push notifications: buildingapp://buildings/{b}/issues/{id} */}
      <Stack.Screen name="issues/[issueId]" options={{ title: '' }} />
      <Stack.Screen name="bookings/index" options={{ title: 'Bookings' }} />
      <Stack.Screen name="bookings/new" options={{ title: 'Book a space' }} />
      {/* Target of BOOKING_* notifications: /buildings/{b}/bookings/{id} */}
      <Stack.Screen name="bookings/[bookingId]" options={{ title: 'Booking' }} />
      <Stack.Screen name="costs/new" options={{ title: 'Add cost', presentation: 'modal' }} />
    </Stack>
  );
}
