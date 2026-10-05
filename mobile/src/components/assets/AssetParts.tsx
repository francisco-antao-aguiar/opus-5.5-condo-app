import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AssetDto, AssetTypeCode, AssetTypeDto } from '@condo/shared';
import { assetTypeIcon } from '../../lib/assetIcons';
import { visibilityLabel } from '../../lib/format';
import { radius, spacing, useTheme } from '../../theme';
import { Badge } from '../Badges';
import { ListRow } from '../ListRow';

/** Coloured tile with the asset type's glyph. */
export function AssetIcon({
  type,
  catalog,
  size = 44,
}: {
  type: AssetTypeCode;
  catalog?: AssetTypeDto[];
  size?: number;
}) {
  const { glyph, color } = assetTypeIcon(type, catalog);
  return (
    <View
      style={[styles.icon, { width: size, height: size, borderRadius: size / 3, backgroundColor: color + '26' }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text style={{ fontSize: size * 0.5 }}>{glyph}</Text>
    </View>
  );
}

export function AssetVisibilityBadge({ asset }: { asset: Pick<AssetDto, 'effectiveVisibility'> }) {
  const { colors } = useTheme();
  if (!asset.effectiveVisibility) return null;
  const common = asset.effectiveVisibility === 'COMMON';
  return (
    <Badge
      label={visibilityLabel(asset.effectiveVisibility)}
      color={common ? colors.common : colors.private}
      background={common ? colors.commonSoft : colors.privateSoft}
    />
  );
}

/** Large asset row for the space browser (and, later, the reporting flow). */
export function AssetRow({
  asset,
  catalog,
  onPress,
}: {
  asset: AssetDto;
  catalog?: AssetTypeDto[];
  onPress: () => void;
}) {
  return (
    <ListRow
      title={asset.name}
      subtitle={asset.typeName}
      leading={<AssetIcon type={asset.type} catalog={catalog} />}
      badges={<AssetVisibilityBadge asset={asset} />}
      onPress={onPress}
    />
  );
}

/** 3-column grid of big type buttons. */
export function AssetTypeGrid({
  types,
  selected,
  onSelect,
}: {
  types: AssetTypeDto[];
  selected: AssetTypeCode | null;
  onSelect: (t: AssetTypeDto) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.grid} accessibilityRole="radiogroup" accessibilityLabel="Asset type">
      {types.map((t) => {
        const isSelected = t.code === selected;
        return (
          <View key={t.code} style={styles.cell}>
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              accessibilityLabel={t.name}
              onPress={() => onSelect(t)}
              style={({ pressed }) => [
                styles.typeBtn,
                {
                  backgroundColor: isSelected ? colors.surfaceAlt : colors.surface,
                  borderColor: isSelected ? colors.primary : colors.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <AssetIcon type={t.code} catalog={types} size={40} />
              <Text style={[styles.typeName, { color: colors.text }]} numberOfLines={2}>
                {t.name}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  icon: { alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs },
  cell: { width: '33.333%', padding: spacing.xs },
  typeBtn: {
    minHeight: 96,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
  },
  typeName: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
