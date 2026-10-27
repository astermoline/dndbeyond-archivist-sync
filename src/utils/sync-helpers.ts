import { CharacterData, MonsterData, ItemData } from '@astermoe/dndbeyond-parser';

export const ELIGIBLE_MAGIC_ITEM_RARITIES = [
  'uncommon',
  'rare',
  'very rare',
  'legendary',
  'artifact',
];

export function isEligibleMagicItem(rarity?: string | null): boolean {
  if (!rarity) return false;
  const r = rarity.toLowerCase().trim();
  return ELIGIBLE_MAGIC_ITEM_RARITIES.includes(r);
}

/**
 * Detects whether an image URL is a low-resolution cropped/thumbnail version from D&D Beyond.
 * For example: /thumbnails/.../35/35/... or /thumbnails/.../100/100/... or ?width=150
 */
export function isLowResThumbnail(url?: string | null): boolean {
  if (!url) return false;
  return (
    //thumbnails/d+/d+/(?:[1-9]d?|1[0-5]d)/(?:[1-9]d?|1[0-5]d)//.test(url) ||
    /[?&](?:width|height)=(?:[1-9]d?|1[0-5]d)(?:&|$)/i.test(url)
  );
}

/**
 * Formats tabular data into Archivist's native [TABLE] markup syntax.
 * Example output:
 * [TABLE]
 * Columns: STR | DEX | CON | INT | WIS | CHA
 * Row 1: 8 | 15 | 14 | 10 | 12 | 19
 * [/TABLE]
 */
export function formatArchivistTable(columns: string[], rows: (string | number)[][]): string {
  const colLine = `Columns: ${columns.join(' | ')}`;
  const rowLines = rows.map((row, idx) => `Row ${idx + 1}: ${row.join(' | ')}`);
  return `[TABLE]\n${colLine}\n${rowLines.join('\n')}\n[/TABLE]`;
}

/**
 * Formats character or monster ability scores into a single-line string.
 * Example: STR: 8 (-1) | DEX: 13 (+1) | CON: 15 (+2) | INT: 20 (+5) | WIS: 15 (+2) | CHR: 20 (+5)
 */
export function formatAbilityScoresLine(abilities: {
  strength: { score: number; modifier: string };
  dexterity: { score: number; modifier: string };
  constitution: { score: number; modifier: string };
  intelligence: { score: number; modifier: string };
  wisdom: { score: number; modifier: string };
  charisma: { score: number; modifier: string };
}): string {
  return [
    `STR: ${abilities.strength.score} (${abilities.strength.modifier})`,
    `DEX: ${abilities.dexterity.score} (${abilities.dexterity.modifier})`,
    `CON: ${abilities.constitution.score} (${abilities.constitution.modifier})`,
    `INT: ${abilities.intelligence.score} (${abilities.intelligence.modifier})`,
    `WIS: ${abilities.wisdom.score} (${abilities.wisdom.modifier})`,
    `CHR: ${abilities.charisma.score} (${abilities.charisma.modifier})`,
  ].join(' | ');
}

export function formatCharacterStatBlock(char: CharacterData, ddbUrl: string): string {
  const abilitySummary = formatAbilityScoresLine(char.abilities);

  return `### Stat Block

**Level ${char.totalLevel} ${char.species} ${char.classLine}**

- **AC:** ${char.ac.value} | **HP:** ${char.hp.value}/${char.hp.max} | **Speed:** ${char.speed}
- **Senses:** ${char.senses.join(', ')}
- **Languages:** ${char.languages.join(', ')}

#### Ability Scores
${abilitySummary}

---
[View on D&D Beyond](${ddbUrl})`;
}

export function formatMonsterStatBlock(monster: MonsterData, ddbUrl: string): string {
  const abilitySummary = formatAbilityScoresLine(monster.abilities);

  const sections: string[] = [];

  if (monster.traits?.length) {
    sections.push(`#### Traits\n` + monster.traits.map((t) => `**${t.name}.** ${t.description}`).join('\n\n'));
  }
  if (monster.actions?.length) {
    sections.push(`#### Actions\n` + monster.actions.map((a) => `**${a.name}.** ${a.description}`).join('\n\n'));
  }
  if (monster.bonusActions?.length) {
    sections.push(`#### Bonus Actions\n` + monster.bonusActions.map((b) => `**${b.name}.** ${b.description}`).join('\n\n'));
  }
  if (monster.reactions?.length) {
    sections.push(`#### Reactions\n` + monster.reactions.map((r) => `**${r.name}.** ${r.description}`).join('\n\n'));
  }
  if (monster.legendaryActions?.length) {
    sections.push(`#### Legendary Actions\n` + monster.legendaryActions.map((l) => `**${l.name}.** ${l.description}`).join('\n\n'));
  }

  const extraSections = sections.length ? '\n\n' + sections.join('\n\n') : '';

  return `### Stat Block

**${monster.size} ${monster.type}, ${monster.alignment}**

- **CR:** ${monster.cr} (${monster.xp} XP)
- **AC:** ${monster.ac.value}${monster.ac.formula ? ` (${monster.ac.formula})` : ''} | **HP:** ${monster.hp.value}${monster.hp.formula ? ` (${monster.hp.formula})` : ''} | **Speed:** ${monster.speed}
- **Senses:** ${monster.senses.join(', ')}
- **Languages:** ${monster.languages.join(', ')}

#### Ability Scores
${abilitySummary}${extraSections}

---
[View on D&D Beyond](${ddbUrl})`;
}

export function formatItemDetails(item: ItemData, ddbUrl: string): string {
  const attunement = item.requiresAttunement
    ? `\n*Requires Attunement${item.attunementDescription ? ` (${item.attunementDescription})` : ''}*`
    : '';

  return `### Item Details

**${item.rarity ? `${item.rarity} ` : ''}${item.type}**${attunement}

${item.description}

---
[View on D&D Beyond](${ddbUrl})`;
}

export type StatBlockHeader =
  | '### Stat Block'
  | '### Item Details'
  | '# Stat Block'
  | '# Item Details';

const DNDBEYOND_DIVIDER_REGEX = /(?:(?:\r?\n)?[ \t]*---+[ \t]*)?(?:\[(?:View on )?D&D Beyond[^\]]*\]\([^\s)]+\)|\[[^\]]*\]\(https?:\/\/(?:www\.)?dndbeyond\.com\/[^\s)]+\)|https?:\/\/(?:www\.)?dndbeyond\.com\/[^\s)]+)(?:[ \t]*\r?\n[ \t]*---+)?/i;

/**
 * Merges a newly formatted stat block section into an existing description.
 * Looks for ### Stat Block (or # Stat Block / Item Details) and the D&D Beyond link anywhere in the description.
 * If found, replaces that section in-place, preserving surrounding descriptive text.
 * If not found, adds it to the end of the description.
 */
export function mergeStatBlockIntoDescription(
  existingDescription: string,
  newStatBlockSection: string,
  sectionHeader: StatBlockHeader = '### Stat Block'
): string {
  if (!existingDescription || !existingDescription.trim()) {
    return newStatBlockSection;
  }

  const normalized = existingDescription.replace(/\r\n/g, '\n');
  const label = sectionHeader.replace(/^#+\s*/, '').trim();
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headerRegex = new RegExp(`(?:^|\\n)[ \\t]*(#{1,6}[ \\t]*${escapedLabel}\\b)`, 'i');
  const headerMatch = headerRegex.exec(normalized);

  if (!headerMatch) {
    // No existing stat block: add to the end of existing description
    return `${normalized.trim()}\n\n${newStatBlockSection}`;
  }

  const leadingNewline = headerMatch[0].startsWith('\n') ? 1 : 0;
  const headerStart = headerMatch.index + leadingNewline;

  const afterHeader = normalized.slice(headerStart);
  const dividerMatch = DNDBEYOND_DIVIDER_REGEX.exec(afterHeader);

  if (dividerMatch) {
    // Found both header and divider link! Replace the stat block span in-place
    const beforeBlock = normalized.slice(0, headerStart).trim();
    const afterDivider = afterHeader.slice(dividerMatch.index + dividerMatch[0].length).trim();

    const parts = [
      beforeBlock,
      newStatBlockSection,
      afterDivider,
    ].filter(Boolean);

    return parts.join('\n\n');
  }

  // Header found without divider link: replace from header to end
  const beforeBlock = normalized.slice(0, headerStart).trim();
  const parts = [beforeBlock, newStatBlockSection].filter(Boolean);
  return parts.join('\n\n');
}

/**
 * Extracts only user notes/lore from an Archivist description, stripping out the D&D Beyond stat block section.
 * Returns any text before and/or after the stat block and divider link.
 * Used when syncing back to D&D Beyond Notes -> Backstory.
 */
export function extractUserNotesFromDescription(
  description: string,
  sectionHeader: StatBlockHeader = '### Stat Block'
): string {
  if (!description || !description.trim()) return '';
  const normalized = description.replace(/\r\n/g, '\n');

  const label = sectionHeader.replace(/^#+\s*/, '').trim();
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headerRegex = new RegExp(`(?:^|\\n)[ \\t]*(#{1,6}[ \\t]*${escapedLabel}\\b)`, 'i');
  const headerMatch = headerRegex.exec(normalized);

  if (!headerMatch) {
    return normalized.trim();
  }

  const leadingNewline = headerMatch[0].startsWith('\n') ? 1 : 0;
  const headerStart = headerMatch.index + leadingNewline;
  const beforeBlock = normalized.slice(0, headerStart).trim();

  const afterHeader = normalized.slice(headerStart);
  const dividerMatch = DNDBEYOND_DIVIDER_REGEX.exec(afterHeader);

  if (dividerMatch) {
    const afterDivider = afterHeader.slice(dividerMatch.index + dividerMatch[0].length).trim();
    const parts = [beforeBlock, afterDivider].filter(Boolean);
    return parts.join('\n\n').trim();
  }

  return beforeBlock;
}
