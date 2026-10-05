import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ApiError, formatInviteCode, NetworkError, normalizeInviteCode, type InvitationPreview } from '@condo/shared';
import { useAuth } from '../../auth/AuthProvider';
import { RoleBadge } from '../../components/Badges';
import { Button } from '../../components/Button';
import { Card, FormError, ScrollScreen } from '../../components/Layout';
import { LoadingView, OfflineView, StateView } from '../../components/StateView';
import { useAcceptInvitation, useInvitationPreview } from '../../hooks/queries';
import { errorMessage } from '../../lib/errors';
import { capitalize, formatDate, invitationAccessText, roleLabel } from '../../lib/format';
import { INVITE_CODE_LENGTH } from '../../lib/inviteCode';
import { clearPendingInvite, joinPath, registerScreen, setPendingInvite } from '../../lib/pendingRoute';
import { spacing, useTheme } from '../../theme';

type Dead = 'EXPIRED' | 'REVOKED' | 'EXHAUSTED' | 'NOT_FOUND' | 'MALFORMED' | 'INVALID' | 'TOO_MANY';

const DEAD_FROM_CODE: Partial<Record<string, Dead>> = {
  INVITATION_EXPIRED: 'EXPIRED',
  INVITATION_REVOKED: 'REVOKED',
  INVITATION_EXHAUSTED: 'EXHAUSTED',
  INVITATION_NOT_FOUND: 'NOT_FOUND',
  INVITATION_INVALID: 'INVALID',
  TOO_MANY_ATTEMPTS: 'TOO_MANY',
};

const DEAD_FROM_STATUS: Partial<Record<InvitationPreview['status'], Dead>> = {
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
  INVALID: 'INVALID',
  EXHAUSTED: 'EXHAUSTED',
};

function problemCode(e: unknown): string | undefined {
  return e instanceof ApiError ? e.problem.code : undefined;
}

/**
 * Landing screen for buildingapp://join/{code} and /join/{code}. Lives outside the auth guards so
 * it works signed out: shows who invited you to what, then Accept (signed in) or Create account /
 * Sign in (signed out — the code is remembered and the root layout brings you back here).
 */
export default function JoinScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ code: string }>();
  // Any case, with or without the dash.
  const code = normalizeInviteCode(String(params.code ?? ''));
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const wellFormed = code.length === INVITE_CODE_LENGTH;
  const preview = useInvitationPreview(wellFormed ? code : '');
  const accept = useAcceptInvitation();
  const [alreadyMember, setAlreadyMember] = useState(false);

  useEffect(() => (wellFormed ? registerScreen(joinPath(code)) : undefined), [wellFormed, code]);

  // Remember the code while signed out, so login/registration lands back here.
  useEffect(() => {
    if (!signedIn && wellFormed) void setPendingInvite(code);
  }, [signedIn, wellFormed, code]);

  const previewCode = problemCode(preview.error);
  const acceptCode = problemCode(accept.error);
  const dead: Dead | null = !wellFormed
    ? 'MALFORMED'
    : (acceptCode && DEAD_FROM_CODE[acceptCode]) ||
      (previewCode && DEAD_FROM_CODE[previewCode]) ||
      (preview.data && DEAD_FROM_STATUS[preview.data.status]) ||
      null;

  // A dead invitation is not worth coming back to after sign-in.
  useEffect(() => {
    if (dead && dead !== 'TOO_MANY') void clearPendingInvite();
  }, [dead]);

  const header = <Stack.Screen options={{ title: 'Invitation' }} />;

  const leave = () => {
    void clearPendingInvite();
    if (signedIn) router.dismissTo('/');
    else router.replace('/login');
  };
  const otherCode = () => router.replace('/join');

  if (dead) {
    return (
      <>
        {header}
        <DeadInvitation kind={dead} preview={preview.data} signedIn={signedIn} onOtherCode={otherCode} onLeave={leave} />
      </>
    );
  }

  if (alreadyMember || acceptCode === 'ALREADY_MEMBER') {
    const buildingId = preview.data?.buildingId;
    return (
      <>
        {header}
        <StateView
          glyph="✓"
          title="You're already a member"
          message={preview.data ? `You already have access to ${preview.data.buildingName}.` : undefined}
          action={
            buildingId
              ? { label: 'Open building', onPress: () => router.dismissTo(`/buildings/${buildingId}`) }
              : undefined
          }
          secondaryAction={{ label: 'My buildings', onPress: () => router.dismissTo('/') }}
        />
      </>
    );
  }

  if (preview.isError) {
    return (
      <>
        {header}
        {preview.error instanceof NetworkError ? (
          <OfflineView onRetry={() => void preview.refetch()} />
        ) : (
          <StateView
            glyph="!"
            title="Couldn't open this invitation"
            message={errorMessage(preview.error)}
            action={{ label: 'Try again', onPress: () => void preview.refetch() }}
            secondaryAction={{ label: 'Enter another code', onPress: otherCode }}
          />
        )}
      </>
    );
  }

  if (preview.isPending) {
    return (
      <>
        {header}
        {preview.fetchStatus === 'paused' ? <OfflineView onRetry={() => void preview.refetch()} /> : <LoadingView />}
      </>
    );
  }

  function onAccept() {
    accept.mutate(code, {
      onSuccess: (res) => {
        void clearPendingInvite();
        router.dismissTo(`/buildings/${res.buildingId}`);
      },
      onError: (e) => {
        const c = problemCode(e);
        if (c === 'ALREADY_MEMBER') {
          void clearPendingInvite();
          setAlreadyMember(true);
        }
        // The invitation may have changed meanwhile (expired / used up / revoked).
        if (c && DEAD_FROM_CODE[c]) void preview.refetch();
      },
    });
  }

  async function goAuth(path: '/login' | '/register') {
    await setPendingInvite(code);
    router.push(path);
  }

  return (
    <ScrollScreen contentStyle={styles.content}>
      {header}
      <PreviewCard preview={preview.data} />
      <FormError message={accept.error ? errorMessage(accept.error) : null} />
      {signedIn ? (
        <>
          <Button title="Accept invitation" onPress={onAccept} loading={accept.isPending} style={styles.big} />
          <Button title="Not now" variant="ghost" onPress={leave} disabled={accept.isPending} />
        </>
      ) : (
        <>
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Create an account or sign in to accept. We'll bring you right back here.
          </Text>
          <Button title="Create account" onPress={() => void goAuth('/register')} style={styles.big} />
          <Button title="I have an account — Sign in" variant="secondary" onPress={() => void goAuth('/login')} />
          <Button title="Not now" variant="ghost" onPress={leave} />
        </>
      )}
    </ScrollScreen>
  );
}

function PreviewCard({ preview }: { preview: InvitationPreview }) {
  const { colors } = useTheme();
  return (
    <Card style={styles.card}>
      <Text style={[styles.inviter, { color: colors.textMuted }]}>{preview.invitedByName} invited you to join</Text>
      <Text accessibilityRole="header" style={[styles.building, { color: colors.text }]}>
        {preview.buildingName}
      </Text>
      {preview.buildingAddress ? (
        <Text style={[styles.small, { color: colors.textMuted, fontSize: 15 }]}>{preview.buildingAddress}</Text>
      ) : null}
      <View style={styles.roleLine}>
        <Text style={{ color: colors.text, fontSize: 17 }}>as</Text>
        <RoleBadge label={roleLabel(preview.role)} />
        {preview.unitName ? <Text style={{ color: colors.text, fontSize: 17 }}>of {preview.unitName}</Text> : null}
      </View>
      <Text style={[styles.detail, { color: colors.text }]}>
        {capitalize(invitationAccessText(preview) ?? 'access with no end date')}
      </Text>
      <Text style={[styles.small, { color: colors.textMuted }]}>
        Code {formatInviteCode(preview.code)} · invitation valid until {formatDate(preview.expiresAt)}
      </Text>
    </Card>
  );
}

function DeadInvitation({
  kind,
  preview,
  signedIn,
  onOtherCode,
  onLeave,
}: {
  kind: Dead;
  preview: InvitationPreview | undefined;
  signedIn: boolean;
  onOtherCode: () => void;
  onLeave: () => void;
}) {
  const who = preview?.invitedByName;
  const askFor = who ? `Ask ${who} for a new one.` : 'Ask the person who invited you for a new one.';
  const copy: Record<Dead, { glyph: string; title: string; message: string }> = {
    EXPIRED: { glyph: '⌛', title: 'This invitation has expired', message: askFor },
    REVOKED: {
      glyph: '⛔',
      title: 'This invitation was cancelled',
      message: (who ? `${who} cancelled it. ` : 'It was cancelled. ') + 'Ask for a new one if you still need access.',
    },
    EXHAUSTED: {
      glyph: '✓',
      title: 'This invitation has already been used',
      message: 'It was only valid for a limited number of people. ' + askFor,
    },
    NOT_FOUND: {
      glyph: '?',
      title: "We couldn't find that invitation",
      message: 'Check the code — it has 8 letters and digits, like ABCD-EFGH.',
    },
    INVALID: {
      glyph: '⛔',
      title: 'This invitation no longer works',
      message:
        (who ? `${who} can no longer invite people here` : 'The person who sent it can no longer invite people here') +
        ' (for example, they moved out). Ask a building admin or manager for a new invitation.',
    },
    MALFORMED: {
      glyph: '?',
      title: "That code doesn't look right",
      message: 'Invite codes have 8 letters and digits, like ABCD-EFGH.',
    },
    TOO_MANY: {
      glyph: '⏸',
      title: 'Too many attempts',
      message: 'For safety, code lookups are paused for a few minutes. Please try again later.',
    },
  };
  const c = copy[kind];
  return (
    <StateView
      glyph={c.glyph}
      title={c.title}
      message={c.message}
      action={{ label: 'Enter another code', onPress: onOtherCode }}
      secondaryAction={{ label: signedIn ? 'My buildings' : 'Sign in', onPress: onLeave }}
    />
  );
}

const styles = StyleSheet.create({
  content: { maxWidth: 520, width: '100%', alignSelf: 'center', paddingTop: spacing.xl },
  card: { alignItems: 'center', paddingVertical: spacing.xl },
  inviter: { fontSize: 16, textAlign: 'center' },
  building: { fontSize: 28, fontWeight: '800', textAlign: 'center' },
  roleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  detail: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  small: { fontSize: 13, textAlign: 'center' },
  hint: { fontSize: 15, textAlign: 'center' },
  big: { minHeight: 64 },
});
