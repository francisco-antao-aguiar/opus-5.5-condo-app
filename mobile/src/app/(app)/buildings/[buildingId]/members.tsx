import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatInviteCode, type BuildingDto, type InvitationDto, type MemberDto, type MyPermissions, type RoleDto, type SpaceDto, type UUID } from '@condo/shared';
import { Badge, RoleBadge } from '../../../../components/Badges';
import { Button } from '../../../../components/Button';
import { FormError } from '../../../../components/Layout';
import { InvitationRow } from '../../../../components/members/InvitationRow';
import { isMemberExpired, MemberSheet } from '../../../../components/members/MemberSheet';
import { QueryGate } from '../../../../components/StateView';
import {
  useBuilding,
  useInvitations,
  useMembers,
  useMyPermissions,
  useRevokeInvitation,
  useRoles,
  useSpaces,
} from '../../../../hooks/queries';
import { confirm } from '../../../../lib/confirm';
import { errorMessage } from '../../../../lib/errors';
import { formatDate, roleLabel } from '../../../../lib/format';
import { canInvite, canManageMember, rankOf } from '../../../../lib/memberPermissions';
import { shareInvite } from '../../../../lib/share';
import { radius, spacing, TAP_MIN, useTheme } from '../../../../theme';

type Item = { kind: 'invitation'; invitation: InvitationDto } | { kind: 'member'; member: MemberDto };

/** Members (manageable ones get a "Manage" action) plus, for inviters, the building's invitations. */
export default function MembersScreen() {
  const { buildingId } = useLocalSearchParams<{ buildingId: string }>();
  const membersQuery = useMembers(buildingId);
  const permsQuery = useMyPermissions(buildingId);
  const spacesQuery = useSpaces(buildingId);
  const rolesQuery = useRoles();
  const buildingQuery = useBuilding(buildingId);

  return (
    <QueryGate
      queries={[membersQuery, permsQuery, spacesQuery, rolesQuery, buildingQuery]}
      errorSecondaryAction={{ label: 'Back to my buildings', onPress: () => router.dismissTo('/') }}
    >
      {() => (
        <MembersContent
          building={buildingQuery.data!}
          members={membersQuery.data!}
          perms={permsQuery.data!}
          spaces={spacesQuery.data!}
          roles={rolesQuery.data!}
          refetch={() => Promise.all([membersQuery.refetch(), permsQuery.refetch(), spacesQuery.refetch()])}
        />
      )}
    </QueryGate>
  );
}

const STATUS_ORDER = { ACTIVE: 0, EXPIRED: 1, REVOKED: 2 } as const;

function MembersContent({
  building,
  members,
  perms,
  spaces,
  roles,
  refetch,
}: {
  building: BuildingDto;
  members: MemberDto[];
  perms: MyPermissions;
  spaces: SpaceDto[];
  roles: RoleDto[];
  refetch: () => Promise<unknown>;
}) {
  const { colors } = useTheme();
  const inviter = canInvite(perms);
  const invitationsQuery = useInvitations(building.id, inviter);
  const revokeInvitation = useRevokeInvitation(building.id);
  const [refreshing, setRefreshing] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [managingId, setManagingId] = useState<UUID | null>(null);
  // Always the latest copy, so a 409 refetch updates the open sheet.
  const managing = managingId ? (members.find((m) => m.id === managingId) ?? null) : null;

  const sortedMembers = useMemo(() => {
    const effective = (m: MemberDto) => (isMemberExpired(m) ? 1 : STATUS_ORDER[m.status] ?? 3);
    return [...members].sort(
      (a, b) =>
        effective(a) - effective(b) ||
        (rankOf(roles, b.role) ?? 0) - (rankOf(roles, a.role) ?? 0) ||
        a.displayName.localeCompare(b.displayName),
    );
  }, [members, roles]);

  const invitations = invitationsQuery.data ?? [];
  const activeInvitations = invitations.filter((i) => i.status === 'ACTIVE');
  const pastCount = invitations.length - activeInvitations.length;

  const sections = [
    ...(inviter
      ? [
          {
            key: 'invitations',
            title: 'Invitations',
            data: (showPast ? invitations : activeInvitations).map<Item>((invitation) => ({ kind: 'invitation', invitation })),
          },
        ]
      : []),
    {
      key: 'members',
      title: `Members (${members.filter((m) => m.status === 'ACTIVE' && !isMemberExpired(m)).length} active)`,
      data: sortedMembers.map<Item>((member) => ({ kind: 'member', member })),
    },
  ];

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([refetch(), inviter ? invitationsQuery.refetch() : null]);
    } finally {
      setRefreshing(false);
    }
  }

  async function onRevokeInvitation(inv: InvitationDto) {
    const ok = await confirm(
      'Revoke this invitation?',
      `Code ${formatInviteCode(inv.code)} will stop working. People who already joined keep their access.`,
      'Revoke',
    );
    if (ok) revokeInvitation.mutate(inv.id);
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => (item.kind === 'member' ? 'm' + item.member.id : 'i' + item.invitation.id)}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          inviter ? (
            <Button
              title="Invite people"
              onPress={() => router.push(`/buildings/${building.id}/invite`)}
              style={styles.invite}
            />
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionTitle, { color: colors.textMuted }]}>{section.title}</Text>
        )}
        renderSectionFooter={({ section }) =>
          section.key === 'invitations' ? (
            <View style={styles.sectionFooter}>
              <FormError message={revokeInvitation.error ? errorMessage(revokeInvitation.error) : null} />
              {invitationsQuery.isPending && invitationsQuery.fetchStatus !== 'idle' ? (
                <ActivityIndicator color={colors.primary} />
              ) : invitationsQuery.isError ? (
                <FormError message={errorMessage(invitationsQuery.error)} />
              ) : activeInvitations.length === 0 && !showPast ? (
                <Text style={{ color: colors.textMuted, fontSize: 15 }}>No open invitations.</Text>
              ) : null}
              {pastCount > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setShowPast((v) => !v)}
                  style={styles.toggle}
                  hitSlop={6}
                >
                  <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>
                    {showPast ? 'Hide used, expired and revoked' : `Show used, expired and revoked (${pastCount})`}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null
        }
        renderItem={({ item }) =>
          item.kind === 'invitation' ? (
            <InvitationRow
              invitation={item.invitation}
              onShare={() => void shareInvite(building.name, item.invitation)}
              onRevoke={() => void onRevokeInvitation(item.invitation)}
              revoking={revokeInvitation.isPending && revokeInvitation.variables === item.invitation.id}
            />
          ) : (
            <MemberRow
              member={item.member}
              isMe={item.member.id === perms.membershipId}
              onManage={
                canManageMember(perms, item.member, spaces, roles) && item.member.status !== 'REVOKED'
                  ? () => setManagingId(item.member.id)
                  : undefined
              }
            />
          )
        }
      />
      <MemberSheet buildingId={building.id} member={managing} onClose={() => setManagingId(null)} />
    </View>
  );
}

function MemberRow({ member, isMe, onManage }: { member: MemberDto; isMe: boolean; onManage?: () => void }) {
  const { colors } = useTheme();
  const expired = isMemberExpired(member);
  const inactive = member.status !== 'ACTIVE' || expired;
  const details = [member.email, member.invitedByName ? 'Invited by ' + member.invitedByName : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <View style={[styles.row, { backgroundColor: colors.surface }]}>
      <View style={[styles.rowMain, { opacity: inactive ? 0.7 : 1 }]} accessible>
        <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.avatarText, { color: colors.text }]}>{member.displayName.slice(0, 1).toUpperCase()}</Text>
        </View>
        <View style={styles.flex}>
          <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
            {member.displayName}
            {isMe ? ' (you)' : ''}
          </Text>
          {/* Email is null unless the viewer may manage this member (privacy). */}
          {details ? (
            <Text style={{ color: colors.textMuted, fontSize: 14 }} numberOfLines={2}>
              {details}
            </Text>
          ) : null}
          <View style={styles.badges}>
            <RoleBadge label={roleLabel(member.role)} />
            {member.unitName ? (
              <Badge label={member.unitName} color={colors.private} background={colors.privateSoft} />
            ) : null}
            {member.status === 'REVOKED' ? (
              <Badge label="Revoked" color={colors.danger} background={colors.dangerSoft} />
            ) : expired ? (
              <Badge
                label={'Expired' + (member.expiresAt ? ' ' + formatDate(member.expiresAt) : '')}
                color={colors.danger}
                background={colors.dangerSoft}
              />
            ) : member.expiresAt ? (
              <Badge label={'Until ' + formatDate(member.expiresAt)} color={colors.warning} background={colors.surfaceAlt} />
            ) : null}
          </View>
        </View>
      </View>
      {onManage ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={(expired ? 'Restore access for ' : 'Manage ') + member.displayName}
          onPress={onManage}
          style={({ pressed }) => [styles.manage, { borderTopColor: colors.border, opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={{ color: expired ? colors.danger : colors.primary, fontSize: 16, fontWeight: '600' }}>
            {expired ? 'Restore access' : 'Manage access'}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, flexGrow: 1 },
  invite: { marginBottom: spacing.sm },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.xs,
  },
  sectionFooter: { gap: spacing.sm, marginTop: spacing.sm },
  toggle: { minHeight: 44, justifyContent: 'center' },
  row: { borderRadius: radius.lg, overflow: 'hidden' },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700' },
  name: { fontSize: 17, fontWeight: '600' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  manage: {
    minHeight: TAP_MIN - 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
