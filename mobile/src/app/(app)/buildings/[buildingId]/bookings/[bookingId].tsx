import { useState } from 'react';
import { Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import type { BookingDto } from '@condo/shared';
import { BookingStatusBadge } from '../../../../../components/bookings/BookingParts';
import { Button } from '../../../../../components/Button';
import { Card, FormError, ScrollScreen } from '../../../../../components/Layout';
import { QueryGate } from '../../../../../components/StateView';
import { TextField } from '../../../../../components/TextField';
import { useBooking, useBookingDecision, useBuilding } from '../../../../../hooks/queries';
import { confirm } from '../../../../../lib/confirm';
import { errorMessage } from '../../../../../lib/errors';
import { formatInZone, formatTime, zoneNote } from '../../../../../lib/time';
import { spacing, useTheme } from '../../../../../theme';

/** /buildings/{b}/bookings/{id} — also the target of BOOKING_* notifications. */
export default function BookingScreen() {
  const { buildingId, bookingId } = useLocalSearchParams<{ buildingId: string; bookingId: string }>();
  const booking = useBooking(buildingId, bookingId);
  const building = useBuilding(buildingId);
  return (
    <>
      <Stack.Screen options={{ title: 'Booking' }} />
      <QueryGate
        queries={[booking, building]}
        errorSecondaryAction={{ label: 'Back to building', onPress: () => router.dismissTo(`/buildings/${buildingId}`) }}
      >
        {() => <BookingDetail buildingId={buildingId} booking={booking.data!} timeZone={building.data!.timeZone} />}
      </QueryGate>
    </>
  );
}

function BookingDetail({ buildingId, booking: b, timeZone: tz }: { buildingId: string; booking: BookingDto; timeZone: string }) {
  const { colors } = useTheme();
  const decide = useBookingDecision(buildingId);
  const [note, setNote] = useState('');
  const [current, setCurrent] = useState<BookingDto>(b);
  const shown = current.version >= b.version ? current : b;
  const tzNote = zoneNote(tz);

  function act(action: 'approve' | 'reject' | 'cancel') {
    decide.mutate(
      { id: shown.id, action, note: note.trim() || null },
      {
        onSuccess: (res) => {
          setCurrent(res);
          setNote('');
        },
      },
    );
  }

  async function onCancel() {
    const ok = await confirm(
      'Cancel this booking?',
      shown.status === 'PENDING' ? 'Your request will be withdrawn.' : 'The space will be free for others again.',
      'Cancel booking',
    );
    if (ok) act('cancel');
  }

  return (
    <ScrollScreen>
      <Card>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800' }}>{shown.spaceName}</Text>
        <Text style={{ color: colors.text, fontSize: 18 }}>
          {formatInZone(shown.startsAt, tz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </Text>
        <Text style={{ color: colors.text, fontSize: 18 }}>
          {formatTime(shown.startsAt, tz)}–{formatTime(shown.endsAt, tz)}
        </Text>
        {tzNote ? <Text style={{ color: colors.warning, fontSize: 13 }}>{tzNote}</Text> : null}
        <View style={{ flexDirection: 'row' }}>
          <BookingStatusBadge status={shown.status} />
        </View>
        {shown.status === 'PENDING' ? (
          <Text style={{ color: colors.textMuted, fontSize: 15 }}>
            The time is held while an admin reviews the request.
          </Text>
        ) : null}
        {shown.requestedByName ? (
          <Text style={{ color: colors.textMuted, fontSize: 15 }}>
            Requested by {shown.requestedByName}
            {shown.unitName ? ' · ' + shown.unitName : ''}
          </Text>
        ) : null}
        {shown.note ? <Text style={{ color: colors.text, fontSize: 15 }}>“{shown.note}”</Text> : null}
        {shown.decidedByName ? (
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            Decided by {shown.decidedByName}
            {shown.decidedAt ? ' · ' + formatInZone(shown.decidedAt, tz, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
          </Text>
        ) : null}
        {shown.decisionNote ? (
          <Text style={{ color: shown.status === 'CONFIRMED' ? colors.text : colors.danger, fontSize: 15 }}>
            Reason: {shown.decisionNote}
          </Text>
        ) : null}
      </Card>

      {/* CANCEL_CUTOFF / INVALID_STATE / CONFLICT get friendly copy; the list was refetched meanwhile. */}
      <FormError message={decide.error ? errorMessage(decide.error) : null} />

      {shown.canDecide || shown.canCancel ? (
        <Card>
          <TextField
            label={shown.canDecide ? 'Note for the requester (optional, shown on reject/cancel)' : 'Note (optional)'}
            value={note}
            onChangeText={setNote}
            maxLength={500}
          />
          {shown.canDecide ? (
            <View style={{ gap: spacing.sm }}>
              <Button title="Approve" onPress={() => act('approve')} loading={decide.isPending && decide.variables?.action === 'approve'} style={{ minHeight: 60 }} />
              <Button title="Reject" variant="danger" onPress={() => act('reject')} loading={decide.isPending && decide.variables?.action === 'reject'} />
            </View>
          ) : null}
          {shown.canCancel ? (
            <Button
              title={shown.status === 'PENDING' && shown.mine ? 'Withdraw request' : 'Cancel booking'}
              variant="secondary"
              onPress={() => void onCancel()}
              loading={decide.isPending && decide.variables?.action === 'cancel'}
            />
          ) : null}
        </Card>
      ) : null}
    </ScrollScreen>
  );
}
