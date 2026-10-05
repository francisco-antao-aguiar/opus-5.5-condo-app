import { useLocalSearchParams } from 'expo-router';
import { ResolveAsset } from '../../components/qr/ResolveAsset';

/** Web path printed on QR labels (https://…/r/{assetId}); same screen as /report/asset/{assetId}. */
export default function PrintedLabelLink() {
  const { assetId } = useLocalSearchParams<{ assetId: string }>();
  return <ResolveAsset rawId={String(assetId ?? '')} />;
}
