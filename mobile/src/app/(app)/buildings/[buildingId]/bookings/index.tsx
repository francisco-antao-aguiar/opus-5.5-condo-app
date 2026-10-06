import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { canDo, type BookingDto } from '@condo/shared';
import { BookingRow, rulesSummary } from '../../../../../components/bookings/BookingParts';
import { Card, FormError, SectionTitle } from '../../../../../components/Layout';
import { ListRow } from '../../../../../components/ListRow';
import { QueryGate } from '../../../../../components/StateView';
import {
  useBookableSpaces,
  useBuilding,
  useMyBookings,
  useMyPermissions,
  usePendingRequests,
} from '../../../../../hooks/queries';
import { errorMessage } from '../../../../../lib/errors';
import { zoneNote } from '../../../../../lib/time';
import { spacing, useTheme } from '../../../../../theme';

/** Book a space · my bookings (upcoming first) · requests to review (BOOKING_MANAGE). */
export default function BookingsScreen() {
  const { buildingId } = useLocalSearchParams<{ buildingId: string }>();
  const { colors } = useTheme();
  const building = useBuilding(buildingId);
  const perms = useMyPermissions(buildingId);
  const spaces = useBookableSpaces(buildingId);
  const mine = useMyBookings(buildingId);
  const canManage = canDo(perms.data, 'BOOKING_MANAGE');
  const canBook = canDo(perms.data, 'BOOKING_CREATE');
  const pending = usePendingRequests(buildingId, canManage);
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([spaces.refetch(), mine.refetch(), canManage ? pending.refetch() : null]);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Bookings' }} />
      <QueryGate queries={[building, perms]}>
        {() => {
          const tz = building.data!.timeZone;
          const now = Date.now();
          const list = mine.data ?? [];
          const upcoming = list
            .filter((b) => new Date(b.endsAt).getTime() >= now)
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
          const past = list
            .filter((b) => new Date(b.endsAt).getTime() < now)
            .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
            .slice(0, 10);
          const requests = (pending.data ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
          const open = (b: BookingDto) => router.push(`/buildings/${buildingId}/bookings/${b.id}`);
          const note = zoneNote(tz);
          return (
            <ScrollView
              style={{ backgroundColor: colors.background }}
              contentContainerStyle={styles.content}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
              {note ? <Text style={{ color: colors.textMuted, fontSize: 13 }}>{note}</Text> : null}

              {canManage ? (
                <>
                  <SectionTitle>{`Requests to review${requests.length ? ` (${requests.length})` : ''}`}</SectionTitle>
                  <FormError message={pending.error ? errorMessage(pending.error) : null} />
                  {requests.length ? (
                    requests.map((b) => <BookingRow key={b.id} booking={b} timeZone={tz} onPress={() => open(b)} />)
                  ) : (
                    <Text style={[styles.empty, { color: colors.textMuted }]}>Nothing waiting for review.</Text>
                  )}
                </>
              ) : null}

              {canBook ? (
                <>
                  <SectionTitle>Book a space</SectionTitle>
                  <FormError message={spaces.error ? errorMessage(spaces.error) : null} />
                  {(spaces.data ?? []).filter((s) => s.enabled).map((s) => (
                    <ListRow
                      key={s.spaceId}
                      title={s.spaceName}
                      subtitle={rulesSummary(s)}
                      leading={<Text style={{ fontSize: 28 }}>🗓</Text>}
                      onPress={() => router.push(`/buildings/${buildingId}/bookings/new?spaceId=${s.spaceId}`)}
                    />
                  ))}
                  {spaces.data && !spaces.data.some((s) => s.enabled) ? (
                    <Text style={[styles.empty, { color: colors.textMuted }]}>No spaces can be booked in this building yet.</Text>
                  ) : null}
                </>
              ) : null}

              <SectionTitle>My bookings</SectionTitle>
              <FormError message={mine.error ? errorMessage(mine.error) : null} />
              {upcoming.map((b) => (
                <BookingRow key={b.id} booking={b} timeZone={tz} onPress={() => open(b)} />
              ))}
              {!upcoming.length && mine.data ? (
                <Text style={[styles.empty, { color: colors.textMuted }]}>No upcoming bookings.</Text>
              ) : null}
              {past.length ? (
                <>
                  <SectionTitle>Past</SectionTitle>
                  <View style={{ gap: spacing.sm, opacity: 0.75 }}>
                    {past.map((b) => (
                      <BookingRow key={b.id} booking={b} timeZone={tz} onPress={() => open(b)} />
                    ))}
                  </View>
                </>
              ) : null}
              {!canBook && !canManage ? (
                <Card>
                  <Text style={{ color: colors.textMuted }}>Your role can't book spaces in this building.</Text>
                </Card>
              ) : null}
            </ScrollView>
          );
        }}
      </QueryGate>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl },
  empty: { fontSize: 15, marginHorizontal: spacing.xs },
});
