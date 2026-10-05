import { Platform } from 'react-native';

/**
 * API base URL. Set EXPO_PUBLIC_API_URL to override (required on physical devices:
 * use your machine's LAN IP, e.g. http://192.168.1.20:8080/api).
 * Android emulator reaches the host machine via 10.0.2.2.
 */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:8080/api' : 'http://localhost:8080/api');
