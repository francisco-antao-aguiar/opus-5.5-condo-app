import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacePath, type SpaceDto, type UUID } from '@condo/shared';
import { radius, spacing, TAP_MIN, useTheme } from '../../theme';
import { Sheet } from '../Sheet';
import { TextField } from '../TextField';

export interface UnitOption {
  id: UUID;
  name: string;
  /** e.g. "Floor 2" — the path between the root and the unit. */
  context: string;
}

export function unitOptions(spaces: SpaceDto[]): UnitOption[] {
  return spaces
    .filter((s) => s.type === 'UNIT')
    .map((s) => ({
      id: s.id,
      name: s.name,
      context: spacePath(spaces, s.id)
        .slice(1, -1)
        .map((p) => p.name)
        .join(' › '),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** Searchable unit list (buildings can have hundreds of units), plus "Whole building". */
export function UnitPickerSheet({
  visible,
  units,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  units: UnitOption[];
  selected: UUID | null;
  onSelect: (id: UUID | null) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? units.filter((u) => (u.name + ' ' + u.context).toLowerCase().includes(q)) : units;
  }, [units, query]);

  const option = (id: UUID | null, title: string, subtitle?: string) => {
    const isSelected = id === selected;
    return (
      <Pressable
        key={id ?? 'building'}
        accessibilityRole="radio"
        accessibilityState={{ checked: isSelected }}
        onPress={() => {
          onSelect(id);
          onClose();
        }}
        style={({ pressed }) => [
          styles.option,
          {
            backgroundColor: isSelected ? colors.surfaceAlt : colors.surface,
            borderColor: isSelected ? colors.primary : colors.border,
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <View style={styles.flex}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{title}</Text>
          {subtitle ? <Text style={{ color: colors.textMuted, fontSize: 14 }}>{subtitle}</Text> : null}
        </View>
        {isSelected ? <Text style={{ color: colors.primary, fontSize: 20, fontWeight: '700' }}>✓</Text> : null}
      </Pressable>
    );
  };

  return (
    <Sheet visible={visible} title="Choose unit" onClose={onClose}>
      {units.length > 8 ? (
        <TextField label="Search" value={query} onChangeText={setQuery} placeholder="e.g. 2B" autoCorrect={false} />
      ) : null}
      {!query ? option(null, 'Whole building', 'No specific unit') : null}
      {filtered.map((u) => option(u.id, u.name, u.context || undefined))}
      {filtered.length === 0 ? <Text style={{ color: colors.textMuted }}>No units match “{query}”.</Text> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  option: {
    minHeight: TAP_MIN,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
