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

export function formatCharacterStatBlock(char: CharacterData, ddbUrl: string): string {
  const abilitySummary = `| STR | DEX | CON | INT | WIS | CHA |\n| :---: | :---: | :---: | :---: | :---: | :---: |\n| ${char.abilities.strength.score} | ${char.abilities.dexterity.score} | ${char.abilities.constitution.score} | ${char.abilities.intelligence.score} | ${char.abilities.wisdom.score} | ${char.abilities.charisma.score} |`;

  return `# Stat Block

**Level ${char.totalLevel} ${char.species} ${char.classLine}**

- **AC:** ${char.ac.value} | **HP:** ${char.hp.value}/${char.hp.max} | **Speed:** ${char.speed}
- **Senses:** ${char.senses.join(', ')}
- **Languages:** ${char.languages.join(', ')}

### Ability Scores
${abilitySummary}

---
[View on D&D Beyond](${ddbUrl})`;
}

export function formatMonsterStatBlock(monster: MonsterData, ddbUrl: string): string {
  const ab = monster.abilities;
  const abilitySummary = `| STR | DEX | CON | INT | WIS | CHA |\n| :---: | :---: | :---: | :---: | :---: | :---: |\n| ${ab.strength.score} (${ab.strength.modifier}) | ${ab.dexterity.score} (${ab.dexterity.modifier}) | ${ab.constitution.score} (${ab.constitution.modifier}) | ${ab.intelligence.score} (${ab.intelligence.modifier}) | ${ab.wisdom.score} (${ab.wisdom.modifier}) | ${ab.charisma.score} (${ab.charisma.modifier}) |`;

  const sections: string[] = [];

  if (monster.traits?.length) {
    sections.push(`### Traits\n` + monster.traits.map((t) => `**${t.name}.** ${t.description}`).join('\n\n'));
  }
  if (monster.actions?.length) {
    sections.push(`### Actions\n` + monster.actions.map((a) => `**${a.name}.** ${a.description}`).join('\n\n'));
  }
  if (monster.bonusActions?.length) {
    sections.push(`### Bonus Actions\n` + monster.bonusActions.map((b) => `**${b.name}.** ${b.description}`).join('\n\n'));
  }
  if (monster.reactions?.length) {
    sections.push(`### Reactions\n` + monster.reactions.map((r) => `**${r.name}.** ${r.description}`).join('\n\n'));
  }
  if (monster.legendaryActions?.length) {
    sections.push(`### Legendary Actions\n` + monster.legendaryActions.map((l) => `**${l.name}.** ${l.description}`).join('\n\n'));
  }

  const extraSections = sections.length ? '\n\n' + sections.join('\n\n') : '';

  return `# Stat Block

**${monster.size} ${monster.type}, ${monster.alignment}**

- **CR:** ${monster.cr} (${monster.xp} XP)
- **AC:** ${monster.ac.value}${monster.ac.formula ? ` (${monster.ac.formula})` : ''} | **HP:** ${monster.hp.value}${monster.hp.formula ? ` (${monster.hp.formula})` : ''} | **Speed:** ${monster.speed}
- **Senses:** ${monster.senses.join(', ')}
- **Languages:** ${monster.languages.join(', ')}

### Ability Scores
${abilitySummary}${extraSections}

---
[View on D&D Beyond](${ddbUrl})`;
}

export function formatItemDetails(item: ItemData, ddbUrl: string): string {
  const attunement = item.requiresAttunement
    ? `\n*Requires Attunement${item.attunementDescription ? ` (${item.attunementDescription})` : ''}*`
    : '';

  return `# Item Details

**${item.rarity ? `${item.rarity} ` : ''}${item.type}**${attunement}

${item.description}

---
[View on D&D Beyond](${ddbUrl})`;
}

/**
 * Merges a newly formatted stat block section into an existing description.
 * If `# Stat Block` (or `# Item Details`) is present, replaces everything up to the divider link.
 * If not present, prepends the new stat block and leaves all existing content intact.
 */
export function mergeStatBlockIntoDescription(
  existingDescription: string,
  newStatBlockSection: string,
  sectionHeader: '# Stat Block' | '# Item Details' = '# Stat Block'
): string {
  if (!existingDescription || !existingDescription.trim()) {
    return newStatBlockSection;
  }

  const normalized = existingDescription.replace(/\r\n/g, '\n');
  const headerRegex = new RegExp(`^\\s*${sectionHeader.replace('#', '#+')}\\b`, 'im');
  const headerMatch = headerRegex.exec(normalized);

  if (!headerMatch) {
    // No existing stat block: prepend new stat block before existing notes
    return `${newStatBlockSection}\n\n${normalized.trim()}`;
  }

  const headerIndex = headerMatch.index;

  // Search for the D&D Beyond URL divider link after the header
  const afterHeader = normalized.slice(headerIndex);
  const dividerRegex = /(?:---+\s*)?\[(?:View on )?D&D Beyond[^\]]*\]\(https?:\/\/[^\s)]+\)(?:\s*---+)?/i;
  const dividerMatch = dividerRegex.exec(afterHeader);

  if (dividerMatch) {
    // Found the divider! Keep everything before the header, and everything after the divider
    const beforeBlock = normalized.slice(0, headerIndex).trimEnd();
    const afterDivider = afterHeader.slice(dividerMatch.index + dividerMatch[0].length).trimStart();

    const parts = [
      beforeBlock,
      newStatBlockSection,
      afterDivider,
    ].filter(Boolean);

    return parts.join('\n\n');
  }

  // If header exists but no divider found yet, replace from header up to next major section or prepend
  return `${newStatBlockSection}\n\n${normalized.replace(headerRegex, '').trim()}`;
}

/**
 * Extracts only user notes/lore from an Archivist description, stripping out the D&D Beyond # Stat Block section.
 * This is used when syncing BACK to D&D Beyond Notes -> Backstory.
 */
export function extractUserNotesFromDescription(description: string): string {
  if (!description) return '';
  const normalized = description.replace(/\r\n/g, '\n');

  const headerRegex = /^\s*#+\s*Stat Block\b/im;
  const headerMatch = headerRegex.exec(normalized);
  if (!headerMatch) {
    return normalized.trim();
  }

  const afterHeader = normalized.slice(headerMatch.index);
  const dividerRegex = /(?:---+\s*)?\[(?:View on )?D&D Beyond[^\]]*\]\(https?:\/\/[^\s)]+\)(?:\s*---+)?/i;
  const dividerMatch = dividerRegex.exec(afterHeader);

  if (dividerMatch) {
    const afterDivider = afterHeader.slice(dividerMatch.index + dividerMatch[0].length).trim();
    return afterDivider;
  }

  return '';
}
