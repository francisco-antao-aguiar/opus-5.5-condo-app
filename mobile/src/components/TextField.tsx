import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import type { Ref } from 'react';
import { radius, spacing, TAP_MIN, useTheme } from '../theme';

interface Props extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  ref?: Ref<TextInput>;
}

export function TextField({ label, error, hint, style, ref, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        style={[
          styles.input,
          { color: colors.text, backgroundColor: colors.surface, borderColor: error ? colors.danger : colors.border },
          style,
        ]}
        {...rest}
      />
      {error ? (
        <Text style={[styles.help, { color: colors.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.help, { color: colors.textMuted }]}>{hint}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600' },
  input: {
    minHeight: TAP_MIN - 4,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontSize: 17,
  },
  help: { fontSize: 13 },
});
