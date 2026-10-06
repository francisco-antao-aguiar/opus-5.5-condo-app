import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BookingDto, BookingPolicyDto, BookingStatus } from '@condo/shared';
import { formatRange } from '../../lib/time';
import { radius, spacing, TAP_MIN, useTheme, type Palette } from '../../theme';
import { Badge } from '../Badges';

const STATUS_LABEL: Record<BookingStatus, string> = {
  PENDING: 'Waiting for approval',
  CONFIRMED: 'Confirmed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

function statusColors(s: BookingStatus, colors: Palette) {
  switch (s) {
    case 'PENDING':
      return { color: colors.warning, background: colors.surfaceAlt };
    case 'CONFIRMED':
      return { color: colors.success, background: colors.commonSoft };
    default:
      return { color: colors.danger, background: colors.dangerSoft };
  }
}

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const { colors } = useTheme();
  return <Badge label={STATUS_LABEL[status] ?? status} {...statusColors(status, colors)} />;
}

export function BookingRow({ booking, timeZone, onPress }: { booking: BookingDto; timeZone: string; onPress: () => void }) {
  const { colors } = useTheme();
  const who = [booking.requestedByName, booking.unitName].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceAlt : colors.surface }]}
    >
      <Text style={{ fontSize: 26 }}>📅</Text>
      <View style={styles.flex}>
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{booking.spaceName}</Text>
        <Text style={{ color: colors.text, fontSize: 15 }}>{formatRange(booking.startsAt, booking.endsAt, timeZone)}</Text>
        {who && !booking.mine ? <Text style={{ color: colors.textMuted, fontSize: 14 }}>{who}</Text> : null}
        <View style={styles.badges}>
          <BookingStatusBadge status={booking.status} />
        </View>
      </View>
    </Pressable>
  );
}

function hours(min: number): string {
  if (min % 60 === 0) return `${min / 60} h`;
  return min > 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
}

/** "1–4 h · book up to 30 days ahead · 2 per unit · cancel until 24 h before". */
export function rulesSummary(p: BookingPolicyDto): string {
  return [
    p.minMinutes === p.maxMinutes ? hours(p.minMinutes) : `${hours(p.minMinutes)}–${hours(p.maxMinutes)}`,
    `up to ${p.advanceDays} days ahead`,
    p.maxActivePerUnit ? `${p.maxActivePerUnit} upcoming per unit` : null,
    `cancel until ${p.cancelCutoffHours} h before`,
  ]
    .filter(Boolean)
    .join(' · ');
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    minHeight: TAP_MIN + 8,
    alignItems: 'center',
  },
  badges: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
});
