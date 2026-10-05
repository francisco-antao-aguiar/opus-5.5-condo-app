import { StyleSheet, Text, View } from 'react-native';
import { formatInviteCode, type InvitationDto, type InvitationStatus } from '@condo/shared';
import { formatDate, invitationAccessText, roleLabel } from '../../lib/format';
import { radius, spacing, useTheme, type Palette } from '../../theme';
import { Badge, RoleBadge } from '../Badges';
import { Button } from '../Button';

const STATUS_LABEL: Record<InvitationStatus, string> = {
  ACTIVE: 'Active',
  EXHAUSTED: 'Used up',
  EXPIRED: 'Expired',
  REVOKED: 'Revoked',
  INVALID: 'No longer valid',
};

function statusColors(status: InvitationStatus, colors: Palette) {
  switch (status) {
    case 'ACTIVE':
      return { color: colors.success, background: colors.commonSoft };
    case 'EXHAUSTED':
      return { color: colors.textMuted, background: colors.surfaceAlt };
    default:
      return { color: colors.danger, background: colors.dangerSoft };
  }
}

export function InvitationRow({
  invitation: inv,
  onShare,
  onRevoke,
  revoking,
}: {
  invitation: InvitationDto;
  onShare: () => void;
  onRevoke: () => void;
  revoking?: boolean;
}) {
  const { colors } = useTheme();
  const active = inv.status === 'ACTIVE';
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, opacity: active ? 1 : 0.7 }]}>
      <View style={styles.top}>
        <Text selectable style={[styles.code, { color: colors.text }]}>
          {formatInviteCode(inv.code)}
        </Text>
        <Badge label={STATUS_LABEL[inv.status] ?? inv.status} {...statusColors(inv.status, colors)} />
      </View>
      <View style={styles.badges}>
        <RoleBadge label={roleLabel(inv.role)} />
        <Badge
          label={inv.unitName ?? 'Whole building'}
          color={inv.unitName ? colors.private : colors.common}
          background={inv.unitName ? colors.privateSoft : colors.commonSoft}
        />
      </View>
      <Text style={[styles.meta, { color: colors.textMuted }]}>
        {`Used ${inv.useCount} of ${inv.maxUses}`}
        {` · ${active ? 'valid until' : 'ended'} ${formatDate(inv.expiresAt)}`}
        {` · ${invitationAccessText(inv) ?? 'no end date'}`}
      </Text>
      <Text style={[styles.meta, { color: colors.textMuted }]}>
        {`By ${inv.createdByName} · ${formatDate(inv.createdAt)}`}
      </Text>
      {inv.note ? <Text style={{ color: colors.text, fontSize: 15 }}>“{inv.note}”</Text> : null}
      {active ? (
        <View style={styles.actions}>
          <Button title="Share" variant="secondary" onPress={onShare} style={styles.action} />
          <Button title="Revoke" variant="danger" onPress={onRevoke} loading={revoking} style={styles.action} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  code: { fontSize: 22, fontWeight: '800', letterSpacing: 2, fontVariant: ['tabular-nums'] },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  meta: { fontSize: 14 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  action: { flex: 1, paddingHorizontal: spacing.md },
});
