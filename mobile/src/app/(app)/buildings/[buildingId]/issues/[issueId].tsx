import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import type { IssueDto, IssueStatus, UUID } from '@condo/shared';
import { AssetIcon } from '../../../../../components/assets/AssetParts';
import { Badge } from '../../../../../components/Badges';
import { Button } from '../../../../../components/Button';
import { ToggleRow } from '../../../../../components/Controls';
import { StatusBadge } from '../../../../../components/issues/IssueParts';
import { Card, FormError, ScrollScreen, SectionTitle } from '../../../../../components/Layout';
import { QueryGate } from '../../../../../components/StateView';
import { TextField } from '../../../../../components/TextField';
import {
  useAddIssuePhoto,
  useChangeIssueStatus,
  useCommentIssue,
  useIssue,
  useIssueSharing,
  useMeToo,
} from '../../../../../hooks/queries';
import { errorMessage } from '../../../../../lib/errors';
import { affectedText, eventText, formatDateTime, timeAgo, transitionLabel } from '../../../../../lib/issues';
import { pickPhoto } from '../../../../../lib/photos';
import { radius, spacing, useTheme } from '../../../../../theme';

/**
 * Issue detail: /buildings/{b}/issues/{issueId} — the target of phase 5 push notifications.
 * Every action is driven by `issue.me` (server-computed capabilities).
 */
export default function IssueScreen() {
  const { buildingId, issueId } = useLocalSearchParams<{ buildingId: string; issueId: string }>();
  const issueQuery = useIssue(buildingId, issueId);
  return (
    <>
      <Stack.Screen options={{ title: issueQuery.data ? `#${issueQuery.data.number}` : 'Issue' }} />
      <QueryGate
        queries={[issueQuery]}
        errorSecondaryAction={{ label: 'Back to building', onPress: () => router.dismissTo(`/buildings/${buildingId}`) }}
      >
        {() => <IssueDetail issue={issueQuery.data!} refetch={() => void issueQuery.refetch()} />}
      </QueryGate>
    </>
  );
}

function IssueDetail({ issue, refetch }: { issue: IssueDto; refetch: () => void }) {
  const { colors } = useTheme();
  const b = issue.buildingId;
  const status = useChangeIssueStatus(b, issue.id);
  const comment = useCommentIssue(b, issue.id);
  const meToo = useMeToo(b, issue.id);
  const sharing = useIssueSharing(b, issue.id);
  const addPhoto = useAddIssuePhoto(b, issue.id);
  const [text, setText] = useState('');
  const [photoError, setPhotoError] = useState<string | null>(null);
  const me = issue.me;
  const merged = issue.mergedIntoId
    ? {
        id: issue.mergedIntoId,
        number: [...issue.timeline].reverse().find((e) => e.type === 'MERGED_INTO')?.relatedIssueNumber,
      }
    : null;

  const error = status.error ?? comment.error ?? meToo.error ?? sharing.error ?? addPhoto.error;
  const busy = status.isPending || comment.isPending;

  function changeStatus(to: IssueStatus) {
    status.mutate(
      { status: to, comment: text.trim() || null, version: issue.version },
      { onSuccess: () => setText('') },
    );
  }

  function sendComment() {
    if (!text.trim()) return;
    comment.mutate(text.trim(), { onSuccess: () => setText('') });
  }

  async function onAddPhoto(source: 'camera' | 'library') {
    setPhotoError(null);
    const p = await pickPhoto(source);
    if (p === 'denied') setPhotoError("Camera access is off. Allow it in your phone's settings, or choose a photo.");
    else if (p) addPhoto.mutate(p);
  }

  const timeline = [...issue.timeline].sort((x, y) => y.createdAt.localeCompare(x.createdAt));

  return (
    <ScrollScreen>
      {merged ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(`/buildings/${b}/issues/${merged.id}`)}
          style={[styles.banner, { backgroundColor: colors.surfaceAlt }]}
        >
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
            Merged into #{merged.number ?? '…'} — open it ›
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>Follow the other issue for updates.</Text>
        </Pressable>
      ) : null}

      <Card>
        <View style={styles.head}>
          {issue.assetType ? <AssetIcon type={issue.assetType} size={52} /> : null}
          <View style={styles.flex}>
            <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '700' }}>#{issue.number}</Text>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
              {issue.title}
            </Text>
          </View>
        </View>
        <View style={styles.badges}>
          <StatusBadge status={issue.status} />
          <Badge label={'👥 ' + affectedText(issue.affectedCount)} color={colors.text} background={colors.surfaceAlt} />
          {issue.visibility === 'PRIVATE' ? (
            <Badge
              label={issue.sharedWithAdmins ? 'Private · shared with management' : 'Private to the unit'}
              color={colors.private}
              background={colors.privateSoft}
            />
          ) : null}
          {me.isAffected ? <Badge label="You're affected" color={colors.success} background={colors.commonSoft} /> : null}
        </View>
        {issue.assetId && issue.assetName ? (
          <Pressable accessibilityRole="link" onPress={() => router.push(`/buildings/${b}/assets/${issue.assetId}`)}>
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>{issue.assetName} ›</Text>
          </Pressable>
        ) : null}
        <Text style={{ color: colors.text, fontSize: 16 }}>{issue.locationLabel}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          Reported by {issue.reportedByName} · {timeAgo(issue.createdAt)}
        </Text>
        {issue.note ? <Text style={{ color: colors.text, fontSize: 16 }}>{issue.note}</Text> : null}
      </Card>

      <FormError message={error ? errorMessage(error) : photoError} />

      {/* Me too / withdraw */}
      {!merged && me.canMeToo && !me.isAffected ? (
        <Button title="Me too — this affects me" onPress={() => meToo.mutate(true)} loading={meToo.isPending} style={styles.big} />
      ) : null}
      {/* canMeToo is false once affected; any non-reporter may withdraw (the server re-checks). */}
      {!merged && me.isAffected && !me.isReporter ? (
        <Button
          title="I'm not affected any more"
          variant="ghost"
          onPress={() => meToo.mutate(false)}
          loading={meToo.isPending}
        />
      ) : null}

      {/* Comment + status changes share one text box: the comment travels with the status change. */}
      {!merged && (me.canComment || me.allowedTransitions.length) ? (
        <Card>
          <TextField
            label={me.allowedTransitions.length ? 'Comment (optional with a status change)' : 'Comment'}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
            style={{ minHeight: 64, paddingTop: spacing.md, textAlignVertical: 'top' }}
          />
          {me.allowedTransitions.map((to) => (
            <Button
              key={to}
              title={transitionLabel(issue.status, to)}
              variant={to === 'RESOLVED' ? 'primary' : 'secondary'}
              onPress={() => changeStatus(to)}
              loading={status.isPending && status.variables?.status === to}
              disabled={busy}
              style={styles.big}
            />
          ))}
          {me.canComment ? (
            <Button
              title="Send comment"
              variant="secondary"
              onPress={sendComment}
              loading={comment.isPending}
              disabled={!text.trim() || busy}
            />
          ) : null}
        </Card>
      ) : null}

      {me.canChangeSharing ? (
        <Card>
          <ToggleRow
            label="Share with building management"
            description="Private issue: management only sees it when shared."
            value={issue.sharedWithAdmins}
            onChange={(v) => sharing.mutate(v)}
          />
        </Card>
      ) : null}

      <SectionTitle>Photos</SectionTitle>
      {issue.photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photos}>
          {issue.photos.map((p) => (
            <Image
              key={p.id}
              source={{ uri: p.url }}
              style={[styles.photo, { backgroundColor: colors.surfaceAlt }]}
              accessibilityLabel={'Photo by ' + p.uploadedByName}
              // Signed links last 1 h: if this one has (nearly) expired, fetch fresh ones. Only
              // then, so a genuinely broken file doesn't cause a refetch loop.
              onError={() => {
                if (new Date(p.urlExpiresAt).getTime() < Date.now() + 60_000) refetch();
              }}
            />
          ))}
        </ScrollView>
      ) : (
        <Text style={{ color: colors.textMuted, marginHorizontal: spacing.xs }}>No photos.</Text>
      )}
      {me.canAddPhoto && !merged && issue.photos.length < 5 ? (
        <View style={styles.row}>
          <Button title="📷 Take photo" variant="secondary" onPress={() => void onAddPhoto('camera')} loading={addPhoto.isPending} style={styles.flexBtn} />
          <Button title="🖼 Add photo" variant="secondary" onPress={() => void onAddPhoto('library')} disabled={addPhoto.isPending} style={styles.flexBtn} />
        </View>
      ) : null}

      <SectionTitle>Timeline</SectionTitle>
      <Card>
        {timeline.map((e, i) => (
          <View key={e.id} style={[styles.event, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }}>{eventText(e)}</Text>
            {e.comment ? <Text style={{ color: colors.text, fontSize: 15 }}>“{e.comment}”</Text> : null}
            {(e.type === 'MERGED_INTO' || e.type === 'MERGED_FROM') && e.relatedIssueId ? (
              <LinkToIssue buildingId={b} issueId={e.relatedIssueId} number={e.relatedIssueNumber} />
            ) : null}
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{formatDateTime(e.createdAt)}</Text>
          </View>
        ))}
      </Card>
    </ScrollScreen>
  );
}

function LinkToIssue({ buildingId, issueId, number }: { buildingId: UUID; issueId: UUID; number: number | null }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(`/buildings/${buildingId}/issues/${issueId}`)}>
      <Text style={{ color: colors.primary, fontSize: 15, fontWeight: '600' }}>Open #{number ?? '…'} ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontSize: 24, fontWeight: '800' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  banner: { borderRadius: radius.lg, padding: spacing.lg, gap: 2 },
  big: { minHeight: 60 },
  photos: { gap: spacing.sm },
  photo: { width: 160, height: 160, borderRadius: radius.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  flexBtn: { flex: 1, paddingHorizontal: spacing.sm },
  event: { gap: 2, paddingVertical: spacing.sm },
});
