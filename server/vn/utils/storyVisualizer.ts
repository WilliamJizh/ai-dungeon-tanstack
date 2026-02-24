import type { VNPackage } from '../types/vnTypes.js';

/**
 * Renders an ASCII tree representation of the story structure for console output.
 * Used for: server console output after planning and dev debugging only.
 */
export function renderStoryTree(pkg: VNPackage): string {
  const allLocations = pkg.plot.acts.flatMap(a => a.sandboxLocations || []);
  const totalLocations = allLocations.length;
  const totalEncounters = allLocations.reduce(
    (sum, loc) => sum + (loc.encounters?.length ?? 0),
    0,
  );

  const lines: string[] = [];
  lines.push(`${pkg.title.toUpperCase()}  \u00b7  ${pkg.plot.acts.length} acts \u00b7 ${totalLocations} locations \u00b7 ${totalEncounters} encounters`);
  lines.push('\u2550'.repeat(54));

  for (const act of pkg.plot.acts) {
    lines.push(`\u25b8 ACT: ${act.title.toUpperCase()}`);
    if (act.globalProgression) {
      lines.push(`  \u2502 Progress: ${act.globalProgression.trackerLabel} (need ${act.globalProgression.requiredValue})`);
    }
    if (act.opposingForce) {
      lines.push(`  \u2502 Doom Clock: ${act.opposingForce.trackerLabel} (max ${act.opposingForce.requiredValue})`);
    }
    for (const loc of act.sandboxLocations || []) {
      lines.push(`  \u25b8 ${loc.title.toUpperCase()} [bg: ${loc.location}] [\u266a ${loc.mood}]`);
      const encounters = loc.encounters ?? [];
      for (const [ei, enc] of encounters.entries()) {
        const isLast = ei === encounters.length - 1;
        const branch = isLast ? '  \u2514\u2500' : '  \u251c\u2500';
        const prog = enc.givesProgression ? ` (+${enc.givesProgression})` : '';
        lines.push(`  ${branch} [${enc.type}] ${enc.title}${prog}`);
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
