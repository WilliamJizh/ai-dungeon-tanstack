import type { VNPackage } from '../types/vnTypes.js';

/**
 * Renders an ASCII tree representation of the story structure for console output.
 * Used for: server console output after planning and dev debugging only.
 */
export function renderStoryTree(pkg: VNPackage): string {
  const allNodes = pkg.plot.acts.flatMap(a => a.nodes);
  const totalNodes = allNodes.length;
  const totalBeats = allNodes.reduce(
    (sum, node) => sum + node.beats.length,
    0,
  );

  const lines: string[] = [];
  lines.push(`${pkg.title.toUpperCase()}  \u00b7  ${pkg.plot.acts.length} acts \u00b7 ${totalNodes} nodes \u00b7 ${totalBeats} beats`);
  lines.push('\u2550'.repeat(54));

  for (const act of pkg.plot.acts) {
    lines.push(`\u25b8 ACT: ${act.title.toUpperCase()}`);
    for (const node of act.nodes) {
      lines.push(`  \u25b8 ${node.title.toUpperCase()} [bg: ${node.location}] [\u266a ${node.mood}]`);
      for (const [bi, beat] of node.beats.entries()) {
        const isLastBeat = bi === node.beats.length - 1;
        const beatBranch = isLastBeat ? '  \u2514\u2500' : '  \u251c\u2500';
        lines.push(`  ${beatBranch} Beat ${bi + 1}: ${beat.description.substring(0, 30)}...`);
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
