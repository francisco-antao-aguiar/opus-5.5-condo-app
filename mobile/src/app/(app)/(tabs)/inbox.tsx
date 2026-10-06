import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../../api/queryKeys';
import type { NotificationDto, NotificationType } from '@condo/shared';
import { Button } from '../../../components/Button';
import { EmptyView, ErrorView } from '../../../components/StateView';
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotificationList } from '../../../hooks/queries';
import { timeAgo } from '../../../lib/issues';
import { openLink } from '../../../notifications/push';
import { radius, spacing, TAP_MIN, useTheme } from '../../../theme';

/** Icon per notification type (unknown future types fall back to a bell). */
const TYPE_ICON: Partial<Record<NotificationType, string>> = {
  ISSUE_REPORTED: '🆕',
  ISSUE_STATUS_CHANGED: '🔧',
  ISSUE_COMMENTED: '💬',
  ISSUE_MERGED: '🔗',
  TASK_DUE: '🛠',
  TASK_OVERDUE: '⏰',
  BOOKING_REQUESTED: '📅',
  BOOKING_REVIEW_REMINDER: '⏳',
  BOOKING_CONFIRMED: '✅',
  BOOKING_REJECTED: '❌',
  BOOKING_CANCELLED: '🚫',
};

/** In-app notifications: newest first, unread dot, tap → mark read + open the issue. */
export default function InboxScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const list = useNotificationList();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const [refreshing, setRefreshing] = useState(false);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];
  const qc = useQueryClient();

  // Opening the tab always shows the latest (and refreshes the badge).
  useFocusEffect(
    useCallback(() => {
      void qc.invalidateQueries({ queryKey: queryKeys.notifications });
    }, [qc]),
  );
  const anyUnread = items.some((n) => !n.read);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        anyUnread ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => markAll.mutate()}
            hitSlop={8}
            style={({ pressed }) => ({ minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, opacity: pressed ? 0.6 : 1 })}
          >
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: '600' }}>Mark all read</Text>
          </Pressable>
        ) : null,
    });
  }, [navigation, anyUnread, colors.primary, markAll]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await list.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  function open(n: NotificationDto) {
    if (!n.read) markRead.mutate(n.id);
    openLink(n.link, true);
  }

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        onEndReached={() => {
          if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
        }}
        ListEmptyComponent={
          list.isPending ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
          ) : list.isError ? (
            <View style={{ minHeight: 280 }}>
              <ErrorView error={list.error} onRetry={() => void list.refetch()} />
            </View>
          ) : (
            <EmptyView
              title="No notifications yet"
              message="You'll hear here when a problem you reported is acknowledged, fixed or gets a reply."
            />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={(item.read ? '' : 'Unread. ') + item.title + '. ' + item.body}
            onPress={() => open(item)}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? colors.surfaceAlt : colors.surface }]}
          >
            <View style={[styles.dot, { backgroundColor: item.read ? 'transparent' : colors.primary }]} />
            <Text style={styles.icon} accessibilityElementsHidden importantForAccessibility="no">
              {TYPE_ICON[item.type] ?? '🔔'}
            </Text>
            <View style={styles.flex}>
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: item.read ? '500' : '700' }}>{item.title}</Text>
              <Text style={{ color: colors.text, fontSize: 15 }} numberOfLines={3}>
                {item.body}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {item.buildingName} · {timeAgo(item.createdAt)}
              </Text>
            </View>
          </Pressable>
        )}
        ListFooterComponent={
          list.hasNextPage ? <Button title="Load more" variant="ghost" onPress={() => void list.fetchNextPage()} /> : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: spacing.lg, flexGrow: 1 },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    minHeight: TAP_MIN + 8,
    alignItems: 'flex-start',
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 7 },
  icon: { fontSize: 22, marginTop: 1 },
});
