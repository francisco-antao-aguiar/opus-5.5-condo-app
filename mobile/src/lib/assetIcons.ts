/**
 * Asset type icon keys (AssetTypeDto.icon) → glyph + tile colour. Asset types are server data, so
 * unknown keys fall back to a generic tool. Emoji are used because they need no icon font/package.
 */
const ICONS: Record<string, { glyph: string; color: string }> = {
  bulb: { glyph: '💡', color: '#F5B700' },
  elevator: { glyph: '🛗', color: '#3C8DD9' },
  door: { glyph: '🚪', color: '#A0663B' },
  gate: { glyph: '🚧', color: '#E07A1F' },
  intercom: { glyph: '📞', color: '#2F9E8F' },
  boiler: { glyph: '♨️', color: '#D2343B' },
  plumbing: { glyph: '🚰', color: '#2F7FD9' },
  window: { glyph: '🪟', color: '#5AA9C9' },
  fire: { glyph: '🧯', color: '#C62828' },
  tool: { glyph: '🔧', color: '#6B7280' },
};

const FALLBACK = ICONS.tool;

export function assetIcon(iconKey: string | null | undefined): { glyph: string; color: string } {
  return (iconKey && ICONS[iconKey]) || FALLBACK;
}

/** Built-in type → icon key, used until the catalog (which carries the real icon key) has loaded. */
const TYPE_ICON: Record<string, string> = {
  LIGHT: 'bulb',
  ELEVATOR: 'elevator',
  DOOR: 'door',
  GATE: 'gate',
  INTERCOM: 'intercom',
  BOILER: 'boiler',
  PLUMBING: 'plumbing',
  WINDOW: 'window',
  FIRE_SAFETY: 'fire',
  OTHER: 'tool',
};

/** Icon for an asset type code, preferring the catalog's icon key. */
export function assetTypeIcon(
  typeCode: string,
  catalog?: { code: string; icon: string }[] | null,
): { glyph: string; color: string } {
  return assetIcon(catalog?.find((t) => t.code === typeCode)?.icon ?? TYPE_ICON[typeCode]);
}
