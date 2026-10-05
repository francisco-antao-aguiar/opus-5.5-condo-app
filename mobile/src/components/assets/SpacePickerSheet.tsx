import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacePath, SPACE_TYPE_LABELS, type SpaceDto, type UUID } from '@condo/shared';
import { radius, spacing, TAP_MIN, useTheme } from '../../theme';
import { SpaceTypeIcon } from '../Badges';
import { Sheet } from '../Sheet';
import { TextField } from '../TextField';

interface Option {
  space: SpaceDto;
  /** "Floor 2 › 2B" — path below the root, for disambiguation. */
  context: string;
}

/** Searchable flat list of spaces (tree order), limited to `allowed`. Used to move an asset. */
export function SpacePickerSheet({
  visible,
  title,
  spaces,
  allowed,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  spaces: SpaceDto[];
  allowed: (s: SpaceDto) => boolean;
  selected: UUID | null;
  onSelect: (id: UUID) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');

  const options = useMemo<Option[]>(() => {
    const withPath = spaces.filter(allowed).map((s) => {
      const path = spacePath(spaces, s.id);
      return { space: s, path, context: path.slice(1, -1).map((p) => p.name).join(' › ') };
    });
    // Tree order: compare the path segment by segment (sortOrder, then name).
    const key = (p: SpaceDto[]) => p.map((s) => String(s.sortOrder).padStart(6, '0') + s.name);
    return withPath
      .sort((a, b) => {
        const ka = key(a.path);
        const kb = key(b.path);
        for (let i = 0; i < Math.min(ka.length, kb.length); i++) {
          const c = ka[i].localeCompare(kb[i], undefined, { numeric: true });
          if (c) return c;
        }
        return ka.length - kb.length;
      })
      .map(({ space, context }) => ({ space, context }));
  }, [spaces, allowed]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => (o.space.name + ' ' + o.context).toLowerCase().includes(q)) : options;
  }, [options, query]);

  return (
    <Sheet visible={visible} title={title} onClose={onClose}>
      {options.length > 8 ? (
        <TextField label="Search" value={query} onChangeText={setQuery} placeholder="e.g. 2B, garage" autoCorrect={false} />
      ) : null}
      {filtered.map(({ space, context }) => {
        const isSelected = space.id === selected;
        return (
          <Pressable
            key={space.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected }}
            onPress={() => {
              onSelect(space.id);
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
            <SpaceTypeIcon type={space.type} size={32} />
            <View style={styles.flex}>
              <Text style={{ color: colors.text, fontSize: 17, fontWeight: '600' }}>{space.name}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                {context || SPACE_TYPE_LABELS[space.type]}
              </Text>
            </View>
            {isSelected ? <Text style={{ color: colors.primary, fontSize: 20, fontWeight: '700' }}>✓</Text> : null}
          </Pressable>
        );
      })}
      {filtered.length === 0 ? (
        <Text style={{ color: colors.textMuted }}>{query ? `No places match “${query}”.` : 'No places available.'}</Text>
      ) : null}
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
