import { useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Button } from '../../components/Button';
import { Card, ScrollScreen } from '../../components/Layout';
import { LoadingView } from '../../components/StateView';
import { TextField } from '../../components/TextField';
import { routeForScannedCode } from '../../lib/scanCodes';
import { radius, spacing, useTheme } from '../../theme';

/**
 * In-app scanner for the QR labels on assets (web link, app link or bare id) and for invitations
 * (join link or 8-character code). Manual entry is always available, including when the camera
 * permission was refused.
 */
export default function ScanScreen() {
  const { colors } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState<string | null>(null);
  const [manual, setManual] = useState('');
  const [active, setActive] = useState(true);
  const busy = useRef(false);
  const last = useRef<{ data: string; at: number } | null>(null);

  // Pause the camera when navigating away; resume when coming back.
  useFocusEffect(
    useCallback(() => {
      setActive(true);
      busy.current = false;
      return () => setActive(false);
    }, []),
  );

  function go(text: string): boolean {
    const route = routeForScannedCode(text);
    if (!route) return false;
    busy.current = true;
    router.replace(route as never);
    return true;
  }

  function onScanned(result: BarcodeScanningResult) {
    const now = Date.now();
    // Debounce: the camera reports the same code many times per second.
    if (busy.current) return;
    if (last.current && last.current.data === result.data && now - last.current.at < 3000) return;
    last.current = { data: result.data, at: now };
    if (!go(result.data)) {
      setMessage("That isn't a Condo code. Look for the label with “Scan to report a problem”.");
      setTimeout(() => setMessage(null), 3000);
    }
  }

  function submitManual() {
    if (!go(manual)) setMessage("That doesn't look like an item link, item code or invite code.");
  }

  const manualEntry = (
    <Card>
      <TextField
        label="Or type / paste the code"
        value={manual}
        onChangeText={(t) => {
          setManual(t);
          setMessage(null);
        }}
        placeholder="Link from the label, or invite code ABCD-EFGH"
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={submitManual}
      />
      <Button title="Continue" variant="secondary" onPress={submitManual} disabled={!manual.trim()} />
    </Card>
  );

  if (!permission) return <LoadingView />;

  if (!permission.granted) {
    return (
      <ScrollScreen>
        <Card>
          <Text style={[styles.h1, { color: colors.text }]}>Scan the QR code on the item</Text>
          <Text style={{ color: colors.textMuted, fontSize: 16, lineHeight: 22 }}>
            Lights, doors, the lift and other items in the building have a label with a QR code. Scanning it takes
            you straight to reporting a problem with that item. Condo only uses the camera while this screen is open.
          </Text>
          {permission.canAskAgain ? (
            <Button title="Allow camera" onPress={() => void requestPermission()} style={{ minHeight: 60 }} />
          ) : (
            <>
              <Text style={{ color: colors.danger, fontSize: 15 }}>
                Camera access is turned off for Condo.
                {Platform.OS !== 'web' ? ' You can turn it on in Settings.' : ' Allow it in your browser’s site settings.'}
              </Text>
              {Platform.OS !== 'web' ? (
                <Button title="Open Settings" variant="secondary" onPress={() => void Linking.openSettings()} />
              ) : null}
            </>
          )}
        </Card>
        {message ? <Text style={{ color: colors.danger, fontSize: 15 }}>{message}</Text> : null}
        {manualEntry}
        <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
      </ScrollScreen>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: '#000' }]}>
      {active ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScanned}
        />
      ) : null}
      <View style={styles.overlay} pointerEvents="box-none">
        <View style={styles.frame} accessibilityLabel="Point the camera at the QR code" />
        <Text style={styles.hint}>Point at the QR code on the label</Text>
        {message ? (
          <View style={[styles.message, { backgroundColor: colors.dangerSoft }]}>
            <Text style={{ color: colors.danger, fontSize: 15, textAlign: 'center' }}>{message}</Text>
          </View>
        ) : null}
      </View>
      <View style={[styles.bottom, { backgroundColor: colors.background }]}>
        {manualEntry}
        <Button title="Cancel" variant="ghost" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  h1: { fontSize: 22, fontWeight: '800' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.lg },
  frame: { width: 240, height: 240, borderWidth: 4, borderColor: '#fff', borderRadius: radius.lg },
  hint: { color: '#fff', fontSize: 17, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 4 },
  message: { borderRadius: radius.md, padding: spacing.md, maxWidth: 360 },
  bottom: { padding: spacing.lg, gap: spacing.sm, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
});
