import { View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Button } from '../../../../../components/Button';
import { IssueList } from '../../../../../components/issues/IssueList';
import { useMyPermissions } from '../../../../../hooks/queries';
import { useTheme } from '../../../../../theme';

/** Issues of one building (mine / building / my unit / manage). */
export default function BuildingIssuesScreen() {
  const { buildingId } = useLocalSearchParams<{ buildingId: string }>();
  const { colors } = useTheme();
  const perms = useMyPermissions(buildingId);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Issues' }} />
      <IssueList
        buildingId={buildingId}
        perms={perms.data}
        header={<Button title="Report a problem" onPress={() => router.push(`/buildings/${buildingId}/report`)} />}
      />
    </View>
  );
}
