import { useState } from 'react';
import { StyleSheet, Text, TextInput } from 'react-native';
import { router } from 'expo-router';
import { normalizeInviteCode } from '@condo/shared';
import { Button } from '../../components/Button';
import { ScrollScreen } from '../../components/Layout';
import { extractInviteCode, formatPartialInviteCode, isCompleteInviteCode } from '../../lib/inviteCode';
import { radius, spacing, useTheme } from '../../theme';

/**
 * "Join with a code": one big field. Typing is uppercased and dashed as ABCD-EFGH; pasting a code
 * in any form (lowercase, with dash, or a whole invite link) works too. Reachable signed in or out.
 */
export default function JoinWithCodeScreen() {
  const { colors } = useTheme();
  const [value, setValue] = useState('');
  const code = normalizeInviteCode(value);
  const complete = isCompleteInviteCode(code);

  function onChange(text: string) {
    setValue(formatPartialInviteCode(extractInviteCode(text)));
  }

  function submit() {
    if (complete) router.push(`/join/${code}`);
  }

  return (
    <ScrollScreen contentStyle={styles.content}>
      <Text style={[styles.lead, { color: colors.text }]}>Enter the code from your invitation</Text>
      <Text style={{ color: colors.textMuted, fontSize: 15, textAlign: 'center' }}>
        It looks like ABCD-EFGH. Capital letters and the dash are optional — you can also paste the link.
      </Text>
      <TextInput
        accessibilityLabel="Invite code"
        value={value}
        onChangeText={onChange}
        autoFocus
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        keyboardType="default"
        returnKeyType="go"
        onSubmitEditing={submit}
        placeholder="ABCD-EFGH"
        placeholderTextColor={colors.border}
        // 8 characters + dash; pasted links are shortened by onChange before this applies.
        maxLength={64}
        style={[
          styles.input,
          { color: colors.text, backgroundColor: colors.surface, borderColor: complete ? colors.primary : colors.border },
        ]}
      />
      <Button title="Continue" onPress={submit} disabled={!complete} />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: 480, width: '100%', alignSelf: 'center', paddingTop: spacing.xl },
  lead: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  input: {
    minHeight: 80,
    borderWidth: 2,
    borderRadius: radius.lg,
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
