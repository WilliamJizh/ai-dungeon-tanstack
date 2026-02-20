import type { VNPackage } from '../types/vnTypes.js';

/**
 * Renders an ASCII tree representation of the story structure for console output.
 * Used for: server console output after planning and dev debugging only.
 */
export function renderStoryTree(pkg: VNPackage): string {
  const totalScenes = pkg.plot.acts.reduce((sum, act) => sum + act.scenes.length, 0);
  const totalBeats = pkg.plot.acts.reduce(
    (sum, act) => sum + act.scenes.reduce((s, scene) => s + scene.beats.length, 0),
    0,
  );

  const lines: string[] = [];
  lines.push(`${pkg.title.toUpperCase()}  \u00b7  ${pkg.plot.acts.length} acts \u00b7 ${totalScenes} scenes \u00b7 ${totalBeats} beats`);
  lines.push('\u2550'.repeat(54));

  for (const act of pkg.plot.acts) {
    lines.push(`\u25b8 ${act.title.toUpperCase()}`);
    for (const [si, scene] of act.scenes.entries()) {
      const isLastScene = si === act.scenes.length - 1;
      const branch = isLastScene ? '\u2514\u2500' : '\u251c\u2500';
      const sceneLine = `  ${branch} Scene ${si + 1}: ${scene.title.padEnd(20)} [bg: ${scene.location}] [\u266a ${scene.mood}]`;
      lines.push(sceneLine);

      for (const [bi, beat] of scene.beats.entries()) {
        const isLastBeat = bi === scene.beats.length - 1;
        const connector = isLastScene ? ' ' : '\u2502';
        const beatBranch = isLastBeat ? '\u2514\u2500' : '\u251c\u2500';
        if (isLastBeat) {
          lines.push(`  ${connector}   ${beatBranch} [EXIT \u2192 ${scene.exitConditions[0]}]`);
        } else {
          lines.push(`  ${connector}   ${beatBranch} Beat ${bi + 1}: ${beat}`);
        }
      }
    }
  }

  lines.push('\u2550'.repeat(54));
  const bgCount = Object.keys(pkg.assets.backgrounds).length;
  const charCount = Object.keys(pkg.assets.characters).length;
  const musicCount = Object.keys(pkg.assets.music).length;
  lines.push(`ASSETS  backgrounds:${bgCount}  characters:${charCount}  music:${musicCount}`);

  return lines.join('\n');
}
