import { useLocalSearchParams } from 'expo-router';
import { SpaceBrowser } from '../../../../../components/spaces/SpaceBrowser';

/** One level of the drill-down space browser. Deep-linkable: buildingapp://buildings/{b}/spaces/{s} */
export default function SpaceScreen() {
  const { buildingId, spaceId } = useLocalSearchParams<{ buildingId: string; spaceId: string }>();
  return <SpaceBrowser buildingId={buildingId} spaceId={spaceId} />;
}
