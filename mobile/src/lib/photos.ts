import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

/** A photo picked for a report: enough to rebuild the multipart upload later (offline queue). */
export interface LocalPhoto {
  uri: string;
  name: string;
  type: string;
}

export const MAX_PHOTOS = 5;

function toLocal(a: ImagePicker.ImagePickerAsset): LocalPhoto {
  const type = a.mimeType ?? 'image/jpeg';
  const ext = type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
  return { uri: a.uri, name: a.fileName ?? `photo-${Date.now()}.${ext}`, type };
}

/**
 * Camera or library. Returns null when cancelled or permission was refused (the caller shows why).
 * Quality 0.6 keeps photos well under the 10 MB limit and quick to upload on mobile data.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<LocalPhoto | 'denied' | null> {
  if (source === 'camera') {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return 'denied';
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    return res.canceled ? null : toLocal(res.assets[0]);
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
  return res.canceled ? null : toLocal(res.assets[0]);
}

/** Multipart body with field "file". Web needs a real Blob; React Native takes { uri, name, type }. */
export async function photoForm(p: LocalPhoto): Promise<FormData> {
  const form = new FormData();
  if (Platform.OS === 'web') {
    const blob = await (await fetch(p.uri)).blob();
    form.append('file', blob, p.name);
  } else {
    form.append('file', { uri: p.uri, name: p.name, type: p.type } as unknown as Blob);
  }
  return form;
}
