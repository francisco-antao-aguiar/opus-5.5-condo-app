import { useRef, useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { useAuth } from '../../auth/AuthProvider';
import { Button } from '../../components/Button';
import { FormError, ScrollScreen } from '../../components/Layout';
import { TextField } from '../../components/TextField';
import { errorMessage, fieldError } from '../../lib/errors';

const MIN_PASSWORD = 8;

export default function RegisterScreen() {
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [submitting, setSubmitting] = useState(false);
  const [touchedPassword, setTouchedPassword] = useState(false);
  const nameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const canSubmit = email.trim() && displayName.trim() && password.length >= MIN_PASSWORD;

  async function submit() {
    if (!canSubmit) {
      setTouchedPassword(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await register({ email: email.trim(), displayName: displayName.trim(), password });
    } catch (e) {
      setError(e);
      setSubmitting(false);
    }
  }

  return (
    <ScrollScreen contentStyle={styles.content}>
      <FormError message={error ? errorMessage(error) : null} />
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        onSubmitEditing={() => nameRef.current?.focus()}
        error={fieldError(error, 'email')}
      />
      <TextField
        ref={nameRef}
        label="Your name"
        value={displayName}
        onChangeText={setDisplayName}
        autoComplete="name"
        textContentType="name"
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
        error={fieldError(error, 'displayName')}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        value={password}
        onChangeText={setPassword}
        onBlur={() => setTouchedPassword(true)}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
        hint={`At least ${MIN_PASSWORD} characters`}
        error={
          fieldError(error, 'password') ??
          (touchedPassword && passwordTooShort ? `Use at least ${MIN_PASSWORD} characters` : undefined)
        }
      />
      <Button title="Create account" onPress={submit} loading={submitting} disabled={!canSubmit} />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: 480, width: '100%', alignSelf: 'center' },
});
