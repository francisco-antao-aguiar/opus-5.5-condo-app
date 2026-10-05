import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { UseQueryResult } from '@tanstack/react-query';
import { describeError, type ErrorKind } from '../lib/errors';
import { spacing, useTheme } from '../theme';
import { Button } from './Button';

const GLYPHS: Record<ErrorKind | 'empty', string> = {
  offline: '⇄',
  notMember: '⚿',
  expired: '⌛',
  notFound: '?',
  forbidden: '⛔',
  generic: '!',
  empty: '∅',
};

interface StateViewProps {
  title: string;
  message?: string;
  glyph?: string;
  action?: { label: string; onPress: () => void };
  secondaryAction?: { label: string; onPress: () => void };
}

/** Friendly full-screen state: empty, error, offline, not-a-member... */
export function StateView({ title, message, glyph, action, secondaryAction }: StateViewProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      {glyph ? (
        <View style={[styles.glyphWrap, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={[styles.glyph, { color: colors.textMuted }]}>{glyph}</Text>
        </View>
      ) : null}
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
        {title}
      </Text>
      {message ? <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text> : null}
      {action ? <Button title={action.label} onPress={action.onPress} style={styles.button} /> : null}
      {secondaryAction ? (
        <Button
          title={secondaryAction.label}
          onPress={secondaryAction.onPress}
          variant="ghost"
          style={styles.button}
        />
      ) : null}
    </View>
  );
}

export function LoadingView() {
  const { colors } = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function ErrorView({
  error,
  onRetry,
  secondaryAction,
}: {
  error: unknown;
  onRetry?: () => void;
  secondaryAction?: { label: string; onPress: () => void };
}) {
  const info = describeError(error);
  const canRetry = info.kind !== 'notMember' && info.kind !== 'expired' && info.kind !== 'notFound';
  return (
    <StateView
      glyph={GLYPHS[info.kind]}
      title={info.title}
      message={info.message}
      action={onRetry && canRetry ? { label: 'Try again', onPress: onRetry } : undefined}
      secondaryAction={secondaryAction}
    />
  );
}

export function OfflineView({ onRetry }: { onRetry?: () => void }) {
  return (
    <StateView
      glyph={GLYPHS.offline}
      title="You're offline"
      message="We'll load this as soon as you're back online."
      action={onRetry ? { label: 'Try again', onPress: onRetry } : undefined}
    />
  );
}

export function EmptyView({ title, message, action }: Omit<StateViewProps, 'glyph'>) {
  return <StateView glyph={GLYPHS.empty} title={title} message={message} action={action} />;
}

type AnyQuery = Pick<UseQueryResult<unknown, Error>, 'isPending' | 'isError' | 'error' | 'fetchStatus' | 'refetch'>;

/**
 * Renders the shared loading / offline / error states for one or more queries and only calls
 * `children` once all of them have data. Queries paused by onlineManager show the offline state.
 */
export function QueryGate({
  queries,
  children,
  errorSecondaryAction,
}: {
  queries: AnyQuery[];
  children: () => ReactNode;
  errorSecondaryAction?: { label: string; onPress: () => void };
}) {
  const retryAll = () => queries.forEach((q) => void q.refetch());
  const failed = queries.find((q) => q.isError);
  if (failed) return <ErrorView error={failed.error} onRetry={retryAll} secondaryAction={errorSecondaryAction} />;
  if (queries.some((q) => q.isPending && q.fetchStatus === 'paused')) return <OfflineView onRetry={retryAll} />;
  if (queries.some((q) => q.isPending)) return <LoadingView />;
  return <>{children()}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  glyphWrap: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  glyph: { fontSize: 32, fontWeight: '700' },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: 16, textAlign: 'center', maxWidth: 360, lineHeight: 22 },
  button: { alignSelf: 'stretch', maxWidth: 360, width: '100%' },
});
