import { Text, View } from 'react-native';
import { router } from 'expo-router';
import type { CostCategory, UUID } from '@condo/shared';
import { useCostSummary } from '../../hooks/queries';
import { formatTotals } from '../../lib/money';
import { spacing, useTheme } from '../../theme';
import { Button } from '../Button';
import { Card } from '../Layout';

/**
 * "Costs: €340.00 (3)" for COST_VIEW holders, plus "Add cost" for COST_MANAGE. Totals are per currency
 * (never mixed) and summed exactly from the decimal strings.
 */
export function CostsCard({
  buildingId,
  issueId,
  assetId,
  canView,
  canManage,
  defaultDescription,
  defaultCategory,
}: {
  buildingId: UUID;
  issueId?: UUID;
  assetId?: UUID;
  canView: boolean;
  canManage: boolean;
  defaultDescription?: string;
  defaultCategory?: CostCategory;
}) {
  const { colors } = useTheme();
  const costs = useCostSummary(buildingId, issueId ? { issueId } : { assetId }, canView);
  if (!canView && !canManage) return null;
  const total = costs.data?.count ?? 0;
  const query = issueId ? `issueId=${issueId}` : `assetId=${assetId}`;
  return (
    <Card>
      {canView ? (
        <View style={{ gap: spacing.xs }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }}>
            {costs.isPending
              ? 'Costs: …'
              : costs.isError
                ? "Costs: couldn't load"
                : total
                  ? `Costs: ${formatTotals(costs.data!.totals)} (${total})`
                  : 'Costs: none recorded'}
          </Text>
        </View>
      ) : null}
      {canManage ? (
        <Button
          title="Add cost"
          variant="secondary"
          onPress={() =>
            router.push(
              `/buildings/${buildingId}/costs/new?${query}${defaultDescription ? '&title=' + encodeURIComponent(defaultDescription) : ''}${defaultCategory ? '&category=' + defaultCategory : ''}`,
            )
          }
        />
      ) : null}
    </Card>
  );
}
