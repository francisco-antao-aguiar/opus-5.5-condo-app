import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { DuplicateIssueInfo, IssueStatus, IssueSummaryDto } from '@condo/shared';
import { affectedText, statusColors, statusLabel, timeAgo } from '../../lib/issues';
import { radius, spacing, TAP_MIN, useTheme } from '../../theme';
import { AssetIcon } from '../assets/AssetParts';
import { Badge } from '../Badges';
import { Button } from '../Button';

export function StatusBadge({ status }: { status: IssueStatus }) {
  const { colors } = useTheme();
  return <Badge label={statusLabel(status)} {...statusColors(status, colors)} />;
}

/** Issue list row: "#12 Flickering", asset + place, status, affected count. */
export function IssueRow({ issue, onPress }: { issue: IssueSummaryDto; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Issue ${issue.number}, ${issue.title}, ${statusLabel(issue.status)}, ${affectedText(issue.affectedCount)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceAlt : colors.surface }]}
    >
      {issue.assetType ? (
        <AssetIcon type={issue.assetType} size={44} />
      ) : (
        <View style={[styles.otherIcon, { backgroundColor: colors.surfaceAlt }]}>
          <Text style={{ fontSize: 22 }}>❓</Text>
        </View>
      )}
      <View style={styles.flex}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          <Text style={{ color: colors.textMuted }}>#{issue.number} </Text>
          {issue.title}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }} numberOfLines={2}>
          {[issue.assetName, issue.locationLabel].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.badges}>
          <StatusBadge status={issue.status} />
          <Badge label={'👥 ' + issue.affectedCount} color={colors.text} background={colors.surfaceAlt} />
          {issue.photoCount ? <Badge label={'📷 ' + issue.photoCount} color={colors.text} background={colors.surfaceAlt} /> : null}
          {issue.affectedByMe ? <Badge label="You're affected" color={colors.success} background={colors.commonSoft} /> : null}
          {issue.visibility === 'PRIVATE' ? (
            <Badge
              label={issue.sharedWithAdmins ? 'Private · shared' : 'Private'}
              color={colors.private}
              background={colors.privateSoft}
            />
          ) : null}
          <Text style={{ color: colors.textMuted, fontSize: 12, alignSelf: 'center' }}>{timeAgo(issue.lastActivityAt)}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * "Already reported · Flickering · 3 people affected [Me too]". Used before choosing a problem
 * (open issues on the asset) and after a 409 DUPLICATE_ISSUE.
 */
export function AlreadyReportedCard({
  number,
  title,
  status,
  affectedCount,
  joined,
  alreadyAffected,
  loading,
  onMeToo,
  onOpen,
}: {
  number: number;
  title: string;
  status: IssueStatus;
  affectedCount: number;
  /** Me too just succeeded. */
  joined?: boolean;
  /** I reported it or already said me too. */
  alreadyAffected?: boolean;
  loading?: boolean;
  onMeToo?: () => void;
  onOpen?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.dup, { backgroundColor: colors.surface, borderColor: colors.warning }]}>
      <Pressable accessibilityRole="link" onPress={onOpen} disabled={!onOpen} style={styles.flex}>
        <Text style={{ color: colors.warning, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' }}>
          Already reported · #{number}
        </Text>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>{title}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 14 }}>
          {statusLabel(status)} · {affectedText(affectedCount)}
        </Text>
      </Pressable>
      {alreadyAffected || joined ? (
        <View style={[styles.joined, { backgroundColor: colors.commonSoft }]}>
          <Text style={{ color: colors.success, fontWeight: '700', fontSize: 15 }}>
            {joined ? '✓ Added you' : '✓ You’re on it'}
          </Text>
        </View>
      ) : onMeToo ? (
        <Button title="Me too" onPress={onMeToo} loading={loading} style={styles.meToo} />
      ) : null}
    </View>
  );
}

export function duplicateCardProps(d: DuplicateIssueInfo) {
  return { number: d.number, title: d.title, status: d.status, affectedCount: d.affectedCount, alreadyAffected: d.alreadyAffected };
}

export function InlineLoading() {
  const { colors } = useTheme();
  return <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.md }} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
    minHeight: TAP_MIN + 16,
  },
  otherIcon: { width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '600' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  dup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 2,
  },
  meToo: { minWidth: 110, paddingHorizontal: spacing.lg },
  joined: { borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
});
