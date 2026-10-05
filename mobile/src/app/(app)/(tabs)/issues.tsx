import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { Button } from '../../../components/Button';
import { Chip, ChipGroup } from '../../../components/Controls';
import { IssueList } from '../../../components/issues/IssueList';
import { PendingReports } from '../../../components/issues/PendingReports';
import { EmptyView, QueryGate } from '../../../components/StateView';
import { useBuildings, useMyPermissions } from '../../../hooks/queries';
import { spacing, useTheme } from '../../../theme';

// Remember the chosen building while the app runs.
let lastBuildingId: string | null = null;

/** "Issues" tab: my reports and the building's open problems, per building. */
export default function IssuesTab() {
  const { colors } = useTheme();
  const buildingsQuery = useBuildings();
  const [selected, setSelected] = useState<string | null>(lastBuildingId);
  const buildings = buildingsQuery.data ?? [];
  const buildingId = buildings.find((b) => b.id === selected)?.id ?? buildings[0]?.id ?? null;
  const perms = useMyPermissions(buildingId ?? '');

  const select = (id: string) => {
    lastBuildingId = id;
    setSelected(id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <QueryGate queries={[buildingsQuery]}>
        {() =>
          !buildingId ? (
            <View style={{ flex: 1, padding: spacing.lg }}>
              <PendingReports />
              <EmptyView title="No buildings yet" message="Join or create a building to report problems." />
            </View>
          ) : (
            <IssueList
              key={buildingId}
              buildingId={buildingId}
              perms={perms.data}
              header={
                <View style={{ gap: spacing.md }}>
                  {buildings.length > 1 ? (
                    <ChipGroup>
                      {buildings.map((b) => (
                        <Chip key={b.id} label={b.name} selected={b.id === buildingId} onPress={() => select(b.id)} />
                      ))}
                    </ChipGroup>
                  ) : null}
                  <Button title="Report a problem" onPress={() => router.push(`/buildings/${buildingId}/report`)} />
                </View>
              }
            />
          )
        }
      </QueryGate>
    </View>
  );
}
