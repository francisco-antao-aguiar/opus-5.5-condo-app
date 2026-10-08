import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { ApiError, canDo, type IssueDto, type IssueStatus, type UUID } from '@condo/shared';
import { CostsCard } from '../../../../../components/costs/CostsCard';
import { formatLocalDate } from '../../../../../lib/time';
import { AssetIcon } from '../../../../../components/assets/AssetParts';
import { Badge } from '../../../../../components/Badges';
import { Button } from '../../../../../components/Button';
import { ToggleRow } from '../../../../../components/Controls';
import { StatusBadge } from '../../../../../components/issues/IssueParts';
import { Card, FormError, ScrollScreen, SectionTitle } from '../../../../../components/Layout';
import { QueryGate } from '../../../../../components/StateView';
import { TextField } from '../../../../../components/TextField';
import {
  useMaintenancePlan,
  useTickChecklist,
  useMyPermissions,
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
  const scheduled = issue.kind === 'SCHEDULED';
  const perms = useMyPermissions(b);
  const plan = useMaintenancePlan(b, scheduled ? issue.maintenancePlanId : null);
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
          {!scheduled ? (
            <Badge label={'👥 ' + affectedText(issue.affectedCount)} color={colors.text} background={colors.surfaceAlt} />
          ) : null}
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

      {scheduled ? (
        <Card style={issue.overdue ? { borderWidth: 2, borderColor: colors.danger } : undefined}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>🛠 Scheduled maintenance</Text>
          {plan.data ? <Text style={{ color: colors.text, fontSize: 16 }}>{plan.data.title}</Text> : null}
          {issue.dueOn ? (
            <Text style={{ color: issue.overdue ? colors.danger : colors.textMuted, fontSize: 15, fontWeight: issue.overdue ? '700' : '400' }}>
              {issue.overdue ? 'OVERDUE · was due ' : 'Due '}
              {formatLocalDate(issue.dueOn)}
            </Text>
          ) : null}
          {plan.data?.recurrenceText ? (
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>{plan.data.recurrenceText}</Text>
          ) : null}
          {plan.data?.assigneeNote ? (
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>By: {plan.data.assigneeNote}</Text>
          ) : null}
          {plan.data?.description ? <Text style={{ color: colors.text, fontSize: 15 }}>{plan.data.description}</Text> : null}
          {issue.checklist.length ? <Checklist issue={issue} /> : null}
        </Card>
      ) : null}

      <CostsCard
        buildingId={b}
        issueId={issue.id}
        canView={canDo(perms.data, 'COST_VIEW')}
        canManage={canDo(perms.data, 'COST_MANAGE')}
        defaultDescription={issue.title}
        defaultCategory={scheduled ? 'MAINTENANCE' : 'REPAIR'}
      />

      {/* Me too / withdraw — never on scheduled maintenance tasks. */}
      {!merged && !scheduled && me.canMeToo && !me.isAffected ? (
        <Button title="Me too — this affects me" onPress={() => meToo.mutate(true)} loading={meToo.isPending} style={styles.big} />
      ) : null}
      {/* canMeToo is false once affected; any non-reporter may withdraw (the server re-checks). */}
      {!merged && !scheduled && me.isAffected && !me.isReporter ? (
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

/**
 * The task's own checklist (frozen copy of the plan's). Tappable while the task is open and I may
 * triage it; each row is disabled while its request is in flight.
 */
function Checklist({ issue }: { issue: IssueDto }) {
  const { colors } = useTheme();
  const tick = useTickChecklist(issue.buildingId, issue.id);
  const [pending, setPending] = useState<number | null>(null);
  const editable = issue.me.canTickChecklist;
  const done = issue.checklist.filter((c) => c.done).length;
  const code = tick.error instanceof ApiError ? tick.error.problem.code : undefined;
  const message =
    code === 'CONFLICT'
      ? 'Someone else ticked this at the same moment — showing the latest.'
      : code === 'INVALID_STATE'
        ? 'This task is closed, so its checklist can no longer change.'
        : tick.error
          ? errorMessage(tick.error)
          : null;

  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' }}>
        {`Checklist · ${done}/${issue.checklist.length} done`}
      </Text>
      {message ? <FormError message={message} /> : null}
      {issue.checklist.map((item) => {
        const busy = pending === item.index;
        const row = (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44, opacity: busy ? 0.5 : 1 }}>
            <View
              style={[
                styles.box,
                { borderColor: item.done ? colors.success : colors.border, backgroundColor: item.done ? colors.success : 'transparent' },
              ]}
            >
              {item.done ? <Text style={{ color: '#fff', fontWeight: '800' }}>✓</Text> : null}
            </View>
            <View style={styles.flex}>
              <Text
                style={{
                  color: item.done ? colors.textMuted : colors.text,
                  fontSize: 16,
                  textDecorationLine: item.done ? 'line-through' : 'none',
                }}
              >
                {item.text}
              </Text>
              {item.done && (item.doneByName || item.doneAt) ? (
                <Text style={{ color: colors.success, fontSize: 13 }}>
                  ✓ {[item.doneByName, item.doneAt ? formatDateTime(item.doneAt) : null].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
          </View>
        );
        if (!editable) return <View key={item.index}>{row}</View>;
        return (
          <Pressable
            key={item.index}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.done, disabled: busy }}
            accessibilityLabel={item.text}
            disabled={busy || pending !== null}
            onPress={() => {
              setPending(item.index);
              tick.mutate({ index: item.index, done: !item.done }, { onSettled: () => setPending(null) });
            }}
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            {row}
          </Pressable>
        );
      })}
    </View>
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
  box: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
