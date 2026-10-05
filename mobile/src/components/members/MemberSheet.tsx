import { useEffect, useMemo, useState } from 'react';
import { Text } from 'react-native';
import type { MemberDto, UUID } from '@condo/shared';
import { toMemberUpdate, useRevokeMember, useUpdateMember } from '../../hooks/queries';
import { confirm } from '../../lib/confirm';
import { errorMessage } from '../../lib/errors';
import { formatDate, isPast, roleLabel } from '../../lib/format';
import { useTheme } from '../../theme';
import { Button } from '../Button';
import { FormError, SectionTitle } from '../Layout';
import { Sheet } from '../Sheet';
import { EndDatePicker, type EndDateValue } from './EndDatePicker';

export function isMemberExpired(m: Pick<MemberDto, 'status' | 'expiresAt'>): boolean {
  return m.status === 'EXPIRED' || (m.status === 'ACTIVE' && isPast(m.expiresAt));
}

/**
 * Manage one member: change the membership end date (extend / set / clear), restore an expired
 * member with a new future end date, or revoke access. Sends a full replace with `version`.
 */
export function MemberSheet({
  buildingId,
  member,
  onClose,
}: {
  buildingId: UUID;
  /** Latest copy from the members query (so a conflict refetch shows fresh data); null = closed. */
  member: MemberDto | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const update = useUpdateMember(buildingId);
  const revoke = useRevokeMember(buildingId);
  const [endDate, setEndDate] = useState<EndDateValue>({ iso: null, valid: false });

  useEffect(() => {
    update.reset();
    revoke.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id]);

  const expired = member ? isMemberExpired(member) : false;
  // Extending counts from the current end date when it's still ahead, else from today.
  const base = useMemo(() => {
    const now = new Date();
    const end = member?.expiresAt ? new Date(member.expiresAt) : null;
    return end && end > now ? end : now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.id, member?.version]);

  if (!member) return <Sheet visible={false} title="" onClose={onClose}>{null}</Sheet>;
  const m = member;

  function save() {
    update.mutate(
      { memberId: m.id, req: toMemberUpdate(m, { expiresAt: endDate.iso }) },
      {
        onSuccess: onClose,
        // On 409 the hook refetches; the sheet re-renders with the latest member and keeps the message.
      },
    );
  }

  async function onRevoke() {
    const ok = await confirm(
      'Revoke access for ' + m.displayName + '?',
      'They lose access to the building immediately. You can invite them again later.',
      'Revoke',
    );
    if (!ok) return;
    revoke.mutate(m.id, { onSuccess: onClose });
  }

  const error = update.error ?? revoke.error;
  const unchanged = !expired && endDate.iso === m.expiresAt;

  return (
    <Sheet visible title={m.displayName} onClose={onClose}>
      <Text style={{ color: colors.textMuted, fontSize: 15 }}>
        {roleLabel(m.role)}
        {m.unitName ? ' · ' + m.unitName : ''}
        {m.invitedByName ? ' · invited by ' + m.invitedByName : ''}
      </Text>
      <FormError message={error ? errorMessage(error) : null} />
      <SectionTitle>{expired ? 'Restore access until' : 'Access until'}</SectionTitle>
      {expired ? (
        <Text style={{ color: colors.danger, fontSize: 15 }}>
          Access ended {formatDate(m.expiresAt)}. Pick a new end date (or none) to let them back in.
        </Text>
      ) : null}
      <EndDatePicker
        // Remount on a new version so a conflict refetch resets the choice to the latest value.
        key={m.id + ':' + m.version}
        base={base}
        current={expired ? undefined : m.expiresAt}
        allowNone
        initial={expired ? 'm6' : undefined}
        onChange={setEndDate}
      />
      <Button
        title={expired ? 'Restore access' : 'Save end date'}
        onPress={save}
        loading={update.isPending}
        disabled={!endDate.valid || unchanged || revoke.isPending}
      />
      {m.status === 'ACTIVE' ? (
        <Button title="Revoke access" variant="danger" onPress={onRevoke} loading={revoke.isPending} disabled={update.isPending} />
      ) : null}
    </Sheet>
  );
}
