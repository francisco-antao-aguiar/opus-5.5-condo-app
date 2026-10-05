import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  formatInviteCode,
  type BuildingDto,
  type InvitationDto,
  type MyPermissions,
  type RoleCode,
  type RoleDto,
  type SpaceDto,
  type UUID,
} from '@condo/shared';
import { RoleBadge } from '../../../../components/Badges';
import { Button } from '../../../../components/Button';
import { Chip, ChipGroup, Segmented, Stepper } from '../../../../components/Controls';
import { Card, FormError, ScrollScreen, SectionTitle } from '../../../../components/Layout';
import { EndDatePicker, type EndDateValue } from '../../../../components/members/EndDatePicker';
import { UnitPickerSheet, unitOptions } from '../../../../components/members/UnitPickerSheet';
import { QueryGate, StateView } from '../../../../components/StateView';
import { TextField } from '../../../../components/TextField';
import { useBuilding, useCreateInvitation, useMyPermissions, useRoles, useSpaces } from '../../../../hooks/queries';
import { errorMessage, fieldError } from '../../../../lib/errors';
import { addDays, formatDate, invitationAccessText, roleLabel } from '../../../../lib/format';
import { grantableRoles, scopeFor } from '../../../../lib/memberPermissions';
import { shareInvite } from '../../../../lib/share';
import { radius, spacing, TAP_MIN, useTheme } from '../../../../theme';

export default function InviteScreen() {
  const { buildingId } = useLocalSearchParams<{ buildingId: string }>();
  const buildingQuery = useBuilding(buildingId);
  const permsQuery = useMyPermissions(buildingId);
  const spacesQuery = useSpaces(buildingId);
  const rolesQuery = useRoles();
  return (
    <>
      <Stack.Screen options={{ title: 'Invite people' }} />
      <QueryGate queries={[buildingQuery, permsQuery, spacesQuery, rolesQuery]}>
        {() => (
          <InviteForm
            building={buildingQuery.data!}
            perms={permsQuery.data!}
            spaces={spacesQuery.data!}
            roles={rolesQuery.data!}
          />
        )}
      </QueryGate>
    </>
  );
}

const VALIDITY = [
  { value: 1, label: '1 day' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
];

type AccessMode = 'none' | 'date' | 'days';
const DURATION_PRESETS = [1, 7, 30, 90];
const MAX_DURATION_DAYS = 3650;

function defaultRole(roles: RoleDto[]): RoleCode | null {
  // Most invitations are for tenants; otherwise the least powerful role I can grant.
  return roles.find((r) => r.code === 'TENANT')?.code ?? roles[roles.length - 1]?.code ?? null;
}

function InviteForm({
  building,
  perms,
  spaces,
  roles,
}: {
  building: BuildingDto;
  perms: MyPermissions;
  spaces: SpaceDto[];
  roles: RoleDto[];
}) {
  const { colors } = useTheme();
  const scope = scopeFor(perms, 'MEMBER_INVITE');
  const grantable = useMemo(() => grantableRoles(roles, perms.role), [roles, perms.role]);
  const units = useMemo(() => unitOptions(spaces), [spaces]);
  const lockedUnit = scope === 'OWN_UNIT';

  const [role, setRole] = useState<RoleCode | null>(() => defaultRole(grantable));
  const [unitId, setUnitId] = useState<UUID | null>(lockedUnit ? perms.unitId : null);
  const [pickingUnit, setPickingUnit] = useState(false);
  const [several, setSeveral] = useState(false);
  const [maxUses, setMaxUses] = useState(5);
  const [validDays, setValidDays] = useState(7);
  const [accessMode, setAccessMode] = useState<AccessMode>('none');
  const [membershipEnd, setMembershipEnd] = useState<EndDateValue>({ iso: null, valid: false });
  const [durationDays, setDurationDays] = useState(7);
  const [note, setNote] = useState('');
  const create = useCreateInvitation(building.id);
  const [created, setCreated] = useState<InvitationDto | null>(null);

  if (!scope) {
    return (
      <StateView
        glyph="⛔"
        title="You can't invite people here"
        message="Ask a building admin or manager to invite them."
        action={{ label: 'Back', onPress: () => router.back() }}
      />
    );
  }

  if (created) return <InviteCreated building={building} invitation={created} onAnother={() => { setCreated(null); create.reset(); }} />;

  const unitName = unitId ? (spaces.find((s) => s.id === unitId)?.name ?? 'Unit') : null;
  const accessValid = accessMode !== 'date' || (membershipEnd.valid && !!membershipEnd.iso);
  const canSubmit = !!role && accessValid && (!lockedUnit || !!unitId);

  function submit() {
    if (!role) return;
    create.mutate(
      {
        role,
        unitId,
        maxUses: several ? maxUses : 1,
        expiresAt: addDays(new Date(), validDays).toISOString(),
        // Exactly one of the two (the server rejects both); neither = no end.
        membershipExpiresAt: accessMode === 'date' ? membershipEnd.iso : null,
        membershipDurationDays: accessMode === 'days' ? durationDays : null,
        note: note.trim() || null,
      },
      { onSuccess: setCreated },
    );
  }

  return (
    <ScrollScreen contentStyle={styles.content}>
      <FormError message={create.error ? errorMessage(create.error) : null} />

      <SectionTitle>Role</SectionTitle>
      <ChipGroup>
        {grantable.map((r) => (
          <Chip key={r.code} label={r.name || roleLabel(r.code)} selected={role === r.code} onPress={() => setRole(r.code)} />
        ))}
      </ChipGroup>
      {fieldError(create.error, 'role') ? (
        <Text style={{ color: colors.danger }}>{fieldError(create.error, 'role')}</Text>
      ) : null}

      <SectionTitle>Unit</SectionTitle>
      {lockedUnit ? (
        <Card>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{unitName ?? 'Your unit'}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>You can invite people into your own unit.</Text>
        </Card>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={'Unit: ' + (unitName ?? 'Whole building') + '. Change'}
          onPress={() => setPickingUnit(true)}
          style={({ pressed }) => [
            styles.picker,
            { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <View style={styles.flex}>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{unitName ?? 'Whole building'}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>
              {unitName ? 'They get access to this unit' : 'Not tied to a unit'}
            </Text>
          </View>
          <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Change</Text>
        </Pressable>
      )}
      {fieldError(create.error, 'unitId') ? (
        <Text style={{ color: colors.danger }}>{fieldError(create.error, 'unitId')}</Text>
      ) : null}

      <SectionTitle>How many people</SectionTitle>
      <Segmented
        accessibilityLabel="How many people"
        options={[
          { value: false, label: 'One person' },
          { value: true, label: 'Several' },
        ]}
        value={several}
        onChange={setSeveral}
      />
      {several ? <Stepper label="Up to" value={maxUses} onChange={setMaxUses} min={2} max={500} /> : null}

      <SectionTitle>Invite valid for</SectionTitle>
      <Segmented accessibilityLabel="Invite valid for" options={VALIDITY} value={validDays} onChange={setValidDays} />

      <SectionTitle>Their access</SectionTitle>
      <Segmented
        accessibilityLabel="How long their access lasts"
        options={[
          { value: 'none' as const, label: 'No end' },
          { value: 'date' as const, label: 'Until a date' },
          { value: 'days' as const, label: 'Days after joining' },
        ]}
        value={accessMode}
        onChange={setAccessMode}
      />
      {accessMode === 'date' ? (
        <EndDatePicker initial="m6" allowNone={false} onChange={setMembershipEnd} />
      ) : accessMode === 'days' ? (
        <>
          <ChipGroup>
            {DURATION_PRESETS.map((d) => (
              <Chip
                key={d}
                label={d === 1 ? '1 day' : `${d} days`}
                selected={durationDays === d}
                onPress={() => setDurationDays(d)}
              />
            ))}
          </ChipGroup>
          <Stepper label="Days" value={durationDays} onChange={setDurationDays} min={1} max={MAX_DURATION_DAYS} />
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>
            Counted from the day each person accepts: {invitationAccessText({ membershipExpiresAt: null, membershipDurationDays: durationDays })}.
          </Text>
          {fieldError(create.error, 'membershipDurationDays') ? (
            <Text style={{ color: colors.danger }}>{fieldError(create.error, 'membershipDurationDays')}</Text>
          ) : null}
        </>
      ) : (
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>Access does not expire.</Text>
      )}

      <TextField
        label="Note (optional)"
        value={note}
        onChangeText={setNote}
        placeholder="e.g. Lease Oct 2026 – Sep 2027"
        maxLength={200}
        error={fieldError(create.error, 'note')}
      />

      <Button title="Create invitation" onPress={submit} loading={create.isPending} disabled={!canSubmit} />

      <UnitPickerSheet
        visible={pickingUnit}
        units={units}
        selected={unitId}
        onSelect={setUnitId}
        onClose={() => setPickingUnit(false)}
      />
    </ScrollScreen>
  );
}

function InviteCreated({
  building,
  invitation,
  onAnother,
}: {
  building: BuildingDto;
  invitation: InvitationDto;
  onAnother: () => void;
}) {
  const { colors } = useTheme();
  return (
    <ScrollScreen contentStyle={styles.content}>
      <Card style={styles.result}>
        <Text style={{ color: colors.textMuted, fontSize: 16 }}>Invitation code</Text>
        <Text
          selectable
          accessibilityLabel={'Invitation code ' + invitation.code.split('').join(' ')}
          style={[styles.code, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
        >
          {formatInviteCode(invitation.code)}
        </Text>
        <View style={styles.badges}>
          <RoleBadge label={roleLabel(invitation.role)} />
          <Text style={{ color: colors.textMuted, fontSize: 15 }}>
            {invitation.unitName ? 'of ' + invitation.unitName : 'whole building'}
          </Text>
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center' }}>
          {invitation.maxUses === 1 ? 'For one person' : `For up to ${invitation.maxUses} people`} · valid until{' '}
          {formatDate(invitation.expiresAt)}
          {` · ${invitationAccessText(invitation) ?? 'no end date'}`}
        </Text>
        <Text selectable style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>
          {invitation.joinUrl}
        </Text>
      </Card>
      <Button title="Share invite" onPress={() => void shareInvite(building.name, invitation)} style={styles.big} />
      <Button title="Create another" variant="secondary" onPress={onAnother} />
      <Button title="Done" variant="ghost" onPress={() => router.back()} />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { maxWidth: 560, width: '100%', alignSelf: 'center' },
  picker: {
    minHeight: TAP_MIN + 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  result: { alignItems: 'center', paddingVertical: spacing.xl },
  code: {
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: 4,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    overflow: 'hidden',
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  big: { minHeight: 64 },
});
