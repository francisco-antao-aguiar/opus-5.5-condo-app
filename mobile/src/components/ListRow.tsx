import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius, spacing, TAP_MIN, useTheme } from '../theme';

interface Props {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  badges?: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  /** Secondary action (e.g. "more" button) rendered at the trailing edge. */
  trailing?: ReactNode;
  showChevron?: boolean;
  accessibilityHint?: string;
}

/** Large, card-like row. Whole row is the tap target. */
export function ListRow({
  title,
  subtitle,
  leading,
  badges,
  onPress,
  onLongPress,
  trailing,
  showChevron = !!onPress,
  accessibilityHint,
}: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: colors.surface }]}>
      <Pressable
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={subtitle ? title + ', ' + subtitle : title}
        accessibilityHint={accessibilityHint}
        onPress={onPress}
        onLongPress={onLongPress}
        disabled={!onPress && !onLongPress}
        style={({ pressed }) => [styles.main, pressed && { backgroundColor: colors.surfaceAlt }]}
      >
        {leading}
        <View style={styles.text}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
          {badges ? <View style={styles.badges}>{badges}</View> : null}
        </View>
        {showChevron ? <Text style={[styles.chevron, { color: colors.textMuted }]}>{'›'}</Text> : null}
      </Pressable>
      {trailing}
    </View>
  );
}

/** Square icon button for row trailing actions. */
export function IconButton({
  glyph,
  label,
  onPress,
}: {
  glyph: string;
  label: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.iconBtn, { borderLeftColor: colors.border }, pressed && { opacity: 0.6 }]}
    >
      <Text style={[styles.iconGlyph, { color: colors.textMuted }]}>{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', borderRadius: radius.lg, overflow: 'hidden' },
  main: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: TAP_MIN + 16,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  text: { flex: 1, gap: 2 },
  title: { fontSize: 17, fontWeight: '600' },
  subtitle: { fontSize: 14 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chevron: { fontSize: 28, fontWeight: '300', marginLeft: spacing.xs },
  iconBtn: {
    width: TAP_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  iconGlyph: { fontSize: 22, fontWeight: '700' },
});
