import { useLocalSearchParams } from 'expo-router';
import { SpaceBrowser } from '../../../../components/spaces/SpaceBrowser';

/** Building home: the space browser at the root node, with the building header. */
export default function BuildingScreen() {
  const { buildingId } = useLocalSearchParams<{ buildingId: string }>();
  return <SpaceBrowser buildingId={buildingId} />;
}
