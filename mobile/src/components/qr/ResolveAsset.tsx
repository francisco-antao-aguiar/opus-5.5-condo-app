import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, NetworkError, parseAssetCode, type ResolvedAsset } from '@condo/shared';
import { queryKeys } from '../../api/queryKeys';
import { useAuth } from '../../auth/AuthProvider';
import { useResolvedAsset } from '../../hooks/queries';
import { errorMessage } from '../../lib/errors';
import { clearPendingRoute, registerScreen, setPendingRoute } from '../../lib/pendingRoute';
import { spacing, useTheme } from '../../theme';
import { AssetIcon } from '../assets/AssetParts';
import { Button } from '../Button';
import { IssueRow } from '../issues/IssueParts';
import { Card, ScrollScreen, SectionTitle } from '../Layout';
import { LoadingView, OfflineView, StateView } from '../StateView';

/**
 * Landing for a scanned label / deep link: buildingapp://report/asset/{id} and /r/{id}.
 * Outside the auth guards: signed out, it remembers the target and continues after sign-in.
 * Signed in, it resolves the asset and jumps straight to the problem step of the report flow.
 */
export function ResolveAsset({ rawId }: { rawId: string }) {
  const assetId = parseAssetCode(rawId ?? '');
  const { status } = useAuth();
  const signedIn = status === 'signedIn';
  const path = assetId ? `/report/asset/${assetId}` : null;

  useEffect(() => (path ? registerScreen(path) : undefined), [path]);
  useEffect(() => {
    if (path && status === 'signedOut') void setPendingRoute(path);
  }, [path, status]);

  if (!assetId) {
    return (
      <StateView
        glyph="?"
        title="That isn't a valid item code"
        message="Try scanning the label again, or report the problem from the building screen."
        action={{ label: 'Go to my buildings', onPress: () => router.replace('/') }}
      />
    );
  }

  if (!signedIn) {
    return (
      <StateView
        glyph="🔒"
        title="Sign in to report a problem"
        message="This code belongs to an item in a building. Sign in (or create an account) and we'll take you straight to it."
        action={{ label: 'Sign in', onPress: () => router.push('/login') }}
        secondaryAction={{ label: 'Create account', onPress: () => router.push('/register') }}
      />
    );
  }

  return <Resolved assetId={assetId} />;
}

function Resolved({ assetId }: { assetId: string }) {
  const qc = useQueryClient();
  const query = useResolvedAsset(assetId, true);
  const went = useRef(false);
  const data = query.data;

  useEffect(() => {
    if (!data || went.current) return;
    void clearPendingRoute();
    if (!data.canReport) return;
    went.current = true;
    // Open issues are shown first on the problem step: seed that query with what resolve returned.
    qc.setQueryData(queryKeys.openIssuesOnAsset(data.buildingId, assetId), data.openIssues);
    router.replace(`/buildings/${data.buildingId}/report?assetId=${assetId}` as never);
  }, [data, assetId, qc]);

  useEffect(() => {
    if (query.isError && !(query.error instanceof NetworkError)) void clearPendingRoute();
  }, [query.isError, query.error]);

  if (query.isError) return <ResolveError error={query.error} onRetry={() => void query.refetch()} />;
  if (!data || data.canReport) {
    return query.fetchStatus === 'paused' ? <OfflineView onRetry={() => void query.refetch()} /> : <LoadingView />;
  }
  return <ReadOnly resolved={data} />;
}

function ResolveError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof NetworkError) return <OfflineView onRetry={onRetry} />;
  const code = error instanceof ApiError ? error.problem.code : undefined;
  const buildingName = error instanceof ApiError ? error.problem.buildingName : undefined;
  const home = { label: 'My buildings', onPress: () => router.replace('/') };
  if (code === 'NOT_A_MEMBER') {
    return (
      <StateView
        glyph="⚿"
        title={buildingName ? `This belongs to ${buildingName}` : 'This belongs to another building'}
        message="You're not a member of that building. Ask someone there for an invitation, then join with the code."
        action={{ label: 'Join with a code', onPress: () => router.replace('/join') }}
        secondaryAction={home}
      />
    );
  }
  if (code === 'MEMBERSHIP_EXPIRED') {
    return (
      <StateView
        glyph="⌛"
        title="Your access has ended"
        message={`Your membership${buildingName ? ' of ' + buildingName : ''} has expired. Ask an admin or manager to extend it.`}
        action={home}
      />
    );
  }
  if (code === 'ASSET_ARCHIVED' || (error instanceof ApiError && error.status === 410)) {
    return (
      <StateView
        glyph="🗄"
        title="This item was removed"
        message="It's no longer in use, so problems can't be reported on it. If something is wrong there, report it from the building screen."
        action={home}
      />
    );
  }
  if (error instanceof ApiError && error.status === 404) {
    return (
      <StateView
        glyph="?"
        title="We couldn't find this item"
        message="The code may be wrong, or the item is private to another unit."
        action={home}
      />
    );
  }
  return (
    <StateView glyph="!" title="Something went wrong" message={errorMessage(error)} action={{ label: 'Try again', onPress: onRetry }} secondaryAction={home} />
  );
}

/** canReport = false: show the asset and its open issues, read-only. */
function ReadOnly({ resolved }: { resolved: ResolvedAsset }) {
  const { colors } = useTheme();
  const a = resolved.asset;
  return (
    <ScrollScreen>
      <Card style={styles.hero}>
        <AssetIcon type={a.type} size={64} />
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' }}>{a.name}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 15, textAlign: 'center' }}>
          {[resolved.buildingName, a.spacePath].filter(Boolean).join(' · ')}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 15, textAlign: 'center' }}>
          You can see this item, but your role can't report problems on it.
        </Text>
      </Card>
      {resolved.openIssues.length ? (
        <>
          <SectionTitle>Open issues</SectionTitle>
          <View style={{ gap: spacing.sm }}>
            {resolved.openIssues.map((i) => (
              <IssueRow
                key={i.id}
                issue={i}
                onPress={() => router.push(`/buildings/${resolved.buildingId}/issues/${i.id}` as never)}
              />
            ))}
          </View>
        </>
      ) : (
        <Text style={{ color: colors.textMuted, fontSize: 15, marginHorizontal: spacing.xs }}>No open issues on it.</Text>
      )}
      <Button
        title="Open item"
        variant="secondary"
        onPress={() => router.push(`/buildings/${resolved.buildingId}/assets/${a.id}` as never)}
      />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', paddingVertical: spacing.xl },
});
