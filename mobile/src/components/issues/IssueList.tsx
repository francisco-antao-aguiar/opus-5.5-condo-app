import { useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { canDo, type MyPermissions, type UUID } from '@condo/shared';
import { useIssueList, type IssueListView, type IssueStatusFilter } from '../../hooks/queries';
import { spacing, useTheme } from '../../theme';
import { Button } from '../Button';
import { Chip, ChipGroup, Segmented } from '../Controls';
import { EmptyView, ErrorView } from '../StateView';
import { IssueRow } from './IssueParts';
import { PendingReports } from './PendingReports';

const EMPTY_COPY: Record<IssueListView, { title: string; message: string }> = {
  mine: { title: 'Nothing reported yet', message: 'Problems you report or say “me too” to show up here.' },
  shared: { title: 'No open issues', message: 'Problems in shared areas of the building show up here.' },
  unit: { title: 'Nothing in your unit', message: 'Private problems reported in your unit show up here.' },
  triage: { title: 'Nothing to handle', message: 'Issues you can manage show up here.' },
};

/** Views available to me: Mine always; Building (shared); My unit when I have one; Manage for triagers. */
export function viewsFor(perms: MyPermissions | undefined): { value: IssueListView; label: string }[] {
  const views: { value: IssueListView; label: string }[] = [
    { value: 'mine', label: 'Mine' },
    { value: 'shared', label: 'Building' },
  ];
  if (perms?.unitId) views.push({ value: 'unit', label: 'My unit' });
  if (perms && canDo(perms, 'ISSUE_TRIAGE')) views.push({ value: 'triage', label: 'Manage' });
  return views;
}

/** Issue list for one building: view + open/all switch, newest activity first, pull to refresh, paging. */
export function IssueList({
  buildingId,
  perms,
  header,
}: {
  buildingId: UUID;
  perms: MyPermissions | undefined;
  header?: ReactElement | null;
}) {
  const { colors } = useTheme();
  const views = viewsFor(perms);
  const [view, setView] = useState<IssueListView>('mine');
  const [status, setStatus] = useState<IssueStatusFilter>('open');
  const [maintenanceOnly, setMaintenanceOnly] = useState(false);
  const kind = view === 'triage' && maintenanceOnly ? ('SCHEDULED' as const) : undefined;
  const query = useIssueList(buildingId, view, status, true, kind);
  const [refreshing, setRefreshing] = useState(false);
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  async function onRefresh() {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      onEndReached={() => {
        if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
      }}
      onEndReachedThreshold={0.5}
      ListHeaderComponent={
        <View style={styles.header}>
          {header}
          <PendingReports buildingId={buildingId} />
          {views.length > 1 ? (
            <Segmented accessibilityLabel="Which issues" options={views} value={view} onChange={setView} />
          ) : null}
          {view === 'triage' ? (
            <ChipGroup>
              <Chip label="Everything" selected={!maintenanceOnly} onPress={() => setMaintenanceOnly(false)} />
              <Chip label="🛠 Maintenance" selected={maintenanceOnly} onPress={() => setMaintenanceOnly(true)} />
            </ChipGroup>
          ) : null}
          <Segmented
            accessibilityLabel="Status"
            options={[
              { value: 'open' as const, label: 'Open' },
              { value: 'all' as const, label: 'All' },
            ]}
            value={status}
            onChange={setStatus}
          />
        </View>
      }
      ListEmptyComponent={
        query.isPending ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        ) : query.isError ? (
          <View style={{ minHeight: 280 }}>
            <ErrorView error={query.error} onRetry={() => void query.refetch()} />
          </View>
        ) : (
          <EmptyView {...EMPTY_COPY[view]} />
        )
      }
      renderItem={({ item }) => (
        <IssueRow issue={item} onPress={() => router.push(`/buildings/${buildingId}/issues/${item.id}`)} />
      )}
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
        ) : query.hasNextPage ? (
          <Button title="Load more" variant="ghost" onPress={() => void query.fetchNextPage()} />
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.md },
});
