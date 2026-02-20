import type { VNPackage } from '../../server/vn/types/vnTypes';

/**
 * Resolves an asset key to its file URL from the VNPackage asset pack.
 * Looks up backgrounds first, then characters.
 * @returns URL string, or '/assets/placeholder.png' if key is missing or unknown.
 */
export function resolveAsset(key: string | undefined, pack: VNPackage): string {
  if (!key) {
    console.log('[resolveAsset] key is falsy:', key);
    return '/assets/placeholder.png';
  }
  const bgUrl = pack.assets.backgrounds[key]?.url;
  const charUrl = pack.assets.characters[key]?.url;
  const result = bgUrl ?? charUrl ?? '/assets/placeholder.png';
  console.log('[resolveAsset]', { key, bgUrl, charUrl, result, bgKeys: Object.keys(pack.assets.backgrounds) });
  return result;
}
