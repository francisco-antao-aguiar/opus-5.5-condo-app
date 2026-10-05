import { useLocalSearchParams } from 'expo-router';
import { ResolveAsset } from '../../../components/qr/ResolveAsset';

/** buildingapp://report/asset/{assetId} — the app route a QR label / notification resolves to. */
export default function ReportAssetDeepLink() {
  const { assetId } = useLocalSearchParams<{ assetId: string }>();
  return <ResolveAsset rawId={String(assetId ?? '')} />;
}
