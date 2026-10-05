import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { MAX_PHOTOS, pickPhoto, type LocalPhoto } from '../../lib/photos';
import { radius, spacing, useTheme } from '../../theme';
import { Button } from '../Button';

/** Optional photos for a report: camera / library buttons and removable thumbnails. */
export function PhotoPicker({
  photos,
  onChange,
  max = MAX_PHOTOS,
}: {
  photos: LocalPhoto[];
  onChange: (photos: LocalPhoto[]) => void;
  max?: number;
}) {
  const { colors } = useTheme();
  const [denied, setDenied] = useState(false);

  async function add(source: 'camera' | 'library') {
    const p = await pickPhoto(source);
    if (p === 'denied') {
      setDenied(true);
      return;
    }
    setDenied(false);
    if (p) onChange([...photos, p].slice(0, max));
  }

  return (
    <View style={styles.wrap}>
      {photos.length ? (
        <View style={styles.thumbs}>
          {photos.map((p, i) => (
            <View key={p.uri + i}>
              <Image source={{ uri: p.uri }} style={[styles.thumb, { backgroundColor: colors.surfaceAlt }]} accessibilityLabel={'Photo ' + (i + 1)} />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Remove photo ' + (i + 1)}
                onPress={() => onChange(photos.filter((_, j) => j !== i))}
                hitSlop={8}
                style={[styles.remove, { backgroundColor: colors.text }]}
              >
                <Text style={{ color: colors.background, fontWeight: '800' }}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      {photos.length < max ? (
        <View style={styles.buttons}>
          <Button title="📷 Take photo" variant="secondary" onPress={() => void add('camera')} style={styles.btn} />
          <Button title="🖼 Choose photo" variant="secondary" onPress={() => void add('library')} style={styles.btn} />
        </View>
      ) : null}
      {denied ? (
        <Text style={{ color: colors.danger, fontSize: 14 }}>
          Camera access is off. You can allow it in your phone's settings, or choose a photo instead.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  thumb: { width: 76, height: 76, borderRadius: radius.md },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  btn: { flex: 1, paddingHorizontal: spacing.sm },
});
