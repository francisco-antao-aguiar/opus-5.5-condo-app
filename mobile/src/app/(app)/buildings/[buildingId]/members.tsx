import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { MemberDto } from '@condo/shared';
import { Badge, RoleBadge } from '../../../../components/Badges';
import { EmptyView, QueryGate } from '../../../../components/StateView';
import { useMembers } from '../../../../hooks/queries';
import { formatDate, isPast, roleLabel } from '../../../../lib/format';
import { radius, spacing, useTheme } from '../../../../theme';

/** Read-only in phase 1; phase 2 adds invites and member management. */
export default function MembersScreen() {
  const { buildingId } = useLocalSearchParams<{ buildingId: string }>();
  const { colors } = useTheme();
  const membersQuery = useMembers(buildingId);
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await membersQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <QueryGate
        queries={[membersQuery]}
        errorSecondaryAction={{ label: 'Back to my buildings', onPress: () => router.dismissTo('/') }}
      >
        {() => (
          <FlatList
            data={membersQuery.data}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            ListEmptyComponent={<EmptyView title="No members" />}
            renderItem={({ item }) => <MemberRow member={item} />}
          />
        )}
      </QueryGate>
    </View>
  );
}

function MemberRow({ member }: { member: MemberDto }) {
  const { colors } = useTheme();
  const expired = member.status === 'EXPIRED' || isPast(member.expiresAt);
  const inactive = member.status !== 'ACTIVE' || expired;
  return (
    <View
      accessible
      style={[styles.row, { backgroundColor: colors.surface, opacity: inactive ? 0.65 : 1 }]}
    >
      <View style={[styles.avatar, { backgroundColor: colors.surfaceAlt }]}>
        <Text style={[styles.avatarText, { color: colors.text }]}>
          {member.displayName.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {member.displayName}
        </Text>
        {/* Email is null unless the viewer may manage this member (privacy). */}
        {member.email ? (
          <Text style={{ color: colors.textMuted, fontSize: 14 }} numberOfLines={1}>
            {member.email}
          </Text>
        ) : null}
        <View style={styles.badges}>
          <RoleBadge label={roleLabel(member.role)} />
          {member.unitName ? (
            <Badge label={member.unitName} color={colors.private} background={colors.privateSoft} />
          ) : null}
          {member.status === 'REVOKED' ? (
            <Badge label="Revoked" color={colors.danger} background={colors.dangerSoft} />
          ) : member.expiresAt ? (
            <Badge
              label={(expired ? 'Expired ' : 'Until ') + formatDate(member.expiresAt)}
              color={expired ? colors.danger : colors.warning}
              background={expired ? colors.dangerSoft : colors.surfaceAlt}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 18, fontWeight: '700' },
  name: { fontSize: 17, fontWeight: '600' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
});
