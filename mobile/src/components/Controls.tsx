import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { ReactNode } from 'react';
import { radius, spacing, useTheme } from '../theme';

// ---------- Chip ----------

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.primary : colors.surface,
          borderColor: selected ? colors.primary : colors.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? colors.primaryText : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

export function ChipGroup({ children }: { children: ReactNode }) {
  return <View style={styles.chipGroup}>{children}</View>;
}

// ---------- Segmented ----------

interface SegmentedProps<T> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}

export function Segmented<T>({ options, value, onChange, accessibilityLabel }: SegmentedProps<T>) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={[styles.segWrap, { backgroundColor: colors.surfaceAlt }]}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segItem, selected && { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.segText, { color: selected ? colors.text : colors.textMuted }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------- Stepper ----------

interface StepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

/** Numeric stepper with big +/- targets, no keyboard needed. */
export function Stepper({ label, value, onChange, min = 0, max = 999 }: StepperProps) {
  const { colors } = useTheme();
  const button = (delta: number, glyph: string, verb: string) => {
    const disabled = delta < 0 ? value <= min : value >= max;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={verb + ' ' + label}
        disabled={disabled}
        onPress={() => onChange(Math.min(max, Math.max(min, value + delta)))}
        style={({ pressed }) => [
          styles.stepBtn,
          { backgroundColor: colors.surfaceAlt, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        ]}
      >
        <Text style={[styles.stepGlyph, { color: colors.text }]}>{glyph}</Text>
      </Pressable>
    );
  };
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.stepControls}>
        {button(-1, '−', 'Decrease')}
        <Text style={[styles.stepValue, { color: colors.text }]}>{value}</Text>
        {button(1, '+', 'Increase')}
      </View>
    </View>
  );
}

// ---------- ToggleRow ----------

interface ToggleRowProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: string;
}

export function ToggleRow({ label, value, onChange, description }: ToggleRowProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
        {description ? <Text style={[styles.rowDesc, { color: colors.textMuted }]}>{description}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.border }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipText: { fontSize: 15, fontWeight: '600' },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  segWrap: { flexDirection: 'row', borderRadius: radius.md, padding: 3 },
  segItem: { flex: 1, minHeight: 44, borderRadius: radius.md - 2, alignItems: 'center', justifyContent: 'center' },
  segText: { fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, gap: spacing.md },
  rowLabel: { fontSize: 16, flexShrink: 1 },
  rowDesc: { fontSize: 13, marginTop: 2 },
  flex: { flex: 1 },
  stepControls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stepBtn: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  stepGlyph: { fontSize: 24, fontWeight: '500' },
  stepValue: { minWidth: 40, textAlign: 'center', fontSize: 18, fontWeight: '600' },
});
