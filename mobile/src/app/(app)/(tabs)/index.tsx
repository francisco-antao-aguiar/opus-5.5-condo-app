import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import type { BuildingDto, MembershipSummary } from '@condo/shared';
import { useAuth } from '../../../auth/AuthProvider';
import { Badge, RoleBadge } from '../../../components/Badges';
import { Button } from '../../../components/Button';
import { ListRow } from '../../../components/ListRow';
import { QueryGate, StateView } from '../../../components/StateView';
import { useBuildings } from '../../../hooks/queries';
import { formatDate, isPast, roleLabel } from '../../../lib/format';
import { spacing, useTheme } from '../../../theme';

interface Row {
  building: BuildingDto;
  membership: MembershipSummary | undefined;
}

export default function BuildingsScreen() {
  const { colors } = useTheme();
  const { meQuery } = useAuth();
  const buildingsQuery = useBuildings();
  const [refreshing, setRefreshing] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const byBuilding = new Map((meQuery.data?.memberships ?? []).map((m) => [m.buildingId, m]));
    return (buildingsQuery.data ?? []).map((building) => ({ building, membership: byBuilding.get(building.id) }));
  }, [buildingsQuery.data, meQuery.data]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([buildingsQuery.refetch(), meQuery.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  const goCreate = () => router.push('/buildings/new');
  const goJoin = () => router.push('/join');

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <QueryGate queries={[buildingsQuery, meQuery]}>
        {() => (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.building.id}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
            ListEmptyComponent={
              <StateView
                glyph={'⌂'}
                title="No buildings yet"
                message="Got an invitation? Enter its code to join your building — or create a new one."
                action={{ label: 'Join with a code', onPress: goJoin }}
                secondaryAction={{ label: 'Create building', onPress: goCreate }}
              />
            }
            renderItem={({ item: { building, membership } }) => {
              const expired = isPast(membership?.expiresAt);
              return (
                <ListRow
                  title={building.name}
                  subtitle={[building.address, membership?.unitName].filter(Boolean).join(' · ') || undefined}
                  onPress={() => router.push(`/buildings/${building.id}`)}
                  badges={
                    <>
                      {membership ? <RoleBadge label={roleLabel(membership.role)} /> : null}
                      {membership?.expiresAt ? (
                        <Badge
                          label={(expired ? 'Expired ' : 'Until ') + formatDate(membership.expiresAt)}
                          color={expired ? colors.danger : colors.warning}
                          background={expired ? colors.dangerSoft : colors.surfaceAlt}
                        />
                      ) : null}
                    </>
                  }
                />
              );
            }}
            ListFooterComponent={
              rows.length > 0 ? (
                <View style={styles.footer}>
                  <Button title="Join with a code" variant="secondary" onPress={goJoin} />
                  <Button title="Create building" variant="ghost" onPress={goCreate} />
                </View>
              ) : null
            }
          />
        )}
      </QueryGate>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, flexGrow: 1 },
  footer: { marginTop: spacing.xl, gap: spacing.sm },
});
