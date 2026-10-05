import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/Button';
import { FormError, ScrollScreen } from '../../components/Layout';
import { TextField } from '../../components/TextField';
import { errorMessage, fieldError } from '../../lib/errors';
import { spacing, useTheme } from '../../theme';

export default function LoginScreen() {
  const { colors } = useTheme();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await login({ email: email.trim(), password });
      // Root layout's protected routes take over navigation.
    } catch (e) {
      setError(e);
      setSubmitting(false);
    }
  }

  return (
    <ScrollScreen edges={['top', 'bottom']} contentStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={[styles.brand, { color: colors.primary }]}>Condo</Text>
        <Text style={[styles.tagline, { color: colors.textMuted }]}>Your building, in your pocket.</Text>
      </View>
      <FormError message={error ? errorMessage(error) : null} />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={fieldError(error, 'email')}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        error={fieldError(error, 'password')}
      />
      <Button title="Sign in" onPress={submit} loading={submitting} disabled={!email || !password} />
      <Link href="/register" asChild>
        <Button title="Create an account" variant="ghost" />
      </Link>
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'center', maxWidth: 480, width: '100%', alignSelf: 'center' },
  hero: { alignItems: 'center', marginBottom: spacing.xl, gap: spacing.xs },
  brand: { fontSize: 44, fontWeight: '800', letterSpacing: -1 },
  tagline: { fontSize: 16 },
});
