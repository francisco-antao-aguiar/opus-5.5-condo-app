import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import type { UUID } from '@condo/shared';
import { useAuth } from '../../auth/AuthProvider';
import { confirm } from '../../lib/confirm';
import { dismissNotice, discard, processQueue, retryFailed, useReportQueue } from '../../reports/queue';
import { radius, spacing, useTheme } from '../../theme';
import { Badge } from '../Badges';
import { Button } from '../Button';

/**
 * Outbox status: reports waiting for the network, ones that couldn't be sent (retry/discard),
 * and notices from background sends ("we added you as affected"). Renders nothing when empty.
 */
export function PendingReports({ buildingId }: { buildingId?: UUID }) {
  const { colors } = useTheme();
  const userId = useAuth().me?.user.id;
  const { pending, failed, notices } = useReportQueue(userId, buildingId);
  if (!pending.length && !failed.length && !notices.length) return null;

  const retryAll = () => {
    if (userId) void processQueue(userId);
  };

  return (
    <View style={styles.wrap}>
      {pending.length ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.warning }]}>
          <Text style={[styles.head, { color: colors.warning }]}>
            {pending.length === 1 ? '1 report waiting to send' : `${pending.length} reports waiting to send`}
          </Text>
          {pending.map((p) => (
            <View key={p.clientRequestId} style={styles.line}>
              <Badge label={p.issueId ? 'Photos pending' : 'Pending'} color={colors.warning} background={colors.surfaceAlt} />
              <Text style={[styles.text, { color: colors.text }]} numberOfLines={2}>
                {p.title} · {p.location}
              </Text>
            </View>
          ))}
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
            Saved on this phone — they'll be sent automatically as soon as there's a connection.
          </Text>
          <Button title="Try now" variant="secondary" onPress={retryAll} />
        </View>
      ) : null}

      {failed.length ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.danger }]}>
          <Text style={[styles.head, { color: colors.danger }]}>Couldn't send</Text>
          {failed.map((f) => (
            <View key={f.clientRequestId} style={styles.failed}>
              <Text style={[styles.text, { color: colors.text, fontWeight: '600' }]}>
                {f.title} · {f.location}
              </Text>
              {f.error ? <Text style={{ color: colors.danger, fontSize: 14 }}>{f.error}</Text> : null}
              <View style={styles.actions}>
                <Button
                  title="Retry"
                  variant="secondary"
                  style={styles.action}
                  onPress={() => {
                    retryFailed(f.clientRequestId);
                    retryAll();
                  }}
                />
                <Button
                  title="Discard"
                  variant="danger"
                  style={styles.action}
                  onPress={async () => {
                    if (await confirm('Discard this report?', `“${f.title}” will not be sent.`, 'Discard')) {
                      discard(f.clientRequestId);
                    }
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {notices.map((n) => (
        <View key={n.id} style={[styles.notice, { backgroundColor: colors.commonSoft }]}>
          <Pressable
            style={styles.flex}
            accessibilityRole={n.issueId ? 'link' : undefined}
            disabled={!n.issueId}
            onPress={() => router.push(`/buildings/${n.buildingId}/issues/${n.issueId}`)}
          >
            <Text style={{ color: colors.text, fontSize: 15 }}>{n.text}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" hitSlop={12} onPress={() => dismissNotice(n.id)}>
            <Text style={{ color: colors.textMuted, fontSize: 20, paddingHorizontal: spacing.xs }}>×</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  wrap: { gap: spacing.sm },
  card: { borderWidth: 2, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  head: { fontSize: 15, fontWeight: '800' },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { fontSize: 15, flexShrink: 1 },
  failed: { gap: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1, paddingHorizontal: spacing.md },
  notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, padding: spacing.md },
});
