import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ApiError, type BookingDto, type BookingPolicyDto, type BusySlot, type LocalDate, type UUID } from '@condo/shared';
import { rulesSummary } from '../../../../../components/bookings/BookingParts';
import { Button } from '../../../../../components/Button';
import { Chip, ChipGroup } from '../../../../../components/Controls';
import { Card, FormError, SectionTitle } from '../../../../../components/Layout';
import { LoadingView, QueryGate, StateView } from '../../../../../components/StateView';
import { TextField } from '../../../../../components/TextField';
import { useAvailability, useBookableSpaces, useRequestBooking } from '../../../../../hooks/queries';
import { errorMessage } from '../../../../../lib/errors';
import {
  addDaysLocal,
  formatInZone,
  formatLocalDate,
  formatRange,
  formatTime,
  hhmmOf,
  minutesOf,
  todayIn,
  weekdayOf,
  zonedToEpoch,
  zoneNote,
} from '../../../../../lib/time';
import { radius, spacing, TAP_MIN, useTheme } from '../../../../../theme';

/** Request a booking: day strip → slots → start/end (or a duration) → rules → "Request booking". */
export default function NewBookingScreen() {
  const { buildingId, spaceId } = useLocalSearchParams<{ buildingId: string; spaceId: string }>();
  const spaces = useBookableSpaces(buildingId);
  return (
    <>
      <Stack.Screen options={{ title: 'Book a space' }} />
      <QueryGate queries={[spaces]}>
        {() => {
          const policy = spaces.data!.find((s) => s.spaceId === spaceId);
          if (!policy || !policy.enabled) {
            return (
              <StateView
                glyph="🗓"
                title="This space can't be booked"
                message="It may have been closed for bookings."
                action={{ label: 'Back', onPress: () => router.back() }}
              />
            );
          }
          return <BookingForm buildingId={buildingId} policy={policy} />;
        }}
      </QueryGate>
    </>
  );
}

interface Slot {
  start: number;
  end: number;
  /** Index of the opening range it belongs to (slots of different ranges aren't contiguous). */
  range: number;
  busy: BusySlot | null;
}

function buildSlots(day: LocalDate, policy: BookingPolicyDto, busy: BusySlot[]): Slot[] {
  const tz = policy.timeZone;
  const ranges = policy.openingHours[weekdayOf(day)] ?? [];
  const slots: Slot[] = [];
  ranges.forEach(([open, close], range) => {
    for (let m = minutesOf(open); m + policy.slotMinutes <= minutesOf(close); m += policy.slotMinutes) {
      const start = zonedToEpoch(day, hhmmOf(m), tz);
      const end = zonedToEpoch(day, hhmmOf(m + policy.slotMinutes), tz);
      const hit =
        busy.find((b) => new Date(b.startsAt).getTime() < end && new Date(b.endsAt).getTime() > start) ?? null;
      slots.push({ start, end, range, busy: hit });
    }
  });
  return slots;
}

function durationLabel(min: number): string {
  if (min < 60) return `${min} min`;
  return min % 60 ? `${Math.floor(min / 60)} h ${min % 60}` : `${min / 60} h`;
}

function BookingForm({ buildingId, policy }: { buildingId: UUID; policy: BookingPolicyDto }) {
  const { colors } = useTheme();
  const tz = policy.timeZone;
  const today = todayIn(tz);
  const days = useMemo(
    () => Array.from({ length: Math.min(policy.advanceDays, 60) + 1 }, (_, i) => addDaysLocal(today, i)),
    [today, policy.advanceDays],
  );
  const isOpen = (d: LocalDate) => (policy.openingHours[weekdayOf(d)] ?? []).length > 0;
  const [day, setDay] = useState<LocalDate>(() => days.find(isOpen) ?? today);
  const [startIdx, setStartIdx] = useState<number | null>(null);
  const [endIdx, setEndIdx] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState<BookingDto | null>(null);
  const request = useRequestBooking(buildingId);

  const from = new Date(zonedToEpoch(day, '00:00', tz)).toISOString();
  const to = new Date(zonedToEpoch(addDaysLocal(day, 1), '00:00', tz)).toISOString();
  const availability = useAvailability(buildingId, policy.spaceId, day, from, to);
  const now = Date.now();
  // Past slots are hidden; closed days have none.
  const slots = useMemo(
    () => buildSlots(day, availability.data?.policy ?? policy, availability.data?.busy ?? []).filter((s) => s.start > now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day, availability.data, policy],
  );

  const slotCount = (min: number) => Math.round(min / policy.slotMinutes);
  const durations = useMemo(() => {
    const all: number[] = [];
    for (let d = policy.minMinutes; d <= policy.maxMinutes; d += policy.slotMinutes) all.push(d);
    return all.length > 8 ? all.filter((d, i) => i === 0 || d % 60 === 0).slice(0, 8) : all;
  }, [policy]);

  function selectDay(d: LocalDate) {
    setDay(d);
    setStartIdx(null);
    setEndIdx(null);
    setNotice(null);
    request.reset();
  }

  /** Problem with the chosen range, or null if it can be requested. */
  function rangeProblem(s: number, e: number): string | null {
    if (e >= slots.length) return 'Not enough time left before closing.';
    for (let i = s; i <= e; i++) {
      if (slots[i].busy) return 'Part of that time is already taken.';
      if (i > s && (slots[i].range !== slots[s].range || slots[i].start !== slots[i - 1].end)) {
        return 'That runs past the opening hours.';
      }
    }
    const minutes = (slots[e].end - slots[s].start) / 60_000;
    if (minutes < policy.minMinutes) return `Book at least ${durationLabel(policy.minMinutes)}.`;
    if (minutes > policy.maxMinutes) return `Book at most ${durationLabel(policy.maxMinutes)}.`;
    return null;
  }

  function tapSlot(i: number) {
    if (slots[i].busy) return;
    setNotice(null);
    request.reset();
    if (startIdx === null || i < startIdx || (endIdx !== null && i <= endIdx && i !== startIdx)) {
      setStartIdx(i);
      setEndIdx(i + slotCount(policy.minMinutes) - 1);
      return;
    }
    if (i === startIdx) {
      setStartIdx(null);
      setEndIdx(null);
      return;
    }
    setEndIdx(i);
  }

  const problem = startIdx !== null && endIdx !== null ? rangeProblem(startIdx, endIdx) : null;
  const chosen = startIdx !== null && endIdx !== null && !problem ? { start: slots[startIdx].start, end: slots[endIdx].end } : null;

  function submit() {
    if (!chosen) return;
    request.mutate(
      {
        spaceId: policy.spaceId,
        startsAt: new Date(chosen.start).toISOString(),
        endsAt: new Date(chosen.end).toISOString(),
        note: note.trim() || null,
      },
      {
        onSuccess: setDone,
        onError: (e) => {
          if (e instanceof ApiError && e.problem.code === 'BOOKING_CONFLICT') {
            setNotice('Someone just requested this slot — the free times have been refreshed.');
            setStartIdx(null);
            setEndIdx(null);
            void availability.refetch();
          }
        },
      },
    );
  }

  if (done) {
    return (
      <StateView
        glyph="⏳"
        title="Waiting for an admin to approve"
        message={`${policy.spaceName}, ${formatRange(done.startsAt, done.endsAt, tz)}. The time is held for you; you'll get a notification when it's decided.`}
        action={{ label: 'View booking', onPress: () => router.replace(`/buildings/${buildingId}/bookings/${done.id}`) }}
        secondaryAction={{ label: 'My bookings', onPress: () => router.back() }}
      />
    );
  }

  const tzNote = zoneNote(tz);
  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{policy.spaceName}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>{policy.locationLabel}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>{rulesSummary(policy)}</Text>
        {tzNote ? <Text style={{ color: colors.warning, fontSize: 13 }}>{tzNote}</Text> : null}
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
        {days.map((d) => {
          const selected = d === day;
          const open = isOpen(d);
          return (
            <Pressable
              key={d}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: !open }}
              accessibilityLabel={formatLocalDate(d) + (open ? '' : ', closed')}
              disabled={!open}
              onPress={() => selectDay(d)}
              style={[
                styles.day,
                {
                  backgroundColor: selected ? colors.primary : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                  opacity: open ? 1 : 0.35,
                },
              ]}
            >
              <Text style={{ color: selected ? colors.primaryText : colors.textMuted, fontSize: 13, fontWeight: '600' }}>
                {formatLocalDate(d, { weekday: 'short' })}
              </Text>
              <Text style={{ color: selected ? colors.primaryText : colors.text, fontSize: 20, fontWeight: '800' }}>
                {formatLocalDate(d, { day: 'numeric' })}
              </Text>
              <Text style={{ color: selected ? colors.primaryText : colors.textMuted, fontSize: 11 }}>
                {formatLocalDate(d, { month: 'short' })}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <SectionTitle>{formatLocalDate(day, { weekday: 'long', day: 'numeric', month: 'long' })}</SectionTitle>
      {notice ? <FormError message={notice} /> : null}
      {availability.isPending ? (
        <LoadingView />
      ) : availability.isError ? (
        <FormError message={errorMessage(availability.error)} />
      ) : slots.length === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 15 }}>No free times left on this day.</Text>
      ) : (
        <>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            {startIdx === null ? 'Tap when you want to start.' : 'Tap another time to end there, or pick a duration.'}
          </Text>
          <View style={styles.slots}>
            {slots.map((s, i) => {
              const inRange = startIdx !== null && endIdx !== null && i >= startIdx && i <= endIdx;
              const label = s.busy ? (s.busy.mine ? 'Yours' : s.busy.status === 'PENDING' ? 'Requested' : 'Booked') : null;
              return (
                <Pressable
                  key={s.start}
                  accessibilityRole="button"
                  accessibilityState={{ selected: inRange, disabled: !!s.busy }}
                  accessibilityLabel={formatTime(s.start, tz) + (label ? ', ' + label : '')}
                  disabled={!!s.busy}
                  onPress={() => tapSlot(i)}
                  style={[
                    styles.slot,
                    {
                      backgroundColor: inRange ? colors.primary : s.busy ? colors.surfaceAlt : colors.surface,
                      borderColor: inRange ? colors.primary : s.busy?.status === 'PENDING' ? colors.warning : colors.border,
                      borderStyle: s.busy?.status === 'PENDING' ? 'dashed' : 'solid',
                    },
                  ]}
                >
                  <Text
                    style={{
                      color: inRange ? colors.primaryText : s.busy ? colors.textMuted : colors.text,
                      fontSize: 16,
                      fontWeight: '700',
                      textDecorationLine: s.busy ? 'line-through' : 'none',
                    }}
                  >
                    {formatTime(s.start, tz)}
                  </Text>
                  {label ? <Text style={{ color: colors.textMuted, fontSize: 11 }}>{label}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {startIdx !== null ? (
        <>
          <SectionTitle>How long</SectionTitle>
          <ChipGroup>
            {durations.map((d) => {
              const e = startIdx + slotCount(d) - 1;
              return (
                <Chip key={d} label={durationLabel(d)} selected={endIdx === e} onPress={() => setEndIdx(e)} />
              );
            })}
          </ChipGroup>
        </>
      ) : null}

      {problem ? <FormError message={problem} /> : null}

      {chosen ? (
        <Card>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>
            {formatInZone(chosen.start, tz, { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <Text style={{ color: colors.text, fontSize: 18 }}>
            {formatTime(chosen.start, tz)}–{formatTime(chosen.end, tz)} ({durationLabel((chosen.end - chosen.start) / 60_000)})
          </Text>
          {policy.rulesText ? (
            <>
              <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' }}>House rules</Text>
              <Text style={{ color: colors.text, fontSize: 15 }}>{policy.rulesText}</Text>
            </>
          ) : null}
          <TextField
            label="Note for the admin (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Birthday, about 20 people"
            maxLength={500}
          />
          <FormError message={request.error && !notice ? errorMessage(request.error) : null} />
          <Button title="Request booking" onPress={submit} loading={request.isPending} style={{ minHeight: 64 }} />
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            An admin reviews every request. By requesting you agree to the house rules.
          </Text>
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl, maxWidth: 640, width: '100%', alignSelf: 'center' },
  days: { gap: spacing.sm },
  day: { width: 64, minHeight: 76, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slot: {
    width: 84,
    minHeight: TAP_MIN - 4,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
