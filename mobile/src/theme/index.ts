import { useColorScheme } from 'react-native';
import type { SpaceType } from '@condo/shared';

export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  danger: string;
  dangerSoft: string;
  success: string;
  warning: string;
  common: string;
  commonSoft: string;
  private: string;
  privateSoft: string;
}

const light: Palette = {
  background: '#F2F3F7',
  surface: '#FFFFFF',
  surfaceAlt: '#E9EBF0',
  border: '#D9DCE3',
  text: '#14161A',
  textMuted: '#646A75',
  primary: '#2F5BEA',
  primaryText: '#FFFFFF',
  danger: '#D2343B',
  dangerSoft: '#FCE8E9',
  success: '#1F8A4C',
  warning: '#B26A00',
  common: '#1F7A6B',
  commonSoft: '#DDF3EE',
  private: '#7A4BC2',
  privateSoft: '#EEE6FA',
};

const dark: Palette = {
  background: '#0E0F12',
  surface: '#1A1C21',
  surfaceAlt: '#262931',
  border: '#33363F',
  text: '#F2F3F5',
  textMuted: '#A0A6B1',
  primary: '#6F8DFF',
  primaryText: '#0B0D12',
  danger: '#FF6B70',
  dangerSoft: '#3A1D1F',
  success: '#4CC584',
  warning: '#F0AA3C',
  common: '#4FC7B1',
  commonSoft: '#173430',
  private: '#B892F5',
  privateSoft: '#2C2240',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;
export const font = {
  title: { fontSize: 28, fontWeight: '700' as const },
  heading: { fontSize: 20, fontWeight: '600' as const },
  body: { fontSize: 16 },
  label: { fontSize: 14, fontWeight: '600' as const },
  small: { fontSize: 13 },
};
/** Minimum height for anything tappable. Reporting must be fast — keep targets big. */
export const TAP_MIN = 56;

export const SPACE_TYPE_COLORS: Record<SpaceType, string> = {
  BUILDING: '#2F5BEA',
  FLOOR: '#3C8DD9',
  UNIT: '#7A4BC2',
  ROOM: '#C2557A',
  COMMON_AREA: '#1F7A6B',
};

export const SPACE_TYPE_GLYPH: Record<SpaceType, string> = {
  BUILDING: 'B',
  FLOOR: 'F',
  UNIT: 'U',
  ROOM: 'R',
  COMMON_AREA: 'C',
};

export function useTheme() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return { colors: isDark ? dark : light, isDark };
}

export type Theme = ReturnType<typeof useTheme>;
