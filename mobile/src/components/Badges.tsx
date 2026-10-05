import { StyleSheet, Text, View } from 'react-native';
import type { SpaceDto, SpaceType } from '@condo/shared';
import { radius, spacing, SPACE_TYPE_COLORS, SPACE_TYPE_GLYPH, useTheme } from '../theme';
import { visibilityLabel } from '../lib/format';

export function Badge({ label, color, background }: { label: string; color: string; background: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: background }]}>
      <Text style={[styles.badgeText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** Effective visibility; marked "inherited" when the stored value is null. */
export function VisibilityBadge({ space }: { space: Pick<SpaceDto, 'visibility' | 'effectiveVisibility'> }) {
  const { colors } = useTheme();
  const isCommon = space.effectiveVisibility === 'COMMON';
  const label = visibilityLabel(space.effectiveVisibility) + (space.visibility === null ? ' · inherited' : '');
  return (
    <Badge
      label={label}
      color={isCommon ? colors.common : colors.private}
      background={isCommon ? colors.commonSoft : colors.privateSoft}
    />
  );
}

export function RoleBadge({ label }: { label: string }) {
  const { colors } = useTheme();
  return <Badge label={label} color={colors.primary} background={colors.surfaceAlt} />;
}

export function SpaceTypeIcon({ type, size = 44 }: { type: SpaceType; size?: number }) {
  return (
    <View
      style={[
        styles.icon,
        { width: size, height: size, borderRadius: size / 3, backgroundColor: SPACE_TYPE_COLORS[type] },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <Text style={[styles.glyph, { fontSize: size * 0.42 }]}>{SPACE_TYPE_GLYPH[type]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radius.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  icon: { alignItems: 'center', justifyContent: 'center' },
  glyph: { color: '#fff', fontWeight: '800' },
});
