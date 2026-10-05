import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import {
  buildSpaceTree,
  canDo,
  spacePath,
  SPACE_TYPE_LABELS,
  type BuildingDto,
  type MyPermissions,
  type SpaceDto,
  type SpaceNode,
  type UUID,
} from '@condo/shared';
import { useBuilding, useGovernanceModes, useLeaveBuilding, useMyPermissions, useSpaces } from '../../hooks/queries';
import { confirm } from '../../lib/confirm';
import { errorMessage } from '../../lib/errors';
import { canInvite } from '../../lib/memberPermissions';
import { roleLabel } from '../../lib/format';
import { radius, spacing, useTheme } from '../../theme';
import { RoleBadge, SpaceTypeIcon, VisibilityBadge } from '../Badges';
import { Button } from '../Button';
import { Card, FormError } from '../Layout';
import { IconButton, ListRow } from '../ListRow';
import { EmptyView, QueryGate, StateView } from '../StateView';
import { AddSpaceSheet, EditSpaceSheet } from './SpaceSheets';

interface Props {
  buildingId: UUID;
  /** Current node; omitted = building root. */
  spaceId?: UUID;
}

const buildingHref = (b: UUID) => `/buildings/${b}` as const;
const spaceHref = (b: UUID, s: UUID) => `/buildings/${b}/spaces/${s}` as const;

export function SpaceBrowser({ buildingId, spaceId }: Props) {
  const buildingQuery = useBuilding(buildingId);
  const permsQuery = useMyPermissions(buildingId);
  const spacesQuery = useSpaces(buildingId);

  return (
    <QueryGate
      queries={[buildingQuery, permsQuery, spacesQuery]}
      errorSecondaryAction={{ label: 'Back to my buildings', onPress: () => router.dismissTo('/') }}
    >
      {() => (
        <SpaceBrowserContent
          building={buildingQuery.data!}
          perms={permsQuery.data!}
          spaces={spacesQuery.data!}
          spaceId={spaceId ?? buildingQuery.data!.rootSpaceId}
          isRootScreen={!spaceId}
          refetch={() => Promise.all([buildingQuery.refetch(), permsQuery.refetch(), spacesQuery.refetch()])}
        />
      )}
    </QueryGate>
  );
}

function indexTree(root: SpaceNode | null): Map<UUID, SpaceNode> {
  const map = new Map<UUID, SpaceNode>();
  const walk = (n: SpaceNode) => {
    map.set(n.id, n);
    n.children.forEach(walk);
  };
  if (root) walk(root);
  return map;
}

function SpaceBrowserContent({
  building,
  perms,
  spaces,
  spaceId,
  isRootScreen,
  refetch,
}: {
  building: BuildingDto;
  perms: MyPermissions;
  spaces: SpaceDto[];
  spaceId: UUID;
  isRootScreen: boolean;
  refetch: () => Promise<unknown>;
}) {
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);
  // Keep the id, not the node: after a refetch (e.g. a 409 CONFLICT) the sheet shows the latest version.
  const [editingId, setEditingId] = useState<UUID | null>(null);

  const nodes = useMemo(() => indexTree(buildSpaceTree(spaces)), [spaces]);
  const current = nodes.get(spaceId);
  const editing = editingId ? (nodes.get(editingId) ?? null) : null;
  const path = useMemo(() => spacePath(spaces, spaceId), [spaces, spaceId]);
  const canEditHere = canDo(perms, 'STRUCTURE_EDIT', spaceId, spaces);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }

  if (!current) {
    return (
      <>
        <Stack.Screen options={{ title: building.name }} />
        <StateView
          glyph="?"
          title="This space no longer exists"
          message="It may have been deleted or moved."
          action={{ label: 'Go to building', onPress: () => router.dismissTo(buildingHref(building.id)) }}
        />
      </>
    );
  }

  const openCrumb = (s: SpaceDto) => {
    if (s.id === spaceId) return;
    router.dismissTo(s.parentId === null ? buildingHref(building.id) : spaceHref(building.id, s.id));
  };

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <Stack.Screen options={{ title: isRootScreen ? 'Building' : current.name }} />
      <FlatList
        data={current.children}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            {isRootScreen ? <BuildingHeader building={building} perms={perms} /> : null}
            {path.length > 1 ? <Breadcrumb path={path} onPress={openCrumb} /> : null}
            {!isRootScreen ? (
              <View style={styles.currentRow}>
                <SpaceTypeIcon type={current.type} size={36} />
                <View style={styles.flex}>
                  <Text style={[styles.currentType, { color: colors.textMuted }]}>
                    {SPACE_TYPE_LABELS[current.type]}
                  </Text>
                  <VisibilityBadge space={current} />
                </View>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyView
            title="Nothing inside yet"
            message={canEditHere ? 'Add floors, units, rooms or common areas.' : undefined}
          />
        }
        renderItem={({ item }) => {
          const count = item.children.length;
          const canEditChild = canDo(perms, 'STRUCTURE_EDIT', item.id, spaces);
          return (
            <ListRow
              title={item.name}
              subtitle={SPACE_TYPE_LABELS[item.type] + (count ? ' · ' + count + (count === 1 ? ' item' : ' items') : '')}
              leading={<SpaceTypeIcon type={item.type} />}
              badges={<VisibilityBadge space={item} />}
              onPress={() => router.push(spaceHref(building.id, item.id))}
              onLongPress={canEditChild ? () => setEditingId(item.id) : undefined}
              accessibilityHint={count ? 'Opens ' + item.name : undefined}
              trailing={
                canEditChild ? (
                  <IconButton glyph={'⋯'} label={'Edit ' + item.name} onPress={() => setEditingId(item.id)} />
                ) : undefined
              }
            />
          );
        }}
        ListFooterComponent={
          canEditHere ? (
            <Button
              title={'Add to ' + (isRootScreen ? building.name : current.name)}
              variant="secondary"
              onPress={() => setAdding(true)}
              style={styles.footer}
            />
          ) : null
        }
      />
      <AddSpaceSheet
        visible={adding}
        buildingId={building.id}
        parent={current}
        onClose={() => setAdding(false)}
      />
      <EditSpaceSheet
        buildingId={building.id}
        node={editing}
        onClose={() => setEditingId(null)}
      />
    </View>
  );
}

function BuildingHeader({ building, perms }: { building: BuildingDto; perms: MyPermissions }) {
  const { colors } = useTheme();
  const modes = useGovernanceModes();
  const modeName = modes.data?.find((m) => m.code === perms.governanceMode)?.name ?? perms.governanceMode;
  const leave = useLeaveBuilding(building.id);

  async function onLeave() {
    const ok = await confirm(
      'Leave ' + building.name + '?',
      "You'll lose access to this building. To come back you'll need a new invitation.",
      'Leave',
    );
    if (!ok) return;
    leave.mutate(perms.membershipId, { onSuccess: () => router.dismissTo('/') });
  }
  return (
    <Card>
      <View style={styles.headerTop}>
        <View style={styles.flex}>
          <Text accessibilityRole="header" style={[styles.buildingName, { color: colors.text }]}>
            {building.name}
          </Text>
          {building.address ? <Text style={{ color: colors.textMuted, fontSize: 15 }}>{building.address}</Text> : null}
        </View>
      </View>
      <View style={styles.badgeRow}>
        <RoleBadge label={roleLabel(perms.role)} />
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>{modeName} governance</Text>
      </View>
      <Button
        title={canInvite(perms) ? 'Members & invitations' : 'Members'}
        variant="secondary"
        onPress={() => router.push(`/buildings/${building.id}/members`)}
      />
      <FormError message={leave.error ? errorMessage(leave.error) : null} />
      <Button title="Leave building" variant="ghost" onPress={onLeave} loading={leave.isPending} />
    </Card>
  );
}

function Breadcrumb({ path, onPress }: { path: SpaceDto[]; onPress: (s: SpaceDto) => void }) {
  const { colors } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.crumbs}
      accessibilityRole="toolbar"
      accessibilityLabel="Location"
    >
      {path.map((s, i) => {
        const last = i === path.length - 1;
        return (
          <View key={s.id} style={styles.crumbItem}>
            {i > 0 ? <Text style={{ color: colors.textMuted, fontSize: 16 }}>{'›'}</Text> : null}
            <Pressable
              accessibilityRole="link"
              accessibilityState={{ selected: last }}
              disabled={last}
              onPress={() => onPress(s)}
              hitSlop={6}
              style={({ pressed }) => [
                styles.crumb,
                { backgroundColor: last ? colors.surfaceAlt : 'transparent', opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text
                style={{ color: last ? colors.text : colors.primary, fontSize: 15, fontWeight: last ? '700' : '500' }}
                numberOfLines={1}
              >
                {s.name}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, flexGrow: 1 },
  header: { gap: spacing.md, marginBottom: spacing.md },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start' },
  buildingName: { fontSize: 24, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  crumbs: { alignItems: 'center', gap: spacing.xs },
  crumbItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  crumb: { minHeight: 36, paddingHorizontal: spacing.sm, borderRadius: radius.sm, justifyContent: 'center' },
  currentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  currentType: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  footer: { marginTop: spacing.lg },
});
