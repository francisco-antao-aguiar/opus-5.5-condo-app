import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import {
  canDo,
  type AssetDto,
  type AssetTypeDto,
  type MyPermissions,
  type SpaceDto,
} from '@condo/shared';
import { AssetIcon, AssetTypeGrid, AssetVisibilityBadge } from '../../../../../components/assets/AssetParts';
import { SpacePickerSheet } from '../../../../../components/assets/SpacePickerSheet';
import { Badge } from '../../../../../components/Badges';
import { Button } from '../../../../../components/Button';
import { Card, FormError, ScrollScreen, SectionTitle } from '../../../../../components/Layout';
import { QueryGate, StateView } from '../../../../../components/StateView';
import { TextField } from '../../../../../components/TextField';
import {
  toAssetUpdate,
  useArchiveAsset,
  useAsset,
  useCatalog,
  useMyPermissions,
  useRestoreAsset,
  useSpaces,
  useUpdateAsset,
} from '../../../../../hooks/queries';
import { confirm } from '../../../../../lib/confirm';
import { errorMessage, fieldError } from '../../../../../lib/errors';
import { formatDate } from '../../../../../lib/format';
import { radius, spacing, TAP_MIN, useTheme } from '../../../../../theme';

/**
 * Asset detail: /buildings/{b}/assets/{assetId} (deep-linkable; phase 5 QR links resolve to it).
 * Shows what can be reported about it, and lets editors rename / retype / move / archive it.
 */
export default function AssetScreen() {
  const { buildingId, assetId } = useLocalSearchParams<{ buildingId: string; assetId: string }>();
  const assetQuery = useAsset(buildingId, assetId);
  const permsQuery = useMyPermissions(buildingId);
  const spacesQuery = useSpaces(buildingId);
  const catalogQuery = useCatalog(buildingId);

  return (
    <>
      <Stack.Screen options={{ title: assetQuery.data?.name ?? 'Asset' }} />
      <QueryGate
        queries={[assetQuery, permsQuery, spacesQuery, catalogQuery]}
        errorSecondaryAction={{ label: 'Back to building', onPress: () => router.dismissTo(`/buildings/${buildingId}`) }}
      >
        {() => (
          <AssetDetail
            asset={assetQuery.data!}
            perms={permsQuery.data!}
            spaces={spacesQuery.data!}
            catalog={catalogQuery.data!}
          />
        )}
      </QueryGate>
    </>
  );
}

function AssetDetail({
  asset,
  perms,
  spaces,
  catalog,
}: {
  asset: AssetDto;
  perms: MyPermissions;
  spaces: SpaceDto[];
  catalog: AssetTypeDto[];
}) {
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const archive = useArchiveAsset(asset.buildingId);
  const restore = useRestoreAsset(asset.buildingId);

  const type = catalog.find((t) => t.code === asset.type);
  const problems = (type?.problemTypes ?? []).filter((p) => p.active);
  const canEdit = !asset.archived && !!asset.spaceId && canDo(perms, 'ASSET_EDIT', asset.spaceId, spaces);
  // ASSET_DELETE is checked on the asset's space; an orphaned archived asset needs building-wide rights.
  const canArchive = canDo(perms, 'ASSET_DELETE', asset.spaceId ?? null, spaces);

  async function onArchive() {
    const ok = await confirm(
      `Archive ${asset.name}?`,
      'It disappears from lists and can no longer be reported. Its history and the ID on any printed QR ' +
        'label are kept, so it can be restored later instead of being re-created.',
      'Archive',
    );
    if (!ok) return;
    archive.mutate(asset.id, {
      onSuccess: () =>
        router.canGoBack() ? router.back() : router.replace(`/buildings/${asset.buildingId}`),
    });
  }

  if (editing && canEdit) {
    return <EditAsset asset={asset} perms={perms} spaces={spaces} catalog={catalog} onDone={() => setEditing(false)} />;
  }

  return (
    <ScrollScreen>
      <Card style={styles.hero}>
        <AssetIcon type={asset.type} catalog={catalog} size={72} />
        <Text accessibilityRole="header" style={[styles.name, { color: colors.text }]}>
          {asset.name}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 16 }}>{asset.typeName}</Text>
        <View style={styles.badges}>
          <AssetVisibilityBadge asset={asset} />
          {asset.archived ? (
            <Badge
              label={'Archived' + (asset.archivedAt ? ' ' + formatDate(asset.archivedAt) : '')}
              color={colors.danger}
              background={colors.dangerSoft}
            />
          ) : null}
        </View>
      </Card>

      <SectionTitle>Where</SectionTitle>
      {asset.spaceId ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(`/buildings/${asset.buildingId}/spaces/${asset.spaceId}`)}
          style={({ pressed }) => [styles.where, { backgroundColor: colors.surface, opacity: pressed ? 0.7 : 1 }]}
        >
          <Text style={{ color: colors.text, fontSize: 17, flex: 1 }}>{asset.spacePath || asset.spaceName}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 28, fontWeight: '300' }}>›</Text>
        </Pressable>
      ) : (
        <Card>
          <Text style={{ color: colors.textMuted }}>Its place was deleted.</Text>
        </Card>
      )}

      {asset.notes ? (
        <>
          <SectionTitle>Notes</SectionTitle>
          <Card>
            <Text style={{ color: colors.text, fontSize: 16 }} selectable>
              {asset.notes}
            </Text>
          </Card>
        </>
      ) : null}

      <SectionTitle>Problems you can report</SectionTitle>
      <Card>
        {problems.length ? (
          <>
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>You'll be able to report:</Text>
            <View style={styles.chips}>
              {problems.map((p) => (
                <View key={p.id} style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surfaceAlt }]}>
                  <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{p.label}</Text>
                </View>
              ))}
              <View style={[styles.chip, { borderColor: colors.border }]}>
                <Text style={{ color: colors.textMuted, fontSize: 15 }}>Other…</Text>
              </View>
            </View>
          </>
        ) : (
          <Text style={{ color: colors.textMuted, fontSize: 15 }}>You'll be able to describe any problem in your own words.</Text>
        )}
        <Button title="Report a problem (coming soon)" disabled />
      </Card>

      <FormError message={archive.error ? errorMessage(archive.error) : restore.error ? errorMessage(restore.error) : null} />
      {canEdit ? <Button title="Edit" variant="secondary" onPress={() => setEditing(true)} /> : null}
      {canArchive && !asset.archived ? (
        <Button title="Archive" variant="danger" onPress={onArchive} loading={archive.isPending} />
      ) : null}
      {canArchive && asset.archived && asset.spaceId ? (
        <Button title="Restore" variant="secondary" onPress={() => restore.mutate(asset.id)} loading={restore.isPending} />
      ) : null}
    </ScrollScreen>
  );
}

function EditAsset({
  asset,
  perms,
  spaces,
  catalog,
  onDone,
}: {
  asset: AssetDto;
  perms: MyPermissions;
  spaces: SpaceDto[];
  catalog: AssetTypeDto[];
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const update = useUpdateAsset(asset.buildingId);
  const [name, setName] = useState(asset.name);
  const [type, setType] = useState(asset.type);
  const [notes, setNotes] = useState(asset.notes ?? '');
  const [spaceId, setSpaceId] = useState(asset.spaceId!);
  const [picking, setPicking] = useState(false);

  // A newer version arrived (e.g. after a 409 CONFLICT refetch): show the latest values.
  // The conflict message stays visible because the mutation is not reset.
  useEffect(() => {
    setName(asset.name);
    setType(asset.type);
    setNotes(asset.notes ?? '');
    setSpaceId(asset.spaceId!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.version]);

  // Moving needs ASSET_EDIT on the destination as well.
  const allowed = useCallback((s: SpaceDto) => canDo(perms, 'ASSET_EDIT', s.id, spaces), [perms, spaces]);
  const space = spaces.find((s) => s.id === spaceId);
  const dirty =
    name.trim() !== asset.name || type !== asset.type || (notes.trim() || null) !== asset.notes || spaceId !== asset.spaceId;

  function save() {
    update.mutate(
      {
        assetId: asset.id,
        req: toAssetUpdate(asset, { name: name.trim(), type, notes: notes.trim() || null, spaceId }),
      },
      { onSuccess: onDone },
    );
  }

  if (!asset.spaceId) {
    return <StateView glyph="?" title="This asset has no place" action={{ label: 'Back', onPress: onDone }} />;
  }

  return (
    <ScrollScreen>
      <FormError message={update.error ? errorMessage(update.error) : null} />
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        maxLength={120}
        error={fieldError(update.error, 'name')}
      />
      <SectionTitle>Type</SectionTitle>
      <AssetTypeGrid
        types={catalog}
        selected={type}
        onSelect={(t) => {
          // Follow the type while the name is still the old type's default.
          const oldTypeName = catalog.find((c) => c.code === type)?.name;
          if (name.trim() === oldTypeName) setName(t.name);
          setType(t.code);
        }}
      />
      <SectionTitle>Place</SectionTitle>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'Place: ' + (space?.name ?? '') + '. Move'}
        onPress={() => setPicking(true)}
        style={({ pressed }) => [
          styles.picker,
          { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600', flex: 1 }}>{space?.name ?? '—'}</Text>
        <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Move</Text>
      </Pressable>
      <TextField
        label="Notes (optional)"
        value={notes}
        onChangeText={setNotes}
        placeholder="e.g. Model, location detail, maintenance contact"
        multiline
        maxLength={1000}
        style={{ minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' }}
        error={fieldError(update.error, 'notes')}
      />
      <Button title="Save" onPress={save} loading={update.isPending} disabled={!name.trim() || !dirty} />
      <Button title="Cancel" variant="ghost" onPress={onDone} />
      <SpacePickerSheet
        visible={picking}
        title={'Move ' + asset.name}
        spaces={spaces}
        allowed={allowed}
        selected={spaceId}
        onSelect={setSpaceId}
        onClose={() => setPicking(false)}
      />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: spacing.xl },
  name: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  badges: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap', justifyContent: 'center' },
  where: {
    minHeight: TAP_MIN,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  picker: {
    minHeight: TAP_MIN,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
